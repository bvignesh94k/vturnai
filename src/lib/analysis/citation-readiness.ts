/**
 * Citation Readiness — how likely one page is to be quoted or linked by an AI
 * engine.
 *
 * Scored per page, because citation is a page-level event. The output is
 * deliberately actionable: every low component maps to a specific thing the
 * author can add today.
 */

import type { ExtractedPage } from "@/lib/crawler/extractor";
import { bandScore, booleanScore, composeCitationReadinessScore } from "@/lib/metrics/scores";
import type { ScoreComponent } from "@/lib/metrics/scores";
import { round } from "@/lib/utils";
import { countCitationWorthyStatements } from "@/lib/analysis/geo";

export interface CitationReadinessResult {
  score: number;
  components: ScoreComponent[];
  recommendations: string[];
}

/**
 * Detect first-hand expertise markers. These are phrases that only someone who
 * did the work would write, and they are the clearest available proxy for the
 * "experience" part of E-E-A-T.
 */
const FIRST_PARTY_MARKERS: readonly RegExp[] = [
  /\bwe (?:tested|measured|analysed|analyzed|surveyed|built|ran|reviewed|tracked|interviewed)\b/i,
  /\bour (?:data|research|analysis|study|survey|testing|customers|clients|team found)\b/i,
  /\bin our (?:experience|testing|work with)\b/i,
  /\bacross \d+ (?:customers|clients|projects|accounts|sites|campaigns)\b/i,
  /\bbased on \d+\b/i,
  /\bwe found that\b/i,
];

const RESEARCH_MARKERS: readonly RegExp[] = [
  /\b(?:methodology|sample size|we surveyed|dataset|respondents|median|average of|standard deviation|margin of error)\b/i,
  /\bbetween \w+ \d{4} and \w+ \d{4}\b/i,
];

export function analyseCitationReadiness(page: ExtractedPage): CitationReadinessResult {
  const text = page.contentText;

  const firstPartyHits = FIRST_PARTY_MARKERS.filter((pattern) => pattern.test(text)).length;
  const researchHits = RESEARCH_MARKERS.filter((pattern) => pattern.test(text)).length;
  const citationWorthy = countCitationWorthyStatements(page);

  const values: Record<string, number> = {
    factualStatements: bandScore(citationWorthy, 0, 8),
    uniqueInformation: bandScore(firstPartyHits + page.statisticSentences.length / 2, 0, 4),
    statistics: bandScore(page.statisticSentences.length, 0, 6),
    research: bandScore(researchHits, 0, 2),
    sources: bandScore(page.authoritativeOutboundLinks.length, 0, 3),
    author: booleanScore(Boolean(page.authorName)),
    lastUpdated: booleanScore(Boolean(page.modifiedDate ?? page.publishedDate)),
    definitions: bandScore(page.definitionSentences.length, 0, 3),
    tables: booleanScore(page.tableCount > 0),
    faqs: bandScore(page.faqPairs.length, 0, 3),
    structuredData: bandScore(page.schemaTypes.length, 0, 3),
    entityClarity: round(
      booleanScore(page.h1.length === 1) * 0.5 + booleanScore(Boolean(page.title)) * 0.5,
      1,
    ),
    originalExpertise: bandScore(firstPartyHits, 0, 3),
  };

  const composed = composeCitationReadinessScore(values, {
    factualStatements: `${citationWorthy} specific, checkable statement${citationWorthy === 1 ? "" : "s"}.`,
    statistics: `${page.statisticSentences.length} statement${page.statisticSentences.length === 1 ? "" : "s"} contain figures.`,
    sources: `${page.authoritativeOutboundLinks.length} authoritative source${page.authoritativeOutboundLinks.length === 1 ? "" : "s"} cited.`,
    author: page.authorName ? `Author: ${page.authorName}.` : "No named author.",
    lastUpdated: page.modifiedDate
      ? `Last modified ${new Date(page.modifiedDate).toISOString().slice(0, 10)}.`
      : page.publishedDate
        ? `Published ${new Date(page.publishedDate).toISOString().slice(0, 10)}.`
        : "No published or updated date found.",
    originalExpertise: `${firstPartyHits} first-hand expertise marker${firstPartyHits === 1 ? "" : "s"} detected.`,
    research: `${researchHits} research methodology marker${researchHits === 1 ? "" : "s"} detected.`,
  });

  // Turn the weakest components into named actions, best-first.
  const recommendations = composed.components
    .filter((component) => component.weight > 0 && component.score < 55)
    .sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))
    .slice(0, 6)
    .map((component) => CITATION_ACTIONS[component.key] ?? `Improve: ${component.label}.`);

  return { score: composed.score, components: composed.components, recommendations };
}

const CITATION_ACTIONS: Record<string, string> = {
  factualStatements:
    "Rewrite three descriptive claims as specific, checkable statements — a number, a timeframe or a named source.",
  uniqueInformation:
    "Publish something only you can know: an internal benchmark, an aggregate from your own customer base, or a result you measured.",
  statistics: "Add at least three concrete figures with units and the period they cover.",
  research:
    "Describe how you got your numbers — sample size, time period and method. One short methodology note is enough.",
  sources:
    "Link the primary source behind each external claim. Government, academic and original-research domains carry the most weight.",
  author: "Add a named author with a role and one line of relevant credentials.",
  lastUpdated:
    "Show a visible last-updated date, and update it only when the content genuinely changes.",
  definitions: "Define the page's main term in one plain sentence near the top.",
  tables: "Add a table for any comparison, specification or pricing detail currently written as prose.",
  faqs: "Add three real follow-up questions with short answers, visible on the page.",
  structuredData:
    "Add structured data matching the page type — Article, Product, Service or FAQPage — alongside Organization schema.",
  entityClarity: "Make the title and single H1 name the subject explicitly, including the brand where relevant.",
  originalExpertise:
    "Write from first-hand experience: what you tried, what happened, and what you would do differently.",
};
