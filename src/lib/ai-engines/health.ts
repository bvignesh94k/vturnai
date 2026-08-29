import "server-only";

import { ENGINE_IDS, ENGINES, type EngineId } from "@/lib/config/engines";
import { getProviderStatuses } from "@/lib/ai-engines/registry";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * What an AI engine is actually doing for this project.
 *
 * Holding a credential is not the same as working. A key can be revoked, run
 * out of credit, or have been mistyped, and every one of those still leaves the
 * environment variable sitting there looking healthy. Reporting "connected" on
 * that basis is the same mistake as marking an integration connected because
 * someone typed a property id.
 *
 * So health is read from evidence instead: the most recent run this engine
 * actually performed. That costs nothing extra, because every scan already
 * records whether the provider answered.
 */

export type EngineState =
  /** Answered the last time we asked. */
  | "answering"
  /** Has credentials, but the last attempt failed. */
  | "failing"
  /** Has credentials and has never been asked. */
  | "untested"
  /** No credentials on this deployment. Nothing a customer can fix. */
  | "unavailable";

export interface EngineHealth {
  engineId: EngineId;
  name: string;
  state: EngineState;
  lastAttemptAt: Date | null;
  /** Present when `state` is "failing". Plain language, never an env var name. */
  failureSummary: string | null;
  /** True when the operator, not the customer, has to act. */
  needsOperator: boolean;
}

/** Provider failure reasons mapped to something a marketer can act on. */
function humaniseFailure(reason: string | null, engineName: string): string {
  const value = (reason ?? "").toLowerCase();
  if (value.includes("rate") || value.includes("429")) {
    return `${engineName} rate limited this scan. It will be retried automatically.`;
  }
  if (value.includes("auth") || value.includes("401") || value.includes("403")) {
    return `${engineName} rejected our credentials. We have been notified.`;
  }
  if (value.includes("quota") || value.includes("credit") || value.includes("billing")) {
    return `Our ${engineName} account has run out of quota. We have been notified.`;
  }
  if (value.includes("timeout") || value.includes("abort")) {
    return `${engineName} did not respond in time on the last scan.`;
  }
  return `${engineName} could not be reached on the last scan.`;
}

/**
 * Resolve every engine's health for one project.
 *
 * One query, then a fold: for each engine we care only about its most recent
 * run, because that is what says whether it is working now.
 */
export async function getEngineHealth(projectId: string): Promise<EngineHealth[]> {
  const supabase = createServiceRoleClient();
  const statuses = new Map(getProviderStatuses().map((status) => [status.id, status]));

  const { data: runs } = await supabase
    .from("ai_runs")
    .select("engine, is_valid, failure_reason, executed_at")
    .eq("project_id", projectId)
    .order("executed_at", { ascending: false })
    .limit(400);

  const latestByEngine = new Map<string, { isValid: boolean; reason: string | null; at: Date }>();
  for (const run of runs ?? []) {
    if (latestByEngine.has(run.engine)) continue;
    latestByEngine.set(run.engine, {
      isValid: run.is_valid,
      reason: run.failure_reason,
      at: new Date(run.executed_at),
    });
  }

  return ENGINE_IDS.map((engineId) => {
    const name = ENGINES[engineId].name;
    const configured = statuses.get(engineId)?.configured ?? false;

    if (!configured) {
      return {
        engineId,
        name,
        state: "unavailable" as EngineState,
        lastAttemptAt: null,
        failureSummary: null,
        needsOperator: true,
      };
    }

    const latest = latestByEngine.get(engineId);
    if (!latest) {
      return {
        engineId,
        name,
        state: "untested" as EngineState,
        lastAttemptAt: null,
        failureSummary: null,
        needsOperator: false,
      };
    }

    if (!latest.isValid) {
      return {
        engineId,
        name,
        state: "failing" as EngineState,
        lastAttemptAt: latest.at,
        failureSummary: humaniseFailure(latest.reason, name),
        needsOperator: true,
      };
    }

    return {
      engineId,
      name,
      state: "answering" as EngineState,
      lastAttemptAt: latest.at,
      failureSummary: null,
      needsOperator: false,
    };
  });
}

/** Engines that can contribute to a scan right now. */
export function usableEngines(health: EngineHealth[]): EngineHealth[] {
  return health.filter((entry) => entry.state === "answering" || entry.state === "untested");
}
