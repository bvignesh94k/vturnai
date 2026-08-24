import "server-only";

import { generatePromptSuggestions } from "@/lib/ai-engines/prompt-suggestions";
import { analysePageAeo } from "@/lib/analysis/aeo";
import { analysePageGeo } from "@/lib/analysis/geo";
import { analyseCitationReadiness } from "@/lib/analysis/citation-readiness";
import { extractPage } from "@/lib/crawler/extractor";
import { fetchRobotsTxt, detectBlockedAiCrawlers } from "@/lib/crawler/robots";
import { safeFetch } from "@/lib/crawler/fetcher";
import { toRegistrableHost } from "@/lib/crawler/url";
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
  /**
   * Neutral category questions we would put to the answer engines on this
   * brand's behalf. Generated, never executed — see `runQuickCheck`.
   */
  aiPrompts: string[];
  suggestions: AnalysisSuggestion[];
}

/**
 * ccTLD to country code. Used only to decide whether a country-specific prompt
 * can be shown honestly: a generic TLD says nothing about where a business
 * sells, so those prompts are dropped rather than guessed at.
 */
const CC_TLD_COUNTRIES: Record<string, string> = {
  in: "IN", uk: "GB", au: "AU", ca: "CA", sg: "SG", ae: "AE", us: "US",
  de: "DE", fr: "FR", nl: "NL", es: "ES", it: "IT", jp: "JP", br: "BR",
};

/** Resolves to no real country, so prompts that use it are recognisable. */
const UNKNOWN_COUNTRY = "ZZ";

function countryFromHost(host: string | null): string | null {
  if (!host) return null;
  return CC_TLD_COUNTRIES[host.split(".").pop() ?? ""] ?? null;
}

/** "stripe.com" gives "Stripe" — a seed for generation, never shown to anyone. */
function brandSeedFromHost(host: string | null): string {
  if (!host) return "this brand";
  const label = host.split(".")[0] ?? host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * A short category phrase for prompt generation, read from the title tag.
 *
 * Left to itself the generator falls back to the first H2, which on a marketing
 * homepage is a slogan — Stripe's produced "Who provides the backbone of global
 * commerce?", a question no buyer has ever typed. The title is the one element
 * almost every site uses to say what it actually sells, so we take the longest
 * brand-separated segment, cut it at the first connective, and keep the head
 * noun phrase. Returns null when nothing usable survives, which puts the
 * generator back on its own fallback rather than inventing a category.
 */
const TITLE_CONNECTIVES = /\b(to|that|for|with|and|which|where|helping|built|made)\b/i;

export function categoryFromPage(title: string | null): string | null {
  if (!title) return null;

  const segment = title
    .split(/[|·—–:]/)
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).length > 1)
    .sort((a, b) => b.length - a.length)[0];
  if (!segment) return null;

  const head = segment.split(TITLE_CONNECTIVES)[0] ?? segment;
  const ARTICLES = new Set(["the", "a", "an", "your", "our"]);
  const words = head
    .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5);
  // "The AI workspace" would otherwise become "Which the ai workspace should…".
  while (words.length > 1 && ARTICLES.has(words[0].toLowerCase())) words.shift();
  words.splice(4);

  const phrase = words.join(" ");
  if (phrase.length < 6 || phrase.length > 42) return null;
  // Guard against a segment that is only filler, which would read as nonsense.
  if (!words.some((word) => word.length > 3)) return null;
  return phrase.toLowerCase();
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

  // The question a visitor actually arrived with is "does ChatGPT name me when
  // someone asks for this?" — so the check ends by showing the exact questions
  // we would ask on their behalf. `generatePromptSuggestions` is pure and
  // synchronous, so this costs no API call and cannot be abused for spend on an
  // unauthenticated endpoint. The answers are what a trial buys.
  const host = toRegistrableHost(response.finalUrl);
  const brandSeed = brandSeedFromHost(host);
  const inferredCountry = countryFromHost(host);
  const aiPrompts = generatePromptSuggestions({
    brandName: brandSeed,
    businessCategory: categoryFromPage(page.title),
    businessDescription: page.metaDescription,
    // A country we merely guessed from a generic TLD would put a false claim in
    // front of the visitor, so instead of guessing we pass a code that resolves
    // to no real country and drop every prompt that echoes it back.
    targetCountry: inferredCountry ?? UNKNOWN_COUNTRY,
    targetAudience: null,
    competitors: [],
    pages: [page],
  })
    // Only two sources are trustworthy from a single page. The category
    // templates, which are built from the title we resolved above, and question
    // headings, which the page already poses in the visitor's own words. The
    // "services" source reads H2s, and on a marketing homepage those are
    // slogans — it produced "Who provides the backbone of global commerce?",
    // a question no buyer has ever typed.
    .filter((suggestion) => {
      if (suggestion.source === "business_description") return true;
      // A heading only earns a place if it is genuinely a question. The
      // extractor is lenient enough to pass fragments like "What's happening",
      // which reads as a bug when quoted back as something a buyer would ask.
      return (
        suggestion.source === "headings" &&
        suggestion.promptText.trim().endsWith("?") &&
        suggestion.promptText.trim().length >= 20
      );
    })
    .map((suggestion) => suggestion.promptText)
    // A brand name inferred from the domain label is the other thing worth
    // dropping — "Vturnu" for vturnu.com reads as a typo of the visitor's own
    // name. What survives is the category questions, which are the ones that
    // make the point anyway: they never name you, so whether you show up in the
    // answer is the actual measurement.
    .filter((text) => inferredCountry !== null || !text.includes(UNKNOWN_COUNTRY))
    .filter((text) => !text.includes(brandSeed))
    .slice(0, 4);

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
    aiPrompts,
    suggestions: [...aeo.suggestions, ...geo.suggestions].slice(0, 6),
  };
}
