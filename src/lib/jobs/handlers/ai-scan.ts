import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { assertWithinQuota, recordUsage } from "@/lib/billing/usage";
import { ENGINE_IDS, type EngineId } from "@/lib/config/engines";
import { dedupeKey } from "@/lib/ai-engines/base";
import { getConfiguredEngineIds, runPromptAcrossEngines } from "@/lib/ai-engines/registry";
import { citedUrlsForDomain } from "@/lib/metrics/detection";
import { toRegistrableHost } from "@/lib/crawler/url";
import { completeJob, payloadValue, rescheduleJob, updateJobProgress } from "@/lib/jobs/queue";
import { notifyOrganization } from "@/lib/notifications/service";
import { logger } from "@/lib/logger";
import type { AIVisibilityResult, ProviderRunOutcome } from "@/lib/ai-engines/types";
import type { EngineIdDb, JobRow, Json, SentimentDb } from "@/lib/db/types";

const log = logger.child("ai-scan-job");

/** Prompts processed per invocation. Each prompt fans out across every engine. */
const PROMPTS_PER_BATCH = 3;

/** A prompt is not re-run against the same engine inside this window. */
const DEDUPE_WINDOW_HOURS = 20;

interface AiScanState {
  scanId: string;
  promptIds: string[];
  cursor: number;
  engines: EngineId[];
  succeeded: number;
  failed: number;
  costUsd: number;
  enginesSucceeded: string[];
  enginesAttempted: string[];
}

/**
 * AI visibility scan handler.
 *
 * Never triggered by a page render, only by an explicit scan job, so a user
 * refreshing the dashboard cannot spend money. Prompts are processed a few at a
 * time and the job re-queues itself, keeping each invocation short.
 */
export async function handleAiVisibilityScan(job: JobRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const projectId = job.project_id;
  if (!projectId) throw new Error("ai_visibility_scan requires a project_id");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) throw new Error(`Project ${projectId} no longer exists`);

  const entitlements = await getEntitlements(project.organization_id);
  const existing = payloadValue<AiScanState | null>(job.payload, "state", null);
  const state = existing ?? (await beginScan(job, projectId, project.organization_id));

  if (state.promptIds.length === 0) {
    await finishScan(job, state, projectId, project.organization_id);
    return;
  }

  const batchIds = state.promptIds.slice(state.cursor, state.cursor + PROMPTS_PER_BATCH);
  if (batchIds.length === 0) {
    await finishScan(job, state, projectId, project.organization_id);
    return;
  }

  const [{ data: prompts }, { data: competitors }] = await Promise.all([
    supabase.from("prompts").select("*").in("id", batchIds),
    supabase.from("competitors").select("*").eq("project_id", projectId).eq("is_active", true),
  ]);

  const competitorNames = (competitors ?? []).map((competitor) => competitor.brand_name);
  const competitorDomains = new Map(
    (competitors ?? [])
      .map((competitor) => [toRegistrableHost(competitor.domain ?? competitor.site_url ?? ""), competitor.id] as const)
      .filter((entry): entry is readonly [string, string] => entry[0] !== null),
  );

  let succeeded = state.succeeded;
  let failed = state.failed;
  let costUsd = state.costUsd;
  const enginesSucceeded = new Set(state.enginesSucceeded);
  const enginesAttempted = new Set(state.enginesAttempted);

  for (const prompt of prompts ?? []) {
    // Quota is re-checked per prompt so a long scan cannot overshoot the plan.
    const quota = await assertWithinQuota({
      organizationId: project.organization_id,
      metric: "ai_prompt_executions",
      limits: entitlements.limits,
      requested: state.engines.length,
    });

    if (!quota.allowed) {
      log.warn("AI scan halted on quota", { projectId, reason: quota.reason });
      await notifyOrganization(project.organization_id, {
        projectId,
        type: "usage_warning",
        title: "AI visibility scan stopped early",
        body: quota.reason ?? "Your monthly AI execution limit was reached.",
        actionUrl: "/app/billing",
      });
      break;
    }

    const enginesToRun = await filterRecentlyRun({
      projectId,
      prompt: prompt.prompt_text,
      brand: project.brand_name,
      competitors: competitorNames,
      country: prompt.country,
      engines: state.engines,
    });

    if (enginesToRun.length === 0) continue;

    const { outcomes } = await runPromptAcrossEngines({
      prompt: prompt.prompt_text,
      brand: project.brand_name,
      domain: project.domain,
      competitors: competitorNames,
      country: prompt.country,
      language: prompt.language,
      brandAliases: project.brand_aliases,
      engineIds: enginesToRun,
    });

    for (const outcome of outcomes) {
      enginesAttempted.add(outcome.engineId);
      if (outcome.ok) {
        enginesSucceeded.add(outcome.engineId);
        succeeded += 1;
        costUsd += outcome.result.estimatedCost ?? 0;
      } else {
        failed += 1;
      }
    }

    await persistOutcomes({
      projectId,
      scanId: state.scanId,
      promptId: prompt.id,
      promptText: prompt.prompt_text,
      brandDomain: project.domain,
      competitorDomains,
      competitorIdsByName: new Map((competitors ?? []).map((competitor) => [competitor.brand_name, competitor.id])),
      outcomes,
      // Must match exactly what `filterRecentlyRun` looks up, or de-duplication
      // silently stops working and every scan pays for repeat calls.
      dedupeKeyFor: (engineId) =>
        dedupeKey({
          engineId,
          prompt: prompt.prompt_text,
          brand: project.brand_name,
          competitors: competitorNames,
          country: prompt.country,
        }),
    });

    await supabase
      .from("prompts")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", prompt.id);

    const executions = outcomes.filter((outcome) => outcome.ok || outcome.reason !== "not_configured").length;
    if (executions > 0) {
      await recordUsage(
        {
          organizationId: project.organization_id,
          projectId,
          metric: "ai_prompt_executions",
          quantity: executions,
          referenceId: state.scanId,
        },
        entitlements.limits,
      );
    }
  }

  const nextState: AiScanState = {
    ...state,
    cursor: state.cursor + batchIds.length,
    succeeded,
    failed,
    costUsd,
    enginesSucceeded: [...enginesSucceeded],
    enginesAttempted: [...enginesAttempted],
  };

  await supabase
    .from("ai_scans")
    .update({
      prompts_completed: nextState.cursor,
      runs_succeeded: nextState.succeeded,
      runs_failed: nextState.failed,
      engines_succeeded: nextState.enginesSucceeded.length,
      engines_attempted: nextState.enginesAttempted.length,
      estimated_cost_usd: nextState.costUsd,
    })
    .eq("id", state.scanId);

  await updateJobProgress({
    jobId: job.id,
    current: nextState.cursor,
    total: nextState.promptIds.length,
    label: `Checked ${nextState.cursor} of ${nextState.promptIds.length} prompts`,
  });

  if (nextState.cursor >= nextState.promptIds.length) {
    await finishScan(job, nextState, projectId, project.organization_id);
    return;
  }

  await rescheduleJob({ jobId: job.id, payloadPatch: { state: nextState as unknown as Json } });
}

async function beginScan(job: JobRow, projectId: string, organizationId: string): Promise<AiScanState> {
  const supabase = createServiceRoleClient();
  const entitlements = await getEntitlements(organizationId);

  const { data: prompts } = await supabase
    .from("prompts")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(entitlements.limits.activePrompts);

  const requestedEngines = payloadValue<EngineId[] | null>(job.payload, "engines", null);
  const configured = getConfiguredEngineIds();
  const engines = (requestedEngines ?? ENGINE_IDS).filter((engine) => configured.includes(engine));

  const { data: scan, error } = await supabase
    .from("ai_scans")
    .insert({
      project_id: projectId,
      status: "running",
      trigger_source: payloadValue<string>(job.payload, "triggerSource", "manual"),
      triggered_by: payloadValue<string | null>(job.payload, "triggeredBy", null),
      engines: engines as EngineIdDb[],
      prompts_total: prompts?.length ?? 0,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !scan) throw new Error(`Could not create AI scan: ${error?.message ?? "unknown error"}`);

  await supabase
    .from("projects")
    .update({ last_ai_scan_at: new Date().toISOString() })
    .eq("id", projectId);

  if (payloadValue<string>(job.payload, "triggerSource", "manual") === "manual") {
    await recordUsage({
      organizationId,
      projectId,
      metric: "manual_scans",
      quantity: 1,
      referenceId: scan.id,
    });
  }

  return {
    scanId: scan.id,
    promptIds: (prompts ?? []).map((prompt) => prompt.id),
    cursor: 0,
    engines,
    succeeded: 0,
    failed: 0,
    costUsd: 0,
    enginesSucceeded: [],
    enginesAttempted: [],
  };
}

/**
 * Drop engines that already ran this exact prompt recently.
 *
 * Identical prompts produce near-identical answers within a day, so re-running
 * them buys nothing and costs real money.
 */
async function filterRecentlyRun(input: {
  projectId: string;
  prompt: string;
  brand: string;
  competitors: readonly string[];
  country: string;
  engines: readonly EngineId[];
}): Promise<EngineId[]> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 3_600_000).toISOString();

  const keys = input.engines.map((engineId) =>
    dedupeKey({
      engineId,
      prompt: input.prompt,
      brand: input.brand,
      competitors: input.competitors,
      country: input.country,
    }),
  );

  const { data: recent } = await supabase
    .from("ai_runs")
    .select("dedupe_key")
    .eq("project_id", input.projectId)
    .gte("executed_at", since)
    .in("dedupe_key", keys);

  const alreadyRun = new Set((recent ?? []).map((row) => row.dedupe_key));
  return input.engines.filter((engineId, index) => !alreadyRun.has(keys[index] ?? ""));
}

async function persistOutcomes(input: {
  projectId: string;
  scanId: string;
  promptId: string;
  promptText: string;
  brandDomain: string;
  competitorDomains: Map<string, string>;
  competitorIdsByName: Map<string, string>;
  outcomes: readonly ProviderRunOutcome[];
  dedupeKeyFor: (engineId: EngineId) => string;
}): Promise<void> {
  const supabase = createServiceRoleClient();

  for (const outcome of input.outcomes) {
    // Unconfigured engines are not a measurement and are not stored.
    if (!outcome.ok && outcome.reason === "not_configured") continue;
    if (!outcome.ok && outcome.reason === "licensing_required") continue;

    if (!outcome.ok) {
      await supabase.from("ai_runs").insert({
        project_id: input.projectId,
        scan_id: input.scanId,
        prompt_id: input.promptId,
        engine: outcome.engineId as EngineIdDb,
        model: "unknown",
        observation_mode: "api_observation",
        is_valid: false,
        failure_reason: outcome.message.slice(0, 500),
        prompt_text: input.promptText,
        answer: null,
        sentiment: "unknown" as SentimentDb,
      });
      continue;
    }

    const result: AIVisibilityResult = outcome.result;
    const brandUrls = citedUrlsForDomain(result.citations, input.brandDomain);

    const { data: run, error } = await supabase
      .from("ai_runs")
      .insert({
        project_id: input.projectId,
        scan_id: input.scanId,
        prompt_id: input.promptId,
        engine: outcome.engineId as EngineIdDb,
        model: result.model,
        observation_mode: "api_observation",
        is_valid: true,
        prompt_text: input.promptText,
        answer: result.answer.slice(0, 20_000),
        brand_mentioned: result.brandMentioned,
        domain_cited: result.domainCited,
        recommended: result.recommended,
        sentiment: result.sentiment as SentimentDb,
        citation_count: result.citations.length,
        brand_citation_count: brandUrls.length,
        estimated_cost_usd: result.estimatedCost ?? null,
        dedupe_key: input.dedupeKeyFor(outcome.engineId),
        metadata: (result.metadata ?? {}) as Json,
        executed_at: result.executedAt,
      })
      .select("id")
      .single();

    if (error || !run) {
      log.error("Failed to persist AI run", { engineId: outcome.engineId, error });
      continue;
    }

    if (result.citations.length > 0) {
      await supabase.from("ai_citations").insert(
        result.citations.slice(0, 40).map((citation, index) => ({
          ai_run_id: run.id,
          project_id: input.projectId,
          url: citation.url,
          domain: citation.domain,
          title: citation.title ?? null,
          is_brand_domain: brandUrls.includes(citation.url),
          is_competitor_domain: input.competitorDomains.has(citation.domain),
          position: index + 1,
        })),
      );
    }

    if (result.competitorMentions.length > 0) {
      await supabase.from("ai_competitor_mentions").insert(
        result.competitorMentions.map((mention) => ({
          ai_run_id: run.id,
          project_id: input.projectId,
          competitor_id: input.competitorIdsByName.get(mention.brand) ?? null,
          brand_name: mention.brand,
          mentioned: mention.mentioned,
          recommended: mention.recommended,
        })),
      );
    }
  }
}

async function finishScan(
  job: JobRow,
  state: AiScanState,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();

  await supabase
    .from("ai_scans")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      prompts_completed: state.cursor,
      runs_succeeded: state.succeeded,
      runs_failed: state.failed,
      engines_succeeded: state.enginesSucceeded.length,
      engines_attempted: state.enginesAttempted.length,
      estimated_cost_usd: state.costUsd,
    })
    .eq("id", state.scanId);

  const label =
    state.enginesAttempted.length === 0
      ? "No AI engines are connected"
      : `${state.enginesSucceeded.length} of ${state.enginesAttempted.length} engines completed`;

  await completeJob({
    jobId: job.id,
    label,
    result: {
      scanId: state.scanId,
      prompts: state.promptIds.length,
      succeeded: state.succeeded,
      failed: state.failed,
      estimatedCostUsd: state.costUsd,
    },
  });

  await notifyOrganization(organizationId, {
    projectId,
    type: "ai_scan_complete",
    title: "AI visibility scan complete",
    body: `${label}. ${state.succeeded} answer${state.succeeded === 1 ? "" : "s"} were analysed across ${state.promptIds.length} prompt${state.promptIds.length === 1 ? "" : "s"}.`,
    actionUrl: "/app/ai-visibility",
  });
}
