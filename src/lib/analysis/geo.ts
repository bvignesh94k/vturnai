/**
 * GEO analysis — generative engine readiness.
 *
 * The question this module answers is not "will this rank?" but "can a
 * generative engine understand who you are, believe what you say, and safely
 * quote you?" Those are different problems, and most sites fail the second and
 * third without ever noticing.
 */

import { findInSchema, type ExtractedPage } from "@/lib/crawler/extractor";
import { bandScore, booleanScore, composeGeoScore } from "@/lib/metrics/scores";
import type { ScoreComponent } from "@/lib/metrics/scores";
import { clamp, isRecord, round, unique } from "@/lib/utils";
import type { AnalysisIssue, AnalysisSuggestion } from "@/lib/analysis/types";

export interface GeoAnalysisInput {
  page: ExtractedPage;
  /** Site-wide signals, so a single page is not judged on facts that live elsewhere. */
  site: {
    hasOrganizationSchema: boolean;
    hasAboutPage: boolean;
    hasContactPage: boolean;
    sameAsUrls: readonly string[];
    entityConsistencyScore: number | null;
    aiCrawlersBlockedSiteWide: number;
    contactDetailsFound: boolean;
  };
}

export interface GeoAnalysisResult {
  score: number;
  components: ScoreComponent[];
  issues: AnalysisIssue[];
  suggestions: AnalysisSuggestion[];
  signals: {
    citationWorthyStatements: number;
    statisticCount: number;
    authoritativeSources: number;
    hasPersonSchema: boolean;
    hasOrganizationSchema: boolean;
    sameAsCount: number;
    isIndexable: boolean;
  };
}

/**
 * Count statements a generative engine could quote verbatim: specific,
 * checkable and not marketing language.
 */
export function countCitationWorthyStatements(page: ExtractedPage): number {
  const vagueMarketing =
    /\b(best[- ]in[- ]class|world[- ]class|cutting[- ]edge|state[- ]of[- ]the[- ]art|industry[- ]leading|revolutionary|seamless|synergy|unparalleled|game[- ]changing|next[- ]generation)\b/i;

  const candidates = unique([...page.statisticSentences, ...page.definitionSentences]);
  return candidates.filter((sentence) => !vagueMarketing.test(sentence)).length;
}

export function analysePageGeo(input: GeoAnalysisInput): GeoAnalysisResult {
  const { page, site } = input;
  const issues: AnalysisIssue[] = [];
  const suggestions: AnalysisSuggestion[] = [];

  const schemaLower = page.schemaTypes.map((type) => type.toLowerCase());
  const hasOrganizationSchema =
    site.hasOrganizationSchema ||
    schemaLower.some((type) => ["organization", "localbusiness", "corporation"].includes(type));
  const hasPersonSchema = schemaLower.includes("person");

  const orgNode = findInSchema(page.structuredData, (node) => {
    const type = node["@type"];
    const values = typeof type === "string" ? [type] : Array.isArray(type) ? type : [];
    return values.some(
      (value) =>
        typeof value === "string" &&
        ["organization", "localbusiness", "corporation"].includes(value.toLowerCase()),
    );
  });

  const sameAsFromSchema = (() => {
    const raw = orgNode?.["sameAs"];
    if (typeof raw === "string") return [raw];
    if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === "string");
    return [];
  })();
  const sameAsUrls = unique([...site.sameAsUrls, ...sameAsFromSchema]);

  const citationWorthy = countCitationWorthyStatements(page);

  // ---- Component scores ----------------------------------------------------
  const entityConsistency = site.entityConsistencyScore ?? (hasOrganizationSchema ? 70 : 40);

  const companyDescription = round(
    booleanScore(Boolean(page.metaDescription && page.metaDescription.length >= 70)) * 0.4 +
      booleanScore(page.definitionSentences.length > 0) * 0.6,
    1,
  );

  const offeringClarity = round(
    clamp(
      booleanScore(schemaLower.some((type) => ["product", "service", "offer", "offercatalog"].includes(type))) * 0.4 +
        bandScore(page.h2.length, 0, 5) * 0.3 +
        bandScore(page.listCount, 0, 3) * 0.3,
      0,
      100,
    ),
    1,
  );

  const citationWorthyScore = bandScore(citationWorthy, 0, 8);
  const originalData = bandScore(page.statisticSentences.length, 0, 6);
  const expertAuthorship = round(
    booleanScore(Boolean(page.authorName)) * 0.6 + booleanScore(hasPersonSchema) * 0.4,
    1,
  );
  const references = bandScore(page.authoritativeOutboundLinks.length, 0, 3);

  const pageStructure = round(
    clamp(
      booleanScore(page.h1.length === 1) * 0.35 +
        bandScore(page.h2.length, 0, 4) * 0.35 +
        booleanScore(page.tableCount > 0 || page.listCount > 1) * 0.3,
      0,
      100,
    ),
    1,
  );

  const organizationSchema = round(
    booleanScore(hasOrganizationSchema) * 0.7 + booleanScore(hasPersonSchema) * 0.3,
    1,
  );

  const sameAsScore = bandScore(sameAsUrls.length, 0, 3);

  const aboutContact = round(
    booleanScore(site.hasAboutPage) * 0.4 +
      booleanScore(site.hasContactPage) * 0.3 +
      booleanScore(site.contactDetailsFound) * 0.3,
    1,
  );

  const indexability = round(
    booleanScore(page.isIndexable) * 0.6 +
      clamp(100 - site.aiCrawlersBlockedSiteWide * 25, 0, 100) * 0.4,
    1,
  );

  const freshness = (() => {
    const reference = page.modifiedDate ?? page.publishedDate;
    if (!reference) return 25;
    const ageDays = (Date.now() - new Date(reference).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays)) return 25;
    if (ageDays <= 120) return 100;
    if (ageDays <= 365) return 70;
    if (ageDays <= 730) return 40;
    return 15;
  })();

  const comparisonUsefulness =
    page.contentClassification === "comparison"
      ? booleanScore(page.tableCount > 0, 100, 30)
      : page.tableCount > 0
        ? 80
        : 50;

  const composed = composeGeoScore(
    {
      entityConsistency,
      companyDescription,
      offeringClarity,
      citationWorthy: citationWorthyScore,
      originalData,
      expertAuthorship,
      references,
      pageStructure,
      organizationSchema,
      sameAs: sameAsScore,
      aboutContact,
      indexability,
      freshness,
      comparisonUsefulness,
    },
    {
      entityConsistency:
        site.entityConsistencyScore === null
          ? "Entity consistency is computed once the full site has been crawled."
          : `Entity consistency ${round(site.entityConsistencyScore, 0)}/100 across crawled pages.`,
      citationWorthy: `${citationWorthy} specific, checkable statement${citationWorthy === 1 ? "" : "s"} found.`,
      originalData: `${page.statisticSentences.length} statement${page.statisticSentences.length === 1 ? "" : "s"} contain figures.`,
      expertAuthorship: page.authorName
        ? `Author: ${page.authorName}${hasPersonSchema ? " (with Person schema)" : " (no Person schema)"}.`
        : "No author identified on this page.",
      references: `${page.authoritativeOutboundLinks.length} link${page.authoritativeOutboundLinks.length === 1 ? "" : "s"} to authoritative sources.`,
      organizationSchema: hasOrganizationSchema
        ? "Organization schema found."
        : "No Organization schema found.",
      sameAs: `${sameAsUrls.length} sameAs entity reference${sameAsUrls.length === 1 ? "" : "s"}.`,
      indexability:
        site.aiCrawlersBlockedSiteWide > 0
          ? `${site.aiCrawlersBlockedSiteWide} AI crawler(s) are blocked site-wide.`
          : "AI crawlers are not blocked in robots.txt.",
    },
  );

  // ---- Issues --------------------------------------------------------------
  if (!hasOrganizationSchema) {
    issues.push({
      code: "missing_organization_schema",
      title: "No Organization schema anywhere on the site",
      description:
        "There is no machine-readable statement of who the company is, what it is called, or where to verify it.",
      severity: "high",
      disciplines: ["geo", "seo"],
      whyItMatters:
        "Generative engines build an internal picture of your brand as an entity. Without Organization schema they have to infer it from prose, which is exactly where confusion with similarly named companies begins.",
      seoImpact: "No knowledge panel eligibility and weaker brand entity recognition.",
      aeoImpact: "Answer engines cannot confirm which company a page belongs to.",
      geoImpact: "Your brand is harder to identify, and therefore harder to recommend.",
      recommendation:
        "Add Organization schema to every page, including name, url, logo, description and sameAs links to your verified profiles.",
      implementationExample:
        '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Acme Technologies",\n  "url": "https://acme.com",\n  "logo": "https://acme.com/logo.png",\n  "description": "CRM software for Indian SMEs.",\n  "sameAs": [\n    "https://www.linkedin.com/company/acme",\n    "https://x.com/acme"\n  ]\n}\n</script>',
      effort: "easy",
      affectedUrls: [page.url],
    });
  }

  if (citationWorthy === 0 && page.wordCount > 300) {
    issues.push({
      code: "no_citation_worthy_statements",
      title: "Nothing on this page is specific enough to quote",
      description:
        "The page contains no checkable figures or plain definitions — only descriptive claims.",
      severity: "medium",
      disciplines: ["geo"],
      whyItMatters:
        "A generative engine cites what it can verify and repeat. Adjectives cannot be verified, so pages built from them are read and then discarded.",
      seoImpact: "Weaker differentiation against competitors covering the same topic.",
      aeoImpact: "No passage worth lifting as an answer.",
      geoImpact: "The page is very unlikely to be cited by any AI engine.",
      recommendation:
        "Replace at least three vague claims with specific ones: a number, a timeframe, a price, or a plainly worded definition.",
      implementationExample:
        "Instead of 'industry-leading onboarding', write 'Median onboarding time is 4 working days, measured across 312 customers onboarded in 2025.'",
      effort: "moderate",
      affectedUrls: [page.url],
    });
    suggestions.push({
      group: "must-fix",
      discipline: "geo",
      title: "Make three claims specific and checkable",
      detail:
        "Pick your three strongest marketing claims and rewrite each with a number, a date or a named source behind it.",
    });
  }

  if (sameAsUrls.length === 0) {
    suggestions.push({
      group: "high-impact",
      discipline: "geo",
      title: "Link your verified profiles with sameAs",
      detail:
        "sameAs tells engines that the company on your site is the same entity as your LinkedIn, Crunchbase or Wikipedia presence. It is the cheapest way to strengthen brand recognition.",
      example: '"sameAs": ["https://www.linkedin.com/company/acme", "https://www.crunchbase.com/organization/acme"]',
    });
  }

  if (!page.authorName && page.wordCount > 500) {
    suggestions.push({
      group: "high-impact",
      discipline: "geo",
      title: "Attribute this content to a named expert",
      detail:
        "Add a byline with the author's name and role, and mark it up with Person schema. Anonymous long-form content carries very little weight with generative engines.",
    });
  }

  if (page.authoritativeOutboundLinks.length === 0 && page.statisticSentences.length > 0) {
    suggestions.push({
      group: "high-impact",
      discipline: "geo",
      title: "Cite the source behind your figures",
      detail:
        "You state figures but link to nothing that supports them. An unsourced number is treated as an unverifiable claim.",
      example: 'According to <a href="https://www.rbi.org.in/...">RBI data</a>, digital payments grew 42% year on year.',
    });
  }

  if (!site.hasAboutPage) {
    suggestions.push({
      group: "high-impact",
      discipline: "geo",
      title: "Publish a complete About page",
      detail:
        "State what the company does, when it was founded, who runs it, and where it is based. This is the page engines read to decide whether you are a real business.",
    });
  }

  if (!page.isIndexable) {
    issues.push({
      code: "page_not_indexable_geo",
      title: "This page tells engines not to index it",
      description: "A noindex directive is present, so the page will not be used by search or answer engines.",
      severity: "critical",
      disciplines: ["geo", "seo"],
      whyItMatters: "No amount of content quality matters while the page is excluded.",
      seoImpact: "The page cannot rank.",
      aeoImpact: "The page cannot be used as an answer source.",
      geoImpact: "The page cannot be cited.",
      recommendation: "Remove the noindex directive if this page is meant to be found.",
      implementationExample: '<meta name="robots" content="index, follow" />',
      effort: "easy",
      affectedUrls: [page.url],
    });
  }

  return {
    score: composed.score,
    components: composed.components,
    issues,
    suggestions,
    signals: {
      citationWorthyStatements: citationWorthy,
      statisticCount: page.statisticSentences.length,
      authoritativeSources: page.authoritativeOutboundLinks.length,
      hasPersonSchema,
      hasOrganizationSchema,
      sameAsCount: sameAsUrls.length,
      isIndexable: page.isIndexable,
    },
  };
}

/** Read a string field out of a schema node, tolerating nested objects. */
export function schemaString(node: Record<string, unknown> | null, key: string): string | null {
  if (!node) return null;
  const value = node[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value) && typeof value["name"] === "string") return value["name"].trim();
  return null;
}
