/**
 * Brand, domain and competitor detection inside AI answer text.
 *
 * This is the most consequential piece of the AI visibility pipeline: whether a
 * response "mentions" you decides every headline number. It is deliberately
 * conservative, a false positive inflates a customer's numbers and destroys
 * trust in the product, so ambiguous matches are rejected.
 */

import type { AICitation, AICompetitorMention, Sentiment } from "@/lib/ai-engines/types";
import { toRegistrableHost } from "@/lib/crawler/url";
import { unique } from "@/lib/utils";

/** Escape a string for safe use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the set of surface forms a brand may legitimately appear as.
 * "V Turn AI" should also match "VTurnAI" and "V-Turn AI", but must not match
 * an unrelated word that merely contains the letters.
 */
export function brandVariants(brand: string, aliases: readonly string[] = []): string[] {
  const seeds = [brand, ...aliases].map((value) => value.trim()).filter(Boolean);
  const variants = new Set<string>();

  for (const seed of seeds) {
    variants.add(seed);
    // Collapsed form: "V Turn AI" -> "VTurnAI"
    const collapsed = seed.replace(/[\s._-]+/g, "");
    if (collapsed.length >= 3) variants.add(collapsed);
    // Hyphenated form: "V Turn AI" -> "V-Turn-AI"
    if (/\s/.test(seed)) variants.add(seed.replace(/\s+/g, "-"));
    // Strip common corporate suffixes: "Acme Technologies Pvt Ltd" -> "Acme Technologies"
    const stripped = seed
      .replace(
        /\b(private\s+limited|pvt\.?\s*ltd\.?|pvt\.?|limited|ltd\.?|llp|llc|inc\.?|corp\.?|corporation|gmbh|s\.?a\.?|b\.?v\.?|co\.?)\b\.?/gi,
        "",
      )
      .replace(/\s{2,}/g, " ")
      .replace(/[,\s]+$/, "")
      .trim();
    if (stripped.length >= 3 && stripped.toLowerCase() !== seed.toLowerCase()) {
      variants.add(stripped);
    }
  }

  return [...variants]
    .filter((variant) => variant.length >= 2)
    .sort((a, b) => b.length - a.length);
}

/**
 * Match a brand name in text on word boundaries, tolerating internal
 * whitespace, hyphen and dot variation. Single-character brands are rejected
 * because they cannot be distinguished from ordinary prose.
 */
export function mentionsBrand(
  text: string,
  brand: string,
  aliases: readonly string[] = [],
): boolean {
  if (!text || !brand?.trim()) return false;
  for (const variant of brandVariants(brand, aliases)) {
    if (variant.length < 2) continue;
    const flexible = escapeRegExp(variant).replace(/\\?[\s._-]+/g, "[\\s._\\-]{0,2}");
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])`, "iu");
    if (pattern.test(text)) return true;
  }
  return false;
}

/** True when any citation points at the tracked domain (or a subdomain of it). */
export function citesDomain(citations: readonly AICitation[], domain: string): boolean {
  return citedUrlsForDomain(citations, domain).length > 0;
}

/** The subset of cited URLs that belong to the tracked domain. */
export function citedUrlsForDomain(
  citations: readonly AICitation[],
  domain: string,
): string[] {
  const target = toRegistrableHost(domain);
  if (!target) return [];
  const matches = citations
    .filter((citation) => {
      const host = toRegistrableHost(citation.domain || citation.url);
      if (!host) return false;
      return host === target || host.endsWith(`.${target}`);
    })
    .map((citation) => citation.url);
  return unique(matches);
}

/**
 * Phrases that signal an answer is actively recommending, rather than merely
 * listing, a brand. Matched within a window around the brand mention.
 */
const RECOMMENDATION_CUES: readonly RegExp[] = [
  /\b(?:i(?:'d| would)?\s+recommend|we\s+recommend|recommended?\b)/i,
  /\bbest\s+(?:choice|option|pick|overall|for)\b/i,
  /\btop\s+(?:choice|pick|recommendation)\b/i,
  /\b(?:my|our|the)\s+top\s+pick\b/i,
  /\bideal\s+(?:choice|for|if)\b/i,
  /\bwell[-\s]suited\b/i,
  /\bgo\s+with\b/i,
  /\bshould\s+(?:choose|consider|look\s+at|use|pick)\b/i,
  /\bstrong(?:est)?\s+(?:choice|option|candidate|fit)\b/i,
  /\bstands?\s+out\b/i,
  /\bworth\s+considering\b/i,
  /\bgreat\s+(?:fit|option|choice)\b/i,
  /\bexcellent\s+(?:fit|option|choice)\b/i,
  /\bif\s+you\s+(?:want|need|are)\b[^.]{0,80}\bchoose\b/i,
];

const NEGATION_CUES: readonly RegExp[] = [
  /\b(?:not|don't|do\s+not|avoid|wouldn't|would\s+not|rather\s+not|no\s+longer)\b/i,
];

/** Split text into sentences without depending on a heavyweight NLP library. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z(\d"'])|(?<=\n)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Sentences (plus bullet lines) that reference the brand. */
export function sentencesMentioning(
  text: string,
  brand: string,
  aliases: readonly string[] = [],
): string[] {
  const lines = text.split(/\n+/).flatMap((line) => splitSentences(line));
  return lines.filter((line) => mentionsBrand(line, brand, aliases));
}

/**
 * Detect an active recommendation. Requires a recommendation cue in a sentence
 * that also mentions the brand and is not negated, "I would not recommend X"
 * must never count as a recommendation.
 */
export function detectRecommendation(
  text: string,
  brand: string,
  aliases: readonly string[] = [],
): boolean {
  const relevant = sentencesMentioning(text, brand, aliases);
  if (relevant.length === 0) return false;
  return relevant.some((sentence) => {
    if (!RECOMMENDATION_CUES.some((cue) => cue.test(sentence))) return false;
    return !NEGATION_CUES.some((cue) => cue.test(sentence));
  });
}

const POSITIVE_TERMS: readonly RegExp[] = [
  /\bbest\b/i, /\bexcellent\b/i, /\bstrong\b/i, /\breliable\b/i, /\bpowerful\b/i,
  /\baffordable\b/i, /\bgreat\b/i, /\bpopular\b/i, /\btrusted\b/i, /\brobust\b/i,
  /\beasy\s+to\s+use\b/i, /\bwell[-\s]regarded\b/i, /\bhighly\s+rated\b/i, /\bvalue\s+for\s+money\b/i,
  /\bcomprehensive\b/i, /\bintuitive\b/i, /\bscalable\b/i, /\bleading\b/i,
];

const NEGATIVE_TERMS: readonly RegExp[] = [
  /\bexpensive\b/i, /\boutdated\b/i, /\blimited\b/i, /\bpoor\b/i, /\bslow\b/i,
  /\bconfusing\b/i, /\bunreliable\b/i, /\bcomplaints?\b/i, /\bdifficult\b/i,
  /\blacks?\b/i, /\bmissing\b/i, /\bbuggy\b/i, /\bclunky\b/i, /\bfrustrating\b/i,
  /\bnot\s+recommended\b/i, /\bavoid\b/i, /\bdrawbacks?\b/i, /\bdownsides?\b/i,
];

/**
 * Lexicon-based sentiment over the sentences that mention the brand.
 *
 * Deliberately simple and transparent: we would rather report "neutral" than
 * spend a model call producing a confident-sounding guess. Returns "unknown"
 * when the brand is not mentioned at all.
 */
export function detectSentiment(
  text: string,
  brand: string,
  aliases: readonly string[] = [],
): Sentiment {
  const relevant = sentencesMentioning(text, brand, aliases);
  if (relevant.length === 0) return "unknown";

  let positive = 0;
  let negative = 0;
  for (const sentence of relevant) {
    const negated = NEGATION_CUES.some((cue) => cue.test(sentence));
    const positiveHits = POSITIVE_TERMS.filter((term) => term.test(sentence)).length;
    const negativeHits = NEGATIVE_TERMS.filter((term) => term.test(sentence)).length;
    if (negated) {
      positive += negativeHits;
      negative += positiveHits;
    } else {
      positive += positiveHits;
      negative += negativeHits;
    }
  }

  if (positive === 0 && negative === 0) return "neutral";
  if (positive > 0 && negative > 0) {
    const ratio = positive / (positive + negative);
    if (ratio >= 0.75) return "positive";
    if (ratio <= 0.25) return "negative";
    return "mixed";
  }
  return positive > 0 ? "positive" : "negative";
}

/** Detect each tracked competitor's presence and recommendation status. */
export function detectCompetitorMentions(
  text: string,
  competitors: readonly string[],
): AICompetitorMention[] {
  return competitors
    .map((competitor) => competitor.trim())
    .filter(Boolean)
    .map((brand) => ({
      brand,
      mentioned: mentionsBrand(text, brand),
      recommended: detectRecommendation(text, brand),
    }));
}

export interface AnswerAnalysis {
  brandMentioned: boolean;
  domainCited: boolean;
  recommended: boolean;
  sentiment: Sentiment;
  competitorMentions: AICompetitorMention[];
  citedBrandUrls: string[];
}

/**
 * Run the full detection pass over one AI answer. Every provider adapter funnels
 * through this so detection is identical across engines.
 */
export function analyseAnswer(input: {
  answer: string;
  brand: string;
  domain: string;
  citations: readonly AICitation[];
  competitors?: readonly string[];
  brandAliases?: readonly string[];
}): AnswerAnalysis {
  const aliases = input.brandAliases ?? [];
  const citedBrandUrls = citedUrlsForDomain(input.citations, input.domain);
  return {
    brandMentioned: mentionsBrand(input.answer, input.brand, aliases),
    domainCited: citedBrandUrls.length > 0,
    recommended: detectRecommendation(input.answer, input.brand, aliases),
    sentiment: detectSentiment(input.answer, input.brand, aliases),
    competitorMentions: detectCompetitorMentions(input.answer, input.competitors ?? []),
    citedBrandUrls,
  };
}
