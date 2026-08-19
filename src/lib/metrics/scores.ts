/**
 * Score composition.
 *
 * The rule: a score is only ever produced by combining named components with
 * weights taken from `@/lib/config/scoring`, and the resulting object always
 * carries the breakdown that produced it. The UI renders that breakdown, so the
 * user can see exactly how the number was reached.
 */

import {
  AEO_WEIGHTS,
  CITATION_READINESS_WEIGHTS,
  EXPERIENCE_AUTHORITY_WEIGHTS,
  GEO_WEIGHTS,
  HEO_WEIGHTS,
  SEO_WEIGHTS,
  type WeightedComponent,
} from "@/lib/config/scoring";
import { clamp, round } from "@/lib/utils";

export interface ScoreComponent {
  key: string;
  label: string;
  description: string;
  /** 0–100 raw component score. */
  score: number;
  weight: number;
  /** score × weight, i.e. the points this component contributed. */
  contribution: number;
  /** Optional evidence rendered under the component in the breakdown UI. */
  detail?: string;
}

export interface CompositeScore {
  score: number;
  components: ScoreComponent[];
}

/**
 * Combine raw 0–100 component scores using a weight table.
 *
 * Components with no measurement (value `null`) are excluded and the remaining
 * weights are renormalised, so a site with no PageSpeed data is not punished
 * for a measurement we never took.
 */
export function composeScore(
  weights: readonly WeightedComponent[],
  values: Readonly<Record<string, number | null | undefined>>,
  details: Readonly<Record<string, string>> = {},
): CompositeScore {
  const measured = weights.filter((component) => {
    const value = values[component.key];
    return typeof value === "number" && Number.isFinite(value);
  });

  if (measured.length === 0) {
    return {
      score: 0,
      components: weights.map((component) => ({
        key: component.key,
        label: component.label,
        description: component.description,
        score: 0,
        weight: 0,
        contribution: 0,
        detail: details[component.key] ?? "Not measured",
      })),
    };
  }

  const weightTotal = measured.reduce((sum, component) => sum + component.weight, 0);
  const components: ScoreComponent[] = weights.map((component) => {
    const raw = values[component.key];
    const hasValue = typeof raw === "number" && Number.isFinite(raw);
    const normalisedWeight = hasValue ? component.weight / weightTotal : 0;
    const score = hasValue ? clamp(raw, 0, 100) : 0;
    const entry: ScoreComponent = {
      key: component.key,
      label: component.label,
      description: component.description,
      score: round(score, 1),
      weight: round(normalisedWeight, 4),
      contribution: round(score * normalisedWeight, 2),
    };
    const detail = details[component.key] ?? (hasValue ? undefined : "Not measured");
    if (detail !== undefined) entry.detail = detail;
    return entry;
  });

  const total = components.reduce((sum, component) => sum + component.contribution, 0);
  return { score: round(clamp(total, 0, 100), 1), components };
}

export const composeSeoScore = (
  values: Readonly<Record<string, number | null | undefined>>,
  details?: Readonly<Record<string, string>>,
) => composeScore(SEO_WEIGHTS, values, details);

export const composeAeoScore = (
  values: Readonly<Record<string, number | null | undefined>>,
  details?: Readonly<Record<string, string>>,
) => composeScore(AEO_WEIGHTS, values, details);

export const composeGeoScore = (
  values: Readonly<Record<string, number | null | undefined>>,
  details?: Readonly<Record<string, string>>,
) => composeScore(GEO_WEIGHTS, values, details);

export const composeExperienceAuthorityScore = (
  values: Readonly<Record<string, number | null | undefined>>,
  details?: Readonly<Record<string, string>>,
) => composeScore(EXPERIENCE_AUTHORITY_WEIGHTS, values, details);

export const composeCitationReadinessScore = (
  values: Readonly<Record<string, number | null | undefined>>,
  details?: Readonly<Record<string, string>>,
) => composeScore(CITATION_READINESS_WEIGHTS, values, details);

export interface HeoInput {
  seo: number;
  aeo: number;
  geo: number;
  experienceAuthority: number;
}

export interface HeoScore extends CompositeScore {
  /** Alias used across the UI. The V Score and the HEO score are the same value. */
  vScore: number;
  formula: string;
}

/**
 * HEO — the unified V Score. Weights come from `HEO_WEIGHTS` and the formula
 * string is generated from them so the displayed explanation can never drift
 * from the arithmetic.
 */
export function composeHeoScore(input: HeoInput): HeoScore {
  const entries: Array<{ key: keyof HeoInput; label: string; description: string }> = [
    {
      key: "seo",
      label: "SEO",
      description: "How well classic search engines can crawl, understand and rank your pages.",
    },
    {
      key: "aeo",
      label: "AEO",
      description: "How ready your content is to be lifted as a direct answer.",
    },
    {
      key: "geo",
      label: "GEO",
      description: "How easily generative engines can understand, trust and cite you.",
    },
    {
      key: "experienceAuthority",
      label: "Experience & Authority",
      description: "Evidence that identifiable experts stand behind the content.",
    },
  ];

  const components: ScoreComponent[] = entries.map(({ key, label, description }) => {
    const weight = HEO_WEIGHTS[key];
    const score = round(clamp(input[key], 0, 100), 1);
    return {
      key,
      label,
      description,
      score,
      weight,
      contribution: round(score * weight, 2),
    };
  });

  const total = round(
    clamp(
      components.reduce((sum, component) => sum + component.contribution, 0),
      0,
      100,
    ),
    1,
  );

  const formula = components
    .map((component) => `${component.label} ${Math.round(component.weight * 100)}%`)
    .join(" + ");

  return { score: total, vScore: total, components, formula };
}

/**
 * Convert a count of issues weighted by severity into a 0–100 health score.
 * Used by the SEO analyzer to turn issue volume into a component score.
 */
export function issuePenaltyScore(input: {
  totalItems: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
}): number {
  const total = Math.max(1, input.totalItems);
  const penalty =
    ((input.critical ?? 0) * 4 + (input.high ?? 0) * 2.5 + (input.medium ?? 0) * 1.2 + (input.low ?? 0) * 0.4) /
    total;
  return round(clamp(100 - penalty * 100, 0, 100), 1);
}

/** Turn a ratio of "pages that pass a check" into a 0–100 component score. */
export function passRateScore(passing: number, total: number): number | null {
  if (total <= 0) return null;
  return round(clamp((passing / total) * 100, 0, 100), 1);
}

/** Map a boolean signal to a score, used pervasively by the AEO/GEO analyzers. */
export function booleanScore(value: boolean, whenTrue = 100, whenFalse = 0): number {
  return value ? whenTrue : whenFalse;
}

/**
 * Score a value against a target band. Returns 100 at or above `ideal`, 0 at or
 * below `floor`, and interpolates between.
 */
export function bandScore(value: number, floor: number, ideal: number): number {
  if (ideal === floor) return value >= ideal ? 100 : 0;
  return round(clamp(((value - floor) / (ideal - floor)) * 100, 0, 100), 1);
}
