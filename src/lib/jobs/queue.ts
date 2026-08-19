import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger, errorMessage } from "@/lib/logger";
import type { JobRow, JobType, Json } from "@/lib/db/types";

/**
 * Database-backed job queue.
 *
 * Designed for serverless: a job handler processes a bounded slice of work and
 * either finishes or re-queues itself. Nothing runs longer than a function
 * timeout, and every handler is idempotent so a retry after a partial failure
 * cannot double-count usage or duplicate rows.
 */

const log = logger.child("jobs");

export interface EnqueueJobInput {
  jobType: JobType;
  projectId?: string | null;
  organizationId?: string | null;
  payload?: Record<string, unknown>;
  /** Stable key: enqueuing the same key twice is a no-op, not a duplicate job. */
  idempotencyKey?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  progressTotal?: number;
  progressLabel?: string;
}

export async function enqueueJob(input: EnqueueJobInput): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();

  const insert = {
    job_type: input.jobType,
    project_id: input.projectId ?? null,
    organization_id: input.organizationId ?? null,
    payload: (input.payload ?? {}) as Json,
    idempotency_key: input.idempotencyKey ?? null,
    priority: input.priority ?? 5,
    run_after: (input.runAfter ?? new Date()).toISOString(),
    max_attempts: input.maxAttempts ?? 3,
    progress_total: input.progressTotal ?? 0,
    progress_label: input.progressLabel ?? null,
    status: "queued" as const,
  };

  const { data, error } = await supabase.from("jobs").insert(insert).select("*").maybeSingle();

  if (error) {
    // A unique violation on idempotency_key means the work is already queued.
    if (error.code === "23505" && input.idempotencyKey) {
      const { data: existing } = await supabase
        .from("jobs")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      return existing ?? null;
    }
    log.error("Failed to enqueue job", { input, error });
    return null;
  }

  return data ?? null;
}

/** Claim up to `limit` runnable jobs, marking them running under a worker id. */
export async function claimJobs(input: {
  workerId: string;
  limit?: number;
  jobTypes?: JobType[];
  lockSeconds?: number;
}): Promise<JobRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("claim_jobs", {
    p_worker_id: input.workerId,
    p_limit: input.limit ?? 1,
    p_job_types: input.jobTypes ?? null,
    p_lock_seconds: input.lockSeconds ?? 300,
  });

  if (error) {
    log.error("Failed to claim jobs", { input, error });
    return [];
  }
  return data ?? [];
}

export async function updateJobProgress(input: {
  jobId: string;
  current?: number;
  total?: number;
  label?: string;
  payloadPatch?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const update: Partial<JobRow> = {};
  if (input.current !== undefined) update.progress_current = input.current;
  if (input.total !== undefined) update.progress_total = input.total;
  if (input.label !== undefined) update.progress_label = input.label;

  if (input.payloadPatch) {
    const { data: job } = await supabase.from("jobs").select("payload").eq("id", input.jobId).maybeSingle();
    const existing = (job?.payload ?? {}) as Record<string, unknown>;
    update.payload = { ...existing, ...input.payloadPatch } as Json;
  }

  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("jobs").update(update).eq("id", input.jobId);
  if (error) log.warn("Failed to update job progress", { jobId: input.jobId, error });
}

/**
 * Re-queue a job to continue immediately. Used by handlers that process one
 * batch per invocation, so a long crawl advances without a long request.
 */
export async function rescheduleJob(input: {
  jobId: string;
  payloadPatch?: Record<string, unknown>;
  delaySeconds?: number;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("payload, attempts")
    .eq("id", input.jobId)
    .maybeSingle();

  const existing = (job?.payload ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("jobs")
    .update({
      status: "queued",
      locked_at: null,
      locked_by: null,
      // Continuing work is not a retry, so the attempt counter is wound back.
      attempts: Math.max(0, (job?.attempts ?? 1) - 1),
      run_after: new Date(Date.now() + (input.delaySeconds ?? 0) * 1000).toISOString(),
      payload: { ...existing, ...(input.payloadPatch ?? {}) } as Json,
    })
    .eq("id", input.jobId);

  if (error) log.error("Failed to reschedule job", { jobId: input.jobId, error });
}

export async function completeJob(input: {
  jobId: string;
  result?: Record<string, unknown>;
  label?: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      progress_label: input.label ?? "Completed",
      result: (input.result ?? {}) as Json,
    })
    .eq("id", input.jobId);

  if (error) log.error("Failed to complete job", { jobId: input.jobId, error });
}

/** Release a job for retry, or fail it permanently once attempts are exhausted. */
export async function failJob(input: {
  jobId: string;
  error: unknown;
  retryAfterSeconds?: number;
}): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();
  const message = errorMessage(input.error);

  const { data, error } = await supabase.rpc("release_job", {
    p_job_id: input.jobId,
    p_error: message.slice(0, 1000),
    p_retry_after_seconds: input.retryAfterSeconds ?? 60,
  });

  if (error) {
    log.error("Failed to release job", { jobId: input.jobId, error });
    return null;
  }
  return (data as unknown as JobRow) ?? null;
}

export async function cancelJob(jobId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function getJob(jobId: string): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
  return data ?? null;
}

/** The job a project's UI should show as "in progress". */
export async function getActiveJobForProject(projectId: string): Promise<JobRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Read a typed value out of a job payload without resorting to `any`. */
export function payloadValue<T>(payload: Json, key: string, fallback: T): T {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return fallback;
  const value = (payload as Record<string, unknown>)[key];
  return value === undefined || value === null ? fallback : (value as T);
}
