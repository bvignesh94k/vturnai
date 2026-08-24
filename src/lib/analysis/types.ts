/**
 * Shared analysis types.
 *
 * Every issue the product raises carries the full explanation set, what it is,
 * why it matters, its impact on each discipline, the exact recommendation, a
 * copyable implementation example and an honest effort estimate. A finding
 * without all of that is not actionable, and this type makes that non-optional.
 */

import type { DisciplineKey } from "@/lib/config/site";
import type { EffortLevel, IssueSeverity } from "@/lib/config/scoring";
import type { ScoreComponent } from "@/lib/metrics/scores";

export interface AnalysisIssue {
  /** Stable machine code, e.g. "missing_title". Used for grouping and dedupe. */
  code: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  disciplines: DisciplineKey[];
  whyItMatters: string;
  seoImpact: string | null;
  aeoImpact: string | null;
  geoImpact: string | null;
  recommendation: string;
  implementationExample: string | null;
  effort: EffortLevel;
  /** URLs exhibiting the issue. Empty for site-level findings. */
  affectedUrls: string[];
  evidence?: Record<string, unknown>;
}

export interface PageAnalysisResult {
  url: string;
  seo: { score: number; components: ScoreComponent[] };
  aeo: { score: number; components: ScoreComponent[] };
  geo: { score: number; components: ScoreComponent[] };
  experienceAuthority: { score: number; components: ScoreComponent[] };
  heo: { score: number; components: ScoreComponent[]; formula: string };
  citationReadiness: { score: number; components: ScoreComponent[] };
  issues: AnalysisIssue[];
  suggestions: AnalysisSuggestion[];
}

export type SuggestionGroup = "must-fix" | "high-impact" | "enhancement";

export interface AnalysisSuggestion {
  group: SuggestionGroup;
  discipline: DisciplineKey;
  title: string;
  detail: string;
  /** Ready-to-use text or markup the user can copy. */
  example?: string;
}

export const SUGGESTION_GROUP_LABELS: Record<SuggestionGroup, string> = {
  "must-fix": "Must Fix",
  "high-impact": "High Impact",
  enhancement: "Enhancements",
};
