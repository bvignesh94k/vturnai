import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireActiveBilling, BillingRequiredError } from "@/lib/billing/entitlements";
import { analysePageAeo } from "@/lib/analysis/aeo";
import { analysePageGeo } from "@/lib/analysis/geo";
import { analyseCitationReadiness } from "@/lib/analysis/citation-readiness";
import { extractPage } from "@/lib/crawler/extractor";
import { safeFetch, FetchFailedError } from "@/lib/crawler/fetcher";
import { normalizeSiteUrl } from "@/lib/crawler/url";
import { bandScore, booleanScore, composeHeoScore, composeSeoScore, passRateScore } from "@/lib/metrics/scores";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import { BlockedRequestError } from "@/lib/security/ssrf";
import { contentAnalysisSchema } from "@/lib/validation/schemas";
import { round, truncate } from "@/lib/utils";
import { logger, errorMessage } from "@/lib/logger";

const log = logger.child("content-analysis");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Content optimizer analysis.
 *
 * Accepts either a URL to fetch or draft content pasted by the user. Draft
 * content is wrapped in minimal HTML so the same extractor and analyzers run
 * over both inputs, which keeps the scores directly comparable.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = contentAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Provide a URL or paste your content." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", parsed.data.projectId)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    await requireActiveBilling(project.organization_id);
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    throw error;
  }

  const limit = await consumeRateLimit(RATE_LIMITS.contentAnalysis, user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You are analysing content very quickly. Try again shortly." },
      { status: 429 },
    );
  }

  try {
    let html: string;
    let pageUrl: string;

    if (parsed.data.url) {
      const normalized = normalizeSiteUrl(parsed.data.url);
      if (!normalized) return NextResponse.json({ error: "That URL is not valid." }, { status: 400 });
      const response = await safeFetch(normalized, { timeoutMs: 15_000 });
      if (!response.ok) {
        return NextResponse.json(
          { error: `That page returned HTTP ${response.status}.` },
          { status: 502 },
        );
      }
      html = response.body;
      pageUrl = response.finalUrl;
    } else {
      // Draft content: build a minimal document so extraction behaves the same.
      const title = parsed.data.title?.trim() ?? "Draft";
      const content = parsed.data.content ?? "";
      const looksLikeHtml = /<\/?(p|h[1-6]|ul|ol|table|div|section|article)\b/i.test(content);
      const bodyHtml = looksLikeHtml
        ? content
        : content
            .split(/\n{2,}/)
            .map((block) => {
              const trimmed = block.trim();
              if (!trimmed) return "";
              const heading = /^#{1,6}\s+/.exec(trimmed);
              if (heading) {
                const level = Math.min(6, heading[0].trim().length);
                return `<h${level}>${escapeHtml(trimmed.replace(/^#{1,6}\s+/, ""))}</h${level}>`;
              }
              return `<p>${escapeHtml(trimmed)}</p>`;
            })
            .join("\n");

      pageUrl = project.site_url;
      html = `<!doctype html><html lang="${project.primary_language}"><head><title>${escapeHtml(title)}</title></head><body><main>${bodyHtml}</main></body></html>`;
    }

    const page = extractPage(html, pageUrl, project.site_url);

    const aeo = analysePageAeo(page);
    const geo = analysePageGeo({
      page,
      site: {
        hasOrganizationSchema: page.schemaTypes.some((type) =>
          ["organization", "localbusiness", "corporation"].includes(type.toLowerCase()),
        ),
        hasAboutPage: true,
        hasContactPage: true,
        sameAsUrls: [],
        entityConsistencyScore: null,
        aiCrawlersBlockedSiteWide: 0,
        contactDetailsFound: true,
      },
    });
    const citation = analyseCitationReadiness(page);

    const seo = composeSeoScore({
      indexability: booleanScore(page.isIndexable) * 0.7 + (pageUrl.startsWith("https://") ? 30 : 0),
      metadata: round(
        booleanScore(Boolean(page.title) && page.titleLength >= 30 && page.titleLength <= 60, 100, 45) * 0.6 +
          booleanScore(
            Boolean(page.metaDescription) &&
              page.metaDescriptionLength >= 70 &&
              page.metaDescriptionLength <= 160,
            100,
            40,
          ) *
            0.4,
        1,
      ),
      structure: booleanScore(page.h1.length === 1, 100, page.h1.length === 0 ? 0 : 40),
      contentDepth: bandScore(page.wordCount, 100, 900),
      internalLinking: bandScore(page.internalLinkCount, 0, 12),
      media:
        page.imageCount === 0
          ? 100
          : (passRateScore(page.imageCount - page.imagesMissingAlt, page.imageCount) ?? 100),
      performance: null,
    });

    const heo = composeHeoScore({
      seo: seo.score,
      aeo: aeo.score,
      geo: geo.score,
      experienceAuthority: round(
        booleanScore(Boolean(page.authorName)) * 0.4 +
          booleanScore(Boolean(page.modifiedDate ?? page.publishedDate)) * 0.3 +
          bandScore(page.authoritativeOutboundLinks.length, 0, 2) * 0.3,
        1,
      ),
    });

    return NextResponse.json(
      {
        result: {
          url: parsed.data.url ? pageUrl : null,
          scores: {
            vScore: heo.vScore,
            seo: seo.score,
            aeo: aeo.score,
            geo: geo.score,
            citationReadiness: citation.score,
          },
          formula: heo.formula,
          breakdown: {
            seo: seo.components,
            aeo: aeo.components,
            geo: geo.components,
            citationReadiness: citation.components,
          },
          signals: {
            title: page.title,
            titleLength: page.titleLength,
            metaDescription: page.metaDescription,
            metaDescriptionLength: page.metaDescriptionLength,
            h1: page.h1,
            wordCount: page.wordCount,
            questionHeadings: page.questionHeadings,
            directAnswers: page.directAnswerParagraphs.length,
            faqPairs: page.faqPairs.length,
            tables: page.tableCount,
            lists: page.listCount,
            statistics: page.statisticSentences.length,
            definitions: page.definitionSentences.length,
            schemaTypes: page.schemaTypes,
            authorName: page.authorName,
            authoritativeSources: page.authoritativeOutboundLinks,
            internalLinks: page.internalLinkCount,
          },
          suggestions: [...aeo.suggestions, ...geo.suggestions],
          citationRecommendations: citation.recommendations,
          issues: [...aeo.issues, ...geo.issues].map((issue) => ({
            title: issue.title,
            severity: issue.severity,
            recommendation: issue.recommendation,
            implementationExample: issue.implementationExample,
          })),
          proposals: buildProposals(page, project.brand_name),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof BlockedRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof FetchFailedError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    log.warn("Content analysis failed", { error });
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Copyable starting points, never applied automatically.
 *
 * These are suggestions the user can take or ignore, the product does not
 * rewrite anyone's content for them.
 */
function buildProposals(
  page: ReturnType<typeof extractPage>,
  brandName: string,
): Array<{ label: string; value: string; note: string }> {
  const subject = page.h1[0] ?? page.title ?? "this page";
  const proposals: Array<{ label: string; value: string; note: string }> = [];

  if (!page.title || page.titleLength < 30 || page.titleLength > 60) {
    proposals.push({
      label: "Title tag",
      value: `${truncate(subject, 45)} | ${brandName}`,
      note: "Aim for 30–60 characters with the specific topic first and the brand last.",
    });
  }

  if (!page.metaDescription || page.metaDescriptionLength < 70) {
    proposals.push({
      label: "Meta description",
      value: `${truncate(subject, 60)}: what it is, who it is for, and what it costs. Written for ${brandName} customers.`,
      note: "Replace with the real benefit in 70–160 characters. This is a shape, not finished copy.",
    });
  }

  if (page.h1.length !== 1) {
    proposals.push({
      label: "H1",
      value: `<h1>${truncate(subject, 70)}</h1>`,
      note: "Use exactly one H1 that states the page's subject in plain language.",
    });
  }

  if (page.questionHeadings.length === 0) {
    proposals.push({
      label: "Question heading + direct answer",
      value: `<h2>How much does ${truncate(subject, 40)} cost?</h2>\n<p>Write a 40–70 word answer here that stands completely on its own. State the number, what it includes, and the one condition that changes it. A reader who sees only this paragraph should get a complete, correct answer.</p>`,
      note: "Answer engines match a question to a heading, then quote the passage beneath it.",
    });
  }

  if (page.faqPairs.length === 0) {
    proposals.push({
      label: "FAQ block",
      value: `<h2>Frequently asked questions</h2>\n<h3>How long does it take?</h3>\n<p>Answer in one or two sentences.</p>\n<h3>What does it include?</h3>\n<p>Answer in one or two sentences.</p>`,
      note: "Publish the questions visibly. Only add FAQPage schema once this content is on the page.",
    });
  }

  if (!page.schemaTypes.some((type) => type.toLowerCase() === "organization")) {
    proposals.push({
      label: "Organization schema",
      value: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${brandName}",\n  "url": "https://yourdomain.com",\n  "description": "One sentence describing what you do and who for.",\n  "sameAs": ["https://www.linkedin.com/company/your-company"]\n}\n</script>`,
      note: "Add this sitewide so engines can identify your brand as an entity.",
    });
  }

  return proposals;
}
