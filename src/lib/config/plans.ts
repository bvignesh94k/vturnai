/**
 * Plan and quota definitions.
 *
 * These values are *defaults*. At runtime `resolvePlanLimits()` merges any
 * overrides stored in the `plan_configurations` table (managed from /admin), so
 * limits and pricing can be changed without a code deploy.
 */

export const PLAN_CODES = ["pro"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface PlanLimits {
  /** Number of website projects the account may create. */
  projects: number;
  /** Maximum URLs stored per crawl. */
  crawledUrls: number;
  /** Prompts that may be marked active for AI visibility tracking. */
  activePrompts: number;
  /** Competitors trackable per project. */
  competitors: number;
  /** Scheduled full AI visibility scans allowed per billing month. */
  scheduledAiScansPerMonth: number;
  /** Manual (user-triggered) AI visibility scans allowed per billing month. */
  manualAiScansPerMonth: number;
  /** Individual AI prompt executions allowed per billing month, across engines. */
  aiPromptExecutionsPerMonth: number;
  /** PageSpeed Insights calls allowed per billing month. */
  pagespeedRunsPerMonth: number;
  /** Reports that may be generated per billing month. */
  reportsPerMonth: number;
  /** Website audits (crawls) allowed per billing month. */
  websiteAuditsPerMonth: number;
}

export interface PlanFeatures {
  manualAudits: boolean;
  searchConsole: boolean;
  bingWebmaster: boolean;
  googleAnalytics: boolean;
  pagespeed: boolean;
  aiVisibility: boolean;
  competitorAnalysis: boolean;
  contentOptimizer: boolean;
  reports: boolean;
  apiAccess: boolean;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  /** Price in the smallest currency unit (paise). 49900 = ₹499. */
  priceMinor: number;
  currency: "INR";
  interval: "monthly";
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PRO_PLAN: PlanDefinition = {
  code: "pro",
  name: "V Turn AI Pro",
  description:
    "Everything an owner, freelancer or small agency needs to measure and improve visibility across search and AI answer engines.",
  priceMinor: 49900,
  currency: "INR",
  interval: "monthly",
  trialDays: 7,
  limits: {
    projects: 1,
    crawledUrls: 500,
    activePrompts: 25,
    competitors: 5,
    scheduledAiScansPerMonth: 2,
    manualAiScansPerMonth: 4,
    aiPromptExecutionsPerMonth: 900,
    pagespeedRunsPerMonth: 60,
    reportsPerMonth: 20,
    websiteAuditsPerMonth: 8,
  },
  features: {
    manualAudits: true,
    searchConsole: true,
    bingWebmaster: true,
    googleAnalytics: true,
    pagespeed: true,
    aiVisibility: true,
    competitorAnalysis: true,
    contentOptimizer: true,
    reports: true,
    apiAccess: false,
  },
};

export const PLANS: Record<PlanCode, PlanDefinition> = { pro: PRO_PLAN };

export const DEFAULT_PLAN_CODE: PlanCode = "pro";

/** Usage warning thresholds surfaced in the Billing page and notifications. */
export const USAGE_WARNING_THRESHOLDS = [80, 100] as const;

export type UsageMetric =
  | "pages_crawled"
  | "ai_prompt_executions"
  | "ai_engine_executions"
  | "pagespeed_checks"
  | "reports_generated"
  | "manual_scans"
  | "website_audits";

/** Maps a tracked usage metric onto the plan limit that caps it. */
export const USAGE_METRIC_LIMIT_KEY: Record<UsageMetric, keyof PlanLimits | null> = {
  pages_crawled: "crawledUrls",
  ai_prompt_executions: "aiPromptExecutionsPerMonth",
  ai_engine_executions: null,
  pagespeed_checks: "pagespeedRunsPerMonth",
  reports_generated: "reportsPerMonth",
  manual_scans: "manualAiScansPerMonth",
  website_audits: "websiteAuditsPerMonth",
};

export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
  pages_crawled: "Pages crawled",
  ai_prompt_executions: "AI prompt executions",
  ai_engine_executions: "AI engine executions",
  pagespeed_checks: "PageSpeed checks",
  reports_generated: "Reports generated",
  manual_scans: "Manual AI scans",
  website_audits: "Website audits",
};

/**
 * Merge admin-configured overrides on top of the compiled defaults. Unknown
 * keys are ignored, and any non-finite or negative value falls back to the
 * default so a bad admin edit cannot unlock unlimited spend.
 */
export function resolvePlanLimits(
  planCode: PlanCode,
  overrides?: Partial<Record<keyof PlanLimits, unknown>> | null,
): PlanLimits {
  const base = PLANS[planCode].limits;
  if (!overrides) return { ...base };
  const merged: PlanLimits = { ...base };
  for (const key of Object.keys(base) as Array<keyof PlanLimits>) {
    const candidate = overrides[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      merged[key] = Math.floor(candidate);
    }
  }
  return merged;
}

export function resolvePlanFeatures(
  planCode: PlanCode,
  overrides?: Partial<Record<keyof PlanFeatures, unknown>> | null,
): PlanFeatures {
  const base = PLANS[planCode].features;
  if (!overrides) return { ...base };
  const merged: PlanFeatures = { ...base };
  for (const key of Object.keys(base) as Array<keyof PlanFeatures>) {
    const candidate = overrides[key];
    if (typeof candidate === "boolean") merged[key] = candidate;
  }
  return merged;
}

export function resolvePlanPriceMinor(planCode: PlanCode, override?: unknown): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  return PLANS[planCode].priceMinor;
}

export function resolveTrialDays(planCode: PlanCode, override?: unknown): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return Math.floor(override);
  }
  return PLANS[planCode].trialDays;
}
