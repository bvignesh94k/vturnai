import "server-only";

import { analysePageAeo } from "@/lib/analysis/aeo";
import { analysePageGeo } from "@/lib/analysis/geo";
import { analyseCitationReadiness } from "@/lib/analysis/citation-readiness";
import { extractPage } from "@/lib/crawler/extractor";
import { fetchRobotsTxt, detectBlockedAiCrawlers } from "@/lib/crawler/robots";
import { safeFetch } from "@/lib/crawler/fetcher";
import { composeHeoScore, composeSeoScore } from "@/lib/metrics/scores";
import { bandScore, booleanScore, passRateScore } from "@/lib/metrics/scores";
import { round } from "@/lib/utils";
import type { AnalysisSuggestion } from "@/lib/analysis/types";

/**
 * Free visibility check.
 *
 * A single-page analysis used by the public "Run Free Visibility Check" tool.
 * Deliberately limited to the homepage: it must be cheap, fast and impossible
 * to abuse, while still being genuinely useful rather than a teaser.
 */

export interface QuickCheckResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  title: string | null;
  metaDescription: string | null;
  scores: {
    vScore: number;
    seo: number;
    aeo: number;
    geo: number;
    citationReadiness: number;
  };
  signals: {
    wordCount: number;
    h1Count: number;
    questionHeadings: number;
    schemaTypes: string[];
    hasOrganizationSchema: boolean;
    hasFaqContent: boolean;
    tableCount: number;
    statisticCount: number;
    authorNamed: boolean;
    hasUpdatedDate: boolean;
    isIndexable: boolean;
    aiCrawlersBlocked: Array<{ agent: string; engine: string }>;
  };
  topFindings: Array<{ title: string; detail: string; severity: "critical" | "high" | "medium" | "low" }>;
  suggestions: AnalysisSuggestion[];
}

export async function runQuickCheck(siteUrl: string): Promise<QuickCheckResult> {
  const [response, robots] = await Promise.all([
    safeFetch(siteUrl, { timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024 }),
    fetchRobotsTxt(siteUrl).catch(() => null),
  ]);

  if (!response.ok) {
    throw new Error(`That page returned HTTP ${response.status}.`);
  }

  const page = extractPage(response.body, response.finalUrl, siteUrl);
  const blocked = robots ? detectBlockedAiCrawlers(robots, siteUrl).filter((entry) => entry.scope === "site") : [];

  const aeo = analysePageAeo(page);
  const geo = analysePageGeo({
    page,
    site: {
      hasOrganizationSchema: page.schemaTypes.some((type) =>
        ["organization", "localbusiness", "corporation"].includes(type.toLowerCase()),
      ),
      // A one-page check cannot see the rest of the site, so these are neutral
      // rather than assumed false — we would otherwise punish sites unfairly.
      hasAboutPage: true,
      hasContactPage: true,
      sameAsUrls: [],
      entityConsistencyScore: null,
      aiCrawlersBlockedSiteWide: blocked.length,
      contactDetailsFound: true,
    },
  });
  const citation = analyseCitationReadiness(page);

  const seo = composeSeoScore({
    indexability: booleanScore(page.isIndexable) * 0.7 + (response.finalUrl.startsWith("https://") ? 30 : 0),
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
    internalLinking: bandScore(page.internalLinkCount, 0, 20),
    media: page.imageCount === 0 ? 100 : (passRateScore(page.imageCount - page.imagesMissingAlt, page.imageCount) ?? 100),
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

  const findings: QuickCheckResult["topFindings"] = [];

  if (blocked.length > 0) {
    findings.push({
      title: `robots.txt blocks ${blocked.length} AI crawler${blocked.length === 1 ? "" : "s"}`,
      detail: `${blocked.map((entry) => entry.agent).join(", ")} cannot read this site, so the engines behind them cannot cite you.`,
      severity: "critical",
    });
  }
  if (!page.isIndexable) {
    findings.push({
      title: "This page is set to noindex",
      detail: "Search and answer engines are being told to ignore it entirely.",
      severity: "critical",
    });
  }
  if (!page.title) {
    findings.push({
      title: "No title tag",
      detail: "The strongest single on-page signal of what this page is about is missing.",
      severity: "critical",
    });
  }
  if (page.h1.length !== 1) {
    findings.push({
      title: page.h1.length === 0 ? "No H1 heading" : `${page.h1.length} H1 headings`,
      detail: "Exactly one H1 tells engines what the page is about. Zero or several leaves it ambiguous.",
      severity: "high",
    });
  }
  if (!page.schemaTypes.some((type) => ["organization", "localbusiness", "corporation"].includes(type.toLowerCase()))) {
    findings.push({
      title: "No Organization schema",
      detail: "There is no machine-readable statement of who this company is, so engines have to infer it from prose.",
      severity: "high",
    });
  }
  if (page.statisticSentences.length === 0) {
    findings.push({
      title: "No checkable facts to quote",
      detail: "Generative engines cite specific, verifiable statements. Adjectives cannot be verified.",
      severity: "medium",
    });
  }
  if (!page.authorName && page.wordCount > 400) {
    findings.push({
      title: "No named author",
      detail: "Anonymous content is discounted by both search and AI engines.",
      severity: "medium",
    });
  }
  if (page.questionHeadings.length === 0) {
    findings.push({
      title: "No question-style headings",
      detail: "Answer engines match a user's question to a heading before reading the body.",
      severity: "medium",
    });
  }

  return {
    url: siteUrl,
    finalUrl: response.finalUrl,
    fetchedAt: new Date().toISOString(),
    title: page.title,
    metaDescription: page.metaDescription,
    scores: {
      vScore: heo.vScore,
      seo: seo.score,
      aeo: aeo.score,
      geo: geo.score,
      citationReadiness: citation.score,
    },
    signals: {
      wordCount: page.wordCount,
      h1Count: page.h1.length,
      questionHeadings: page.questionHeadings.length,
      schemaTypes: page.schemaTypes,
      hasOrganizationSchema: page.schemaTypes.some((type) =>
        ["organization", "localbusiness", "corporation"].includes(type.toLowerCase()),
      ),
      hasFaqContent: page.hasFaqContent,
      tableCount: page.tableCount,
      statisticCount: page.statisticSentences.length,
      authorNamed: Boolean(page.authorName),
      hasUpdatedDate: Boolean(page.modifiedDate ?? page.publishedDate),
      isIndexable: page.isIndexable,
      aiCrawlersBlocked: blocked.map((entry) => ({ agent: entry.agent, engine: entry.engine })),
    },
    topFindings: findings.slice(0, 6),
    suggestions: [...aeo.suggestions, ...geo.suggestions].slice(0, 6),
  };
}
