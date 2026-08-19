/**
 * AEO analysis — is this page usable as a direct answer?
 *
 * Answer surfaces quote one short passage. This module scores how ready a page
 * is to be that passage, and produces concrete, copyable suggestions rather
 * than generic advice.
 */

import { averageAnswerLength, countWords, type ExtractedPage } from "@/lib/crawler/extractor";
import { bandScore, booleanScore, composeAeoScore } from "@/lib/metrics/scores";
import type { ScoreComponent } from "@/lib/metrics/scores";
import { clamp, percentage, round, truncate } from "@/lib/utils";
import type { AnalysisIssue, AnalysisSuggestion } from "@/lib/analysis/types";

/** The window where an answer is long enough to be complete and short enough to quote. */
export const IDEAL_ANSWER_MIN_WORDS = 40;
export const IDEAL_ANSWER_MAX_WORDS = 70;

export interface AeoAnalysisResult {
  score: number;
  components: ScoreComponent[];
  issues: AnalysisIssue[];
  suggestions: AnalysisSuggestion[];
  signals: {
    questionHeadings: number;
    answeredQuestions: number;
    directAnswers: number;
    averageAnswerWords: number;
    definitions: number;
    faqPairs: number;
    tables: number;
    lists: number;
    schemaTypes: string[];
    hasFaqSchema: boolean;
    faqSchemaWithoutContent: boolean;
  };
}

const AEO_SCHEMA_TYPES = [
  "faqpage",
  "howto",
  "qapage",
  "article",
  "blogposting",
  "product",
  "service",
  "breadcrumblist",
  "webpage",
];

/** How many question headings have a usable answer immediately beneath them. */
function countAnsweredQuestions(page: ExtractedPage): number {
  if (page.questionHeadings.length === 0) return 0;
  // A question is treated as answered when the page carries at least as many
  // quotable paragraphs as it has questions, plus explicit FAQ pairs.
  const available = page.directAnswerParagraphs.length + page.faqPairs.length;
  return Math.min(page.questionHeadings.length, available);
}

export function analysePageAeo(page: ExtractedPage): AeoAnalysisResult {
  const issues: AnalysisIssue[] = [];
  const suggestions: AnalysisSuggestion[] = [];

  const answeredQuestions = countAnsweredQuestions(page);
  const averageAnswerWords = averageAnswerLength(page);
  const schemaTypesLower = page.schemaTypes.map((type) => type.toLowerCase());
  const hasFaqSchema = schemaTypesLower.includes("faqpage");
  const faqSchemaWithoutContent = hasFaqSchema && page.faqPairs.length === 0;
  const relevantSchema = schemaTypesLower.filter((type) => AEO_SCHEMA_TYPES.includes(type));

  // ---- Component scores ----------------------------------------------------
  const questionTargeting = bandScore(page.questionHeadings.length, 0, 4);
  const directAnswers =
    page.questionHeadings.length === 0
      ? bandScore(page.directAnswerParagraphs.length, 0, 3)
      : percentage(answeredQuestions, page.questionHeadings.length);

  const definitionClarity = bandScore(page.definitionSentences.length, 0, 3);

  const headingStructure = round(
    booleanScore(page.h1.length === 1) * 0.5 +
      booleanScore(page.h2.length >= 2) * 0.3 +
      booleanScore(page.h3.length === 0 || page.h2.length > 0) * 0.2,
    1,
  );

  const faqUsefulness = bandScore(page.faqPairs.length, 0, 4);
  const schemaScore = clamp(relevantSchema.length * 34, 0, 100);
  const listsScore = bandScore(page.listCount, 0, 3);
  const tablesScore = page.tableCount > 0 ? 100 : page.contentClassification === "comparison" ? 0 : 40;

  const conciseness =
    averageAnswerWords === 0
      ? 0
      : averageAnswerWords >= IDEAL_ANSWER_MIN_WORDS && averageAnswerWords <= IDEAL_ANSWER_MAX_WORDS
        ? 100
        : averageAnswerWords < IDEAL_ANSWER_MIN_WORDS
          ? bandScore(averageAnswerWords, 10, IDEAL_ANSWER_MIN_WORDS)
          : clamp(100 - (averageAnswerWords - IDEAL_ANSWER_MAX_WORDS) * 2, 0, 100);

  const entityClarity = round(
    booleanScore(Boolean(page.title)) * 0.3 +
      booleanScore(page.h1.length === 1) * 0.3 +
      booleanScore(schemaTypesLower.some((type) => ["organization", "person", "product", "service", "localbusiness"].includes(type))) * 0.4,
    1,
  );

  const semanticCompleteness = round(
    clamp(
      bandScore(page.wordCount, 150, 1200) * 0.6 + bandScore(page.h2.length, 0, 6) * 0.4,
      0,
      100,
    ),
    1,
  );

  const evidence = round(
    clamp(bandScore(page.statisticSentences.length, 0, 5) * 0.6 + bandScore(page.authoritativeOutboundLinks.length, 0, 2) * 0.4, 0, 100),
    1,
  );

  const authorInfo = booleanScore(Boolean(page.authorName));

  const freshness = (() => {
    const reference = page.modifiedDate ?? page.publishedDate;
    if (!reference) return 0;
    const ageDays = (Date.now() - new Date(reference).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays)) return 0;
    if (ageDays <= 180) return 100;
    if (ageDays <= 365) return 75;
    if (ageDays <= 730) return 45;
    return 20;
  })();

  const contextualLinks = bandScore(page.internalLinkCount, 0, 8);

  const composed = composeAeoScore(
    {
      questionTargeting,
      directAnswers,
      definitionClarity,
      headingStructure,
      faqUsefulness,
      schema: schemaScore,
      lists: listsScore,
      tables: tablesScore,
      conciseness,
      entityClarity,
      semanticCompleteness,
      evidence,
      authorInfo,
      freshness,
      contextualLinks,
    },
    {
      questionTargeting: `${page.questionHeadings.length} question-style heading${page.questionHeadings.length === 1 ? "" : "s"}.`,
      directAnswers: `${answeredQuestions} of ${page.questionHeadings.length || "—"} questions have a quotable answer beneath them.`,
      faqUsefulness: `${page.faqPairs.length} visible FAQ pair${page.faqPairs.length === 1 ? "" : "s"}.`,
      schema: relevantSchema.length > 0 ? `Schema found: ${relevantSchema.join(", ")}.` : "No answer-relevant schema found.",
      conciseness:
        averageAnswerWords === 0
          ? "No self-contained answer paragraphs found."
          : `Average answer length ${averageAnswerWords} words (ideal ${IDEAL_ANSWER_MIN_WORDS}–${IDEAL_ANSWER_MAX_WORDS}).`,
      evidence: `${page.statisticSentences.length} statements contain figures; ${page.authoritativeOutboundLinks.length} authoritative sources cited.`,
      authorInfo: page.authorName ? `Author: ${page.authorName}.` : "No author identified.",
    },
  );

  // ---- Issues and suggestions ---------------------------------------------
  if (page.questionHeadings.length === 0 && page.wordCount > 300) {
    suggestions.push({
      group: "high-impact",
      discipline: "aeo",
      title: "Phrase at least three headings as the questions people actually ask",
      detail:
        "Answer engines match a user's question to a heading before they read the body. Headings written as labels ('Features', 'Benefits') give them nothing to match.",
      example: `<h2>How much does ${truncate(page.title ?? "this", 40)} cost?</h2>`,
    });
  }

  if (page.questionHeadings.length > 0 && answeredQuestions < page.questionHeadings.length) {
    const unanswered = page.questionHeadings.length - answeredQuestions;
    issues.push({
      code: "unanswered_questions",
      title: `${unanswered} question heading${unanswered === 1 ? "" : "s"} have no concise answer below them`,
      description:
        "The page asks a question in a heading but the text underneath does not answer it in a self-contained way.",
      severity: "medium",
      disciplines: ["aeo"],
      whyItMatters:
        "An answer engine lifts one passage. If the passage under your question needs the rest of the page to make sense, it will not be used.",
      seoImpact: "Reduced chance of winning a featured snippet.",
      aeoImpact: "The page is skipped when an engine looks for a quotable answer.",
      geoImpact: "Nothing on the page is easy for a generative engine to quote.",
      recommendation: `Add a ${IDEAL_ANSWER_MIN_WORDS}–${IDEAL_ANSWER_MAX_WORDS} word answer immediately beneath each question heading, before any supporting detail.`,
      implementationExample:
        "<h2>How long does onboarding take?</h2>\n<p>Onboarding takes three to five working days for a standard setup. That covers data import, user accounts and one training session. Larger migrations with custom fields typically take two weeks.</p>",
      effort: "easy",
      affectedUrls: [page.url],
    });
    suggestions.push({
      group: "must-fix",
      discipline: "aeo",
      title: `Add a concise ${IDEAL_ANSWER_MIN_WORDS} to ${IDEAL_ANSWER_MAX_WORDS} word answer beneath each question`,
      detail:
        "Write the answer so it stands alone. Someone reading only that paragraph, with no other context, should get a complete and correct answer.",
    });
  }

  if (averageAnswerWords > IDEAL_ANSWER_MAX_WORDS + 20 && page.directAnswerParagraphs.length > 0) {
    suggestions.push({
      group: "high-impact",
      discipline: "aeo",
      title: "Shorten your answer paragraphs",
      detail: `Your answer paragraphs average ${averageAnswerWords} words. Lead with a ${IDEAL_ANSWER_MIN_WORDS}–${IDEAL_ANSWER_MAX_WORDS} word answer, then expand below it.`,
    });
  }

  if (page.tableCount === 0 && (page.contentClassification === "comparison" || page.contentClassification === "pricing")) {
    issues.push({
      code: "missing_comparison_table",
      title: "A comparison page with no comparison table",
      description: "This page compares options or lists pricing but contains no table.",
      severity: "medium",
      disciplines: ["aeo", "geo"],
      whyItMatters:
        "Tables are the single most extractable format on the web. A comparison written as prose is far less likely to be reused than the same facts in a table.",
      seoImpact: "Reduced eligibility for table-based rich results.",
      aeoImpact: "Answer engines cannot lift a structured comparison from prose.",
      geoImpact: "Generative engines quote tables readily and paraphrase prose reluctantly.",
      recommendation: "Add a comparison table with one row per option and columns for the factors buyers weigh.",
      implementationExample:
        "| Plan | Price | Websites | AI prompts |\n| --- | --- | --- | --- |\n| Pro | ₹499/month | 1 | 25 |",
      effort: "easy",
      affectedUrls: [page.url],
    });
    suggestions.push({
      group: "high-impact",
      discipline: "aeo",
      title: "Add a comparison table",
      detail: "One row per option, columns for the two or three factors that actually decide the purchase.",
    });
  }

  if (faqSchemaWithoutContent) {
    issues.push({
      code: "faq_schema_without_content",
      title: "FAQ schema is present but no FAQ content is visible on the page",
      description: "The page declares FAQPage structured data without matching visible questions and answers.",
      severity: "high",
      disciplines: ["aeo", "seo"],
      whyItMatters:
        "Schema that does not describe visible content is treated as spam. It can cost you rich results across the whole site, not just this page.",
      seoImpact: "Risk of a structured data manual action and loss of rich results.",
      aeoImpact: "Answer engines discount schema they cannot verify against the page.",
      geoImpact: "Undermines the credibility of your other structured data.",
      recommendation:
        "Either publish the questions and answers visibly on the page, or remove the FAQPage schema.",
      implementationExample:
        "Add the same questions as <h3> headings with their answers in <p> tags directly below, matching the schema exactly.",
      effort: "easy",
      affectedUrls: [page.url],
    });
  }

  if (page.definitionSentences.length === 0 && page.wordCount > 400) {
    suggestions.push({
      group: "enhancement",
      discipline: "aeo",
      title: "Define the main term before discussing its benefits",
      detail:
        "Engines look for a plain definition sentence to anchor what a page is about. Give them one in the first two paragraphs.",
      example: "A CRM is software that stores every customer conversation in one place so a sales team can follow up reliably.",
    });
  }

  if (page.statisticSentences.length === 0 && page.wordCount > 400) {
    suggestions.push({
      group: "enhancement",
      discipline: "aeo",
      title: "Support your claims with a primary source",
      detail:
        "A claim with a number and a source is quotable. The same claim without either is not. Add at least one supported figure per major section.",
    });
  }

  if (!page.authorName && ["blog", "guide", "case-study", "comparison"].includes(page.contentClassification)) {
    suggestions.push({
      group: "high-impact",
      discipline: "aeo",
      title: "Attach a named author with a short bio",
      detail:
        "Editorial content without an author is discounted by both search and AI engines. A name, a role and one line of credentials is enough.",
    });
  }

  return {
    score: composed.score,
    components: composed.components,
    issues,
    suggestions,
    signals: {
      questionHeadings: page.questionHeadings.length,
      answeredQuestions,
      directAnswers: page.directAnswerParagraphs.length,
      averageAnswerWords,
      definitions: page.definitionSentences.length,
      faqPairs: page.faqPairs.length,
      tables: page.tableCount,
      lists: page.listCount,
      schemaTypes: page.schemaTypes,
      hasFaqSchema,
      faqSchemaWithoutContent,
    },
  };
}

/** Site-level AEO score: the average of page scores, weighted toward key pages. */
export function aggregateAeoScores(
  pageResults: ReadonlyArray<{ classification: string; score: number }>,
): number {
  if (pageResults.length === 0) return 0;
  const weightFor = (classification: string): number => {
    if (classification === "homepage") return 3;
    if (["pricing", "product", "service", "comparison"].includes(classification)) return 2;
    if (["legal", "category"].includes(classification)) return 0.5;
    return 1;
  };
  const totalWeight = pageResults.reduce((sum, entry) => sum + weightFor(entry.classification), 0);
  if (totalWeight === 0) return 0;
  const weighted = pageResults.reduce(
    (sum, entry) => sum + entry.score * weightFor(entry.classification),
    0,
  );
  return round(weighted / totalWeight, 1);
}

export { countWords };
