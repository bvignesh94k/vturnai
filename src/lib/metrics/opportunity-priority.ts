/**
 * Opportunity prioritisation.
 *
 * The product's central promise is that a user is never shown 500 undifferentiated
 * errors. This formula decides what appears first: a Critical issue affecting the
 * homepage outranks 200 missing alt attributes, even though the alt attributes
 * are more numerous.
 */

import {
  EFFORT_SCORES,
  OPPORTUNITY_PRIORITY_WEIGHTS,
  SEVERITY_SCORES,
  type EffortLevel,
  type IssueSeverity,
} from "@/lib/config/scoring";
import { clamp, round } from "@/lib/utils";

export interface PriorityInput {
  severity: IssueSeverity;
  /** 0–100 — how much fixing this is expected to move visibility. */
  visibilityImpact: number;
  affectedPages: number;
  /** Total pages in the crawl, used to scale `affectedPages` fairly. */
  totalPages: number;
  effort: EffortLevel;
  /** Search Console impressions attached to the affected URLs, when connected. */
  trafficPotential?: number | null;
  /** 0–100 — how much this unlocks prompts the brand is currently absent from. */
  aiPromptOpportunity?: number | null;
}

export interface PriorityBreakdown {
  score: number;
  components: Array<{ key: string; label: string; weight: number; value: number; contribution: number }>;
}

/**
 * Scale a raw page count into 0–100. Uses a logarithmic curve so the difference
 * between 1 and 10 affected pages matters far more than between 200 and 300.
 */
export function affectedPagesScore(affectedPages: number, totalPages: number): number {
  if (affectedPages <= 0) return 0;
  const share = totalPages > 0 ? affectedPages / totalPages : 0;
  const shareComponent = clamp(share * 100, 0, 100);
  const volumeComponent = clamp((Math.log10(affectedPages + 1) / Math.log10(101)) * 100, 0, 100);
  return round(shareComponent * 0.5 + volumeComponent * 0.5, 1);
}

/** Scale monthly impressions into 0–100 on a log curve (10k impressions ≈ 100). */
export function trafficPotentialScore(impressions: number | null | undefined): number | null {
  if (impressions === null || impressions === undefined) return null;
  if (impressions <= 0) return 0;
  return round(clamp((Math.log10(impressions + 1) / Math.log10(10001)) * 100, 0, 100), 1);
}

/**
 * Compute the 0–100 priority score plus the breakdown that produced it.
 *
 * Components with no data (no Search Console connection, no AI runs yet) are
 * dropped and the remaining weights renormalised, so an unconnected account
 * still gets a sensible ordering.
 */
export function calculatePriority(input: PriorityInput): PriorityBreakdown {
  const traffic = trafficPotentialScore(input.trafficPotential);
  const aiOpportunity =
    input.aiPromptOpportunity === null || input.aiPromptOpportunity === undefined
      ? null
      : clamp(input.aiPromptOpportunity, 0, 100);

  const raw: Array<{ key: string; label: string; weight: number; value: number | null }> = [
    {
      key: "severity",
      label: "Severity",
      weight: OPPORTUNITY_PRIORITY_WEIGHTS.severity,
      value: SEVERITY_SCORES[input.severity],
    },
    {
      key: "visibilityImpact",
      label: "Visibility impact",
      weight: OPPORTUNITY_PRIORITY_WEIGHTS.visibilityImpact,
      value: clamp(input.visibilityImpact, 0, 100),
    },
    {
      key: "affectedPages",
      label: "Pages affected",
      weight: OPPORTUNITY_PRIORITY_WEIGHTS.affectedPages,
      value: affectedPagesScore(input.affectedPages, input.totalPages),
    },
    {
      key: "trafficPotential",
      label: "Traffic potential",
      weight: OPPORTUNITY_PRIORITY_WEIGHTS.trafficPotential,
      value: traffic,
    },
    {
      key: "aiPromptOpportunity",
      label: "AI prompt opportunity",
      weight: OPPORTUNITY_PRIORITY_WEIGHTS.aiPromptOpportunity,
      value: aiOpportunity,
    },
    {
      key: "effort",
      label: "Ease of implementation",
      weight: OPPORTUNITY_PRIORITY_WEIGHTS.effort,
      value: EFFORT_SCORES[input.effort],
    },
  ];

  const measured = raw.filter((entry): entry is typeof entry & { value: number } => entry.value !== null);
  const weightTotal = measured.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  const components = measured.map((entry) => {
    const weight = round(entry.weight / weightTotal, 4);
    return {
      key: entry.key,
      label: entry.label,
      weight,
      value: round(entry.value, 1),
      contribution: round(entry.value * weight, 2),
    };
  });

  const score = round(
    clamp(
      components.reduce((sum, component) => sum + component.contribution, 0),
      0,
      100,
    ),
    1,
  );

  return { score, components };
}

export type PriorityBand = "urgent" | "high" | "medium" | "low";

export function priorityBand(score: number): PriorityBand {
  if (score >= 78) return "urgent";
  if (score >= 58) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export const PRIORITY_BAND_LABELS: Record<PriorityBand, string> = {
  urgent: "Do first",
  high: "High impact",
  medium: "Worth doing",
  low: "Nice to have",
};
