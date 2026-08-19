/**
 * Usage and quota arithmetic.
 *
 * Kept pure so it can be unit tested and reused by the Billing page, the
 * enforcement guard and the admin console without a database round trip.
 */

import {
  USAGE_METRIC_LABELS,
  USAGE_METRIC_LIMIT_KEY,
  USAGE_WARNING_THRESHOLDS,
  type PlanLimits,
  type UsageMetric,
} from "@/lib/config/plans";
import { clamp, percentage } from "@/lib/utils";

export interface UsageLine {
  metric: UsageMetric;
  label: string;
  used: number;
  limit: number | null;
  /** 0–100. Null when the metric is uncapped. */
  percentUsed: number | null;
  remaining: number | null
  state: "ok" | "warning" | "exhausted" | "uncapped";
}

export function usageState(used: number, limit: number | null): UsageLine["state"] {
  if (limit === null) return "uncapped";
  if (limit <= 0) return "exhausted";
  const pct = (used / limit) * 100;
  if (pct >= 100) return "exhausted";
  if (pct >= USAGE_WARNING_THRESHOLDS[0]) return "warning";
  return "ok";
}

export function buildUsageLine(
  metric: UsageMetric,
  used: number,
  limits: PlanLimits,
): UsageLine {
  const limitKey = USAGE_METRIC_LIMIT_KEY[metric];
  const limit = limitKey ? limits[limitKey] : null;
  const safeUsed = Math.max(0, Math.floor(used));
  return {
    metric,
    label: USAGE_METRIC_LABELS[metric],
    used: safeUsed,
    limit,
    percentUsed: limit === null ? null : clamp(percentage(safeUsed, limit), 0, 999),
    remaining: limit === null ? null : Math.max(0, limit - safeUsed),
    state: usageState(safeUsed, limit),
  };
}

export function buildUsageReport(
  usedByMetric: Readonly<Partial<Record<UsageMetric, number>>>,
  limits: PlanLimits,
): UsageLine[] {
  return (Object.keys(USAGE_METRIC_LABELS) as UsageMetric[]).map((metric) =>
    buildUsageLine(metric, usedByMetric[metric] ?? 0, limits),
  );
}

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  /** Message shown to the user when the request is refused. */
  reason?: string;
}

/**
 * Decide whether `requested` additional units may be consumed.
 *
 * Partial consumption is never allowed: asking for 10 AI executions when 3
 * remain is refused outright rather than silently truncated, because a
 * half-executed scan produces misleading metrics.
 */
export function checkQuota(input: {
  metric: UsageMetric;
  used: number;
  limits: PlanLimits;
  requested?: number;
}): QuotaDecision {
  const requested = Math.max(1, Math.floor(input.requested ?? 1));
  const limitKey = USAGE_METRIC_LIMIT_KEY[input.metric];
  const limit = limitKey ? input.limits[limitKey] : null;
  const used = Math.max(0, Math.floor(input.used));

  if (limit === null) {
    return { allowed: true, used, limit: null, remaining: null };
  }

  const remaining = Math.max(0, limit - used);
  if (requested > remaining) {
    return {
      allowed: false,
      used,
      limit,
      remaining,
      reason:
        remaining === 0
          ? `You have used all ${limit} ${USAGE_METRIC_LABELS[input.metric].toLowerCase()} included this month.`
          : `This action needs ${requested} ${USAGE_METRIC_LABELS[input.metric].toLowerCase()} but only ${remaining} remain this month.`,
    };
  }

  return { allowed: true, used, limit, remaining };
}

/** Which warning thresholds a metric newly crossed, used to fire notifications. */
export function crossedThresholds(previousUsed: number, newUsed: number, limit: number | null): number[] {
  if (limit === null || limit <= 0) return [];
  const before = (previousUsed / limit) * 100;
  const after = (newUsed / limit) * 100;
  return USAGE_WARNING_THRESHOLDS.filter(
    (threshold) => before < threshold && after >= threshold,
  ).map((threshold) => threshold);
}

/** Start of the current usage period (calendar month, UTC). */
export function currentUsagePeriod(now = new Date()): { start: Date; end: Date; key: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, key };
}
