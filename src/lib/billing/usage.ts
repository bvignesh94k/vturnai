import "server-only";

import type { EngineId } from "@/lib/config/engines";
import type { PlanLimits, UsageMetric } from "@/lib/config/plans";
import { USAGE_METRIC_LABELS } from "@/lib/config/plans";
import { checkQuota, currentUsagePeriod, buildUsageReport, crossedThresholds, type UsageLine } from "@/lib/metrics/usage";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications/service";
import { logger } from "@/lib/logger";
import type { UsageMetricDb } from "@/lib/db/types";

const log = logger.child("usage");

export interface RecordUsageInput {
  organizationId: string;
  projectId?: string | null;
  metric: UsageMetric;
  quantity?: number;
  engine?: EngineId | null;
  estimatedCostUsd?: number | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Total consumption for one metric in the current billing month. */
export async function getUsageTotals(
  organizationId: string,
  periodKey = currentUsagePeriod().key,
): Promise<Record<UsageMetric, number>> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("usage_totals", {
    p_organization_id: organizationId,
    p_period_key: periodKey,
  });

  const totals = Object.fromEntries(
    (Object.keys(USAGE_METRIC_LABELS) as UsageMetric[]).map((metric) => [metric, 0]),
  ) as Record<UsageMetric, number>;

  if (error) {
    log.error("Failed to read usage totals", { organizationId, periodKey, error });
    return totals;
  }

  for (const row of data ?? []) {
    totals[row.metric as UsageMetric] = Number(row.total ?? 0);
  }
  return totals;
}

export async function getEstimatedSpendUsd(
  organizationId: string,
  periodKey = currentUsagePeriod().key,
): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.rpc("usage_totals", {
    p_organization_id: organizationId,
    p_period_key: periodKey,
  });
  return (data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

/**
 * Record consumption and fire usage warnings at the configured thresholds.
 * Recording never throws — losing a usage row must not fail a user's scan — but
 * failures are logged so the discrepancy is visible in admin.
 */
export async function recordUsage(input: RecordUsageInput, limits?: PlanLimits): Promise<void> {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const period = currentUsagePeriod();
  const supabase = createServiceRoleClient();

  const before = limits ? await getUsageTotals(input.organizationId, period.key) : null;

  const { error } = await supabase.from("usage_events").insert({
    organization_id: input.organizationId,
    project_id: input.projectId ?? null,
    metric: input.metric as UsageMetricDb,
    quantity,
    period_key: period.key,
    engine: input.engine ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    reference_id: input.referenceId ?? null,
    metadata: (input.metadata ?? {}) as never,
  });

  if (error) {
    log.error("Failed to record usage event", { input, error });
    return;
  }

  if (!limits || !before) return;

  const lines = buildUsageReport({ [input.metric]: before[input.metric] + quantity }, limits);
  const line = lines.find((entry) => entry.metric === input.metric);
  if (!line || line.limit === null) return;

  const crossed = crossedThresholds(before[input.metric], before[input.metric] + quantity, line.limit);
  if (crossed.length === 0) return;

  const threshold = Math.max(...crossed);
  await notifyOrganizationOwners(input.organizationId, {
    title:
      threshold >= 100
        ? `${USAGE_METRIC_LABELS[input.metric]} limit reached`
        : `${USAGE_METRIC_LABELS[input.metric]} at ${threshold}%`,
    body:
      threshold >= 100
        ? `You have used all ${line.limit} ${USAGE_METRIC_LABELS[input.metric].toLowerCase()} included in your plan this month. Usage resets at the start of next month.`
        : `You have used ${line.used} of ${line.limit} ${USAGE_METRIC_LABELS[input.metric].toLowerCase()} this month.`,
    actionUrl: "/app/billing",
  });
}

/**
 * Verify a metered action is within quota before performing it. Returns the
 * decision rather than throwing so callers can present a precise message.
 */
export async function assertWithinQuota(input: {
  organizationId: string;
  metric: UsageMetric;
  limits: PlanLimits;
  requested?: number;
}) {
  const totals = await getUsageTotals(input.organizationId);
  return checkQuota({
    metric: input.metric,
    used: totals[input.metric],
    limits: input.limits,
    requested: input.requested ?? 1,
  });
}

export async function buildUsageLines(
  organizationId: string,
  limits: PlanLimits,
): Promise<UsageLine[]> {
  const totals = await getUsageTotals(organizationId);
  return buildUsageReport(totals, limits);
}

async function notifyOrganizationOwners(
  organizationId: string,
  notification: { title: string; body: string; actionUrl: string },
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"]);

  await Promise.all(
    (members ?? []).map((member) =>
      createNotification({
        userId: member.user_id,
        organizationId,
        type: "usage_warning",
        title: notification.title,
        body: notification.body,
        actionUrl: notification.actionUrl,
      }),
    ),
  );
}
