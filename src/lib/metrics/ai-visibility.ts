/**
 * AI visibility metric calculations.
 *
 * Every metric here has one definition, stated once, used everywhere — the
 * dashboard, the reports and the API all call these functions. "Valid" always
 * means a response the engine actually returned; failed or skipped runs are
 * excluded from both numerator and denominator so an outage cannot look like a
 * visibility collapse.
 */

import { percentage, round, unique } from "@/lib/utils";
import type { Sentiment } from "@/lib/ai-engines/types";

/** The minimal shape a stored AI run must expose to be measurable. */
export interface MeasurableRun {
  engineId: string;
  promptId: string;
  /** False for runs that errored, timed out, or were skipped. */
  valid: boolean;
  brandMentioned: boolean;
  domainCited: boolean;
  recommended: boolean;
  sentiment: Sentiment;
  citedUrls: string[];
  competitorMentions: Array<{ brand: string; mentioned: boolean; recommended: boolean }>;
}

export function validRuns(runs: readonly MeasurableRun[]): MeasurableRun[] {
  return runs.filter((run) => run.valid);
}

/**
 * Mention Rate — valid AI responses containing the tracked brand, divided by
 * total valid responses.
 */
export function mentionRate(runs: readonly MeasurableRun[]): number {
  const valid = validRuns(runs);
  return percentage(valid.filter((run) => run.brandMentioned).length, valid.length);
}

/**
 * Citation Rate — valid AI responses citing the tracked domain, divided by
 * total valid responses.
 */
export function citationRate(runs: readonly MeasurableRun[]): number {
  const valid = validRuns(runs);
  return percentage(valid.filter((run) => run.domainCited).length, valid.length);
}

/**
 * Recommendation Rate — responses that actively recommend the brand, divided by
 * valid responses.
 */
export function recommendationRate(runs: readonly MeasurableRun[]): number {
  const valid = validRuns(runs);
  return percentage(valid.filter((run) => run.recommended).length, valid.length);
}

/**
 * Prompt Coverage — the share of tracked prompts where the brand appears at
 * least once on any engine.
 *
 * `totalTrackedPrompts` is passed explicitly so prompts that produced no valid
 * run at all (for example every engine failed) are still counted as tracked but
 * uncovered — that is the honest reading for the user.
 */
export function promptCoverage(
  runs: readonly MeasurableRun[],
  totalTrackedPrompts?: number,
): number {
  const valid = validRuns(runs);
  const executedPrompts = unique(valid.map((run) => run.promptId));
  const denominator = totalTrackedPrompts ?? executedPrompts.length;
  if (denominator <= 0) return 0;
  const covered = executedPrompts.filter((promptId) =>
    valid.some((run) => run.promptId === promptId && run.brandMentioned),
  );
  return percentage(covered.length, denominator);
}

/**
 * AI Share of Voice — tracked brand mentions divided by mentions of the tracked
 * brand plus all tracked competitors.
 */
export function shareOfVoice(runs: readonly MeasurableRun[]): number {
  const valid = validRuns(runs);
  const brandMentions = valid.filter((run) => run.brandMentioned).length;
  const competitorMentions = valid.reduce(
    (total, run) => total + run.competitorMentions.filter((mention) => mention.mentioned).length,
    0,
  );
  return percentage(brandMentions, brandMentions + competitorMentions);
}

/** Per-competitor share of voice, including the tracked brand for comparison. */
export function shareOfVoiceBreakdown(
  runs: readonly MeasurableRun[],
  brandName: string,
): Array<{ brand: string; mentions: number; share: number; isTrackedBrand: boolean }> {
  const valid = validRuns(runs);
  const counts = new Map<string, number>();
  const brandMentions = valid.filter((run) => run.brandMentioned).length;
  counts.set(brandName, brandMentions);

  for (const run of valid) {
    for (const mention of run.competitorMentions) {
      if (!mention.mentioned) continue;
      counts.set(mention.brand, (counts.get(mention.brand) ?? 0) + 1);
    }
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [...counts.entries()]
    .map(([brand, mentions]) => ({
      brand,
      mentions,
      share: percentage(mentions, total),
      isTrackedBrand: brand === brandName,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

/**
 * Engine Consistency — for a given prompt, the percentage of monitored engines
 * that mention the brand; averaged across all prompts that produced valid runs.
 */
export function engineConsistency(runs: readonly MeasurableRun[]): number {
  const valid = validRuns(runs);
  const promptIds = unique(valid.map((run) => run.promptId));
  if (promptIds.length === 0) return 0;

  const perPrompt = promptIds.map((promptId) => {
    const promptRuns = valid.filter((run) => run.promptId === promptId);
    const engines = unique(promptRuns.map((run) => run.engineId));
    const mentioningEngines = unique(
      promptRuns.filter((run) => run.brandMentioned).map((run) => run.engineId),
    );
    return percentage(mentioningEngines.length, engines.length);
  });

  return round(perPrompt.reduce((sum, value) => sum + value, 0) / perPrompt.length, 1);
}

/**
 * Citation Diversity — the number of distinct URLs on the tracked domain that
 * AI engines have cited.
 */
export function citationDiversity(runs: readonly MeasurableRun[]): number {
  const valid = validRuns(runs);
  const urls = new Set<string>();
  for (const run of valid) {
    for (const url of run.citedUrls) urls.add(url);
  }
  return urls.size;
}

export interface EngineVisibilityRow {
  engineId: string;
  validResponses: number;
  failedResponses: number;
  mentions: number;
  citations: number;
  recommendations: number;
  mentionRate: number;
  citationRate: number;
  recommendationRate: number;
  /** 0–100 composite used for the engine grid's Visibility Score column. */
  visibilityScore: number;
  sentiment: Sentiment;
  lastCheckedAt: string | null;
}

const ENGINE_VISIBILITY_WEIGHTS = {
  mention: 0.4,
  citation: 0.35,
  recommendation: 0.25,
} as const;

/**
 * A per-engine visibility score. Mention is the entry ticket, citation proves
 * the engine trusted a page, recommendation is what actually converts — so the
 * three are weighted rather than averaged flat.
 */
export function engineVisibilityScore(input: {
  mentionRate: number;
  citationRate: number;
  recommendationRate: number;
}): number {
  return round(
    input.mentionRate * ENGINE_VISIBILITY_WEIGHTS.mention +
      input.citationRate * ENGINE_VISIBILITY_WEIGHTS.citation +
      input.recommendationRate * ENGINE_VISIBILITY_WEIGHTS.recommendation,
    1,
  );
}

/** Aggregate the sentiment of a set of runs into one label. */
export function aggregateSentiment(runs: readonly MeasurableRun[]): Sentiment {
  const mentioned = validRuns(runs).filter((run) => run.brandMentioned);
  if (mentioned.length === 0) return "unknown";
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  for (const run of mentioned) {
    if (run.sentiment === "positive") positive += 1;
    else if (run.sentiment === "negative") negative += 1;
    else if (run.sentiment === "mixed") {
      positive += 0.5;
      negative += 0.5;
    } else neutral += 1;
  }
  const total = positive + negative + neutral;
  if (total === 0) return "unknown";
  if (positive / total >= 0.6) return "positive";
  if (negative / total >= 0.4) return "negative";
  if (positive > 0 && negative > 0) return "mixed";
  return "neutral";
}

/** Build the AI Engine Visibility grid rows the dashboard renders. */
export function buildEngineRows(
  runs: readonly MeasurableRun[],
  engineIds: readonly string[],
  lastCheckedByEngine: Readonly<Record<string, string | null>> = {},
): EngineVisibilityRow[] {
  return engineIds.map((engineId) => {
    const engineRuns = runs.filter((run) => run.engineId === engineId);
    const valid = validRuns(engineRuns);
    const mentions = valid.filter((run) => run.brandMentioned).length;
    const citations = valid.filter((run) => run.domainCited).length;
    const recommendations = valid.filter((run) => run.recommended).length;
    const rates = {
      mentionRate: percentage(mentions, valid.length),
      citationRate: percentage(citations, valid.length),
      recommendationRate: percentage(recommendations, valid.length),
    };
    return {
      engineId,
      validResponses: valid.length,
      failedResponses: engineRuns.length - valid.length,
      mentions,
      citations,
      recommendations,
      ...rates,
      visibilityScore: engineVisibilityScore(rates),
      sentiment: aggregateSentiment(engineRuns),
      lastCheckedAt: lastCheckedByEngine[engineId] ?? null,
    };
  });
}

export interface AIVisibilitySummary {
  validResponses: number;
  totalResponses: number;
  mentionRate: number;
  citationRate: number;
  recommendationRate: number;
  promptCoverage: number;
  shareOfVoice: number;
  engineConsistency: number;
  citationDiversity: number;
  /** 0–100 headline AI visibility score used in trends and the KPI strip. */
  aiVisibilityScore: number;
  sentiment: Sentiment;
}

export function summariseAiVisibility(
  runs: readonly MeasurableRun[],
  totalTrackedPrompts?: number,
): AIVisibilitySummary {
  const valid = validRuns(runs);
  const rates = {
    mentionRate: mentionRate(runs),
    citationRate: citationRate(runs),
    recommendationRate: recommendationRate(runs),
  };
  return {
    validResponses: valid.length,
    totalResponses: runs.length,
    ...rates,
    promptCoverage: promptCoverage(runs, totalTrackedPrompts),
    shareOfVoice: shareOfVoice(runs),
    engineConsistency: engineConsistency(runs),
    citationDiversity: citationDiversity(runs),
    aiVisibilityScore: engineVisibilityScore(rates),
    sentiment: aggregateSentiment(runs),
  };
}

/** Percentage-point change between two periods, or null when there is no baseline. */
export function delta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  return round(current - previous, 1);
}
