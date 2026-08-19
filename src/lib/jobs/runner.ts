import "server-only";

import { randomUUID } from "node:crypto";
import { claimJobs, failJob } from "@/lib/jobs/queue";
import { handleWebsiteCrawl } from "@/lib/jobs/handlers/crawl";
import { handlePageAnalysis } from "@/lib/jobs/handlers/page-analysis";
import { handleAiVisibilityScan } from "@/lib/jobs/handlers/ai-scan";
import { handleOpportunityGeneration } from "@/lib/jobs/handlers/opportunities";
import { handleInitialScan } from "@/lib/jobs/handlers/initial-scan";
import { handleReportGeneration } from "@/lib/jobs/handlers/reports";
import {
  handleAnalyticsSync,
  handleBingSync,
  handlePagespeedScan,
  handleSearchConsoleSync,
} from "@/lib/jobs/handlers/integrations";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger, errorMessage } from "@/lib/logger";
import type { JobRow, JobType } from "@/lib/db/types";

const log = logger.child("job-runner");

type JobHandler = (job: JobRow) => Promise<void>;

const HANDLERS: Record<JobType, JobHandler> = {
  initial_scan: handleInitialScan,
  website_crawl: handleWebsiteCrawl,
  page_analysis: handlePageAnalysis,
  ai_visibility_scan: handleAiVisibilityScan,
  search_console_sync: handleSearchConsoleSync,
  bing_sync: handleBingSync,
  analytics_sync: handleAnalyticsSync,
  pagespeed_scan: handlePagespeedScan,
  opportunity_generation: handleOpportunityGeneration,
  report_generation: handleReportGeneration,
  // Entity analysis runs inside page analysis; the type exists so an operator
  // can re-run it independently if a future release splits it out.
  entity_analysis: handlePageAnalysis,
};

export interface RunJobsResult {
  claimed: number;
  succeeded: number;
  failed: number;
  jobs: Array<{ id: string; type: JobType; ok: boolean; error?: string }>;
}

/**
 * Process a bounded batch of jobs.
 *
 * Called by the cron endpoint and by the "run now" action. Every job is
 * isolated: a handler throwing releases that job for retry and the loop
 * continues, so one broken project cannot stall the queue for everyone.
 */
export async function runJobs(input: {
  limit?: number;
  jobTypes?: JobType[];
  /** Stop claiming new jobs once this much wall-clock time has been used. */
  budgetMs?: number;
} = {}): Promise<RunJobsResult> {
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  const limit = input.limit ?? 3;
  const budgetMs = input.budgetMs ?? 45_000;
  const startedAt = Date.now();

  const result: RunJobsResult = { claimed: 0, succeeded: 0, failed: 0, jobs: [] };

  for (let processed = 0; processed < limit; processed += 1) {
    if (Date.now() - startedAt > budgetMs) break;

    const claimOptions: Parameters<typeof claimJobs>[0] = { workerId, limit: 1 };
    if (input.jobTypes) claimOptions.jobTypes = input.jobTypes;
    const claimed = await claimJobs(claimOptions);

    const job = claimed[0];
    if (!job) break;

    result.claimed += 1;

    try {
      const handler = HANDLERS[job.job_type];
      if (!handler) throw new Error(`No handler registered for job type ${job.job_type}`);
      await handler(job);
      result.succeeded += 1;
      result.jobs.push({ id: job.id, type: job.job_type, ok: true });
    } catch (error) {
      const message = errorMessage(error);
      log.error("Job failed", { jobId: job.id, jobType: job.job_type, error });
      const released = await failJob({ jobId: job.id, error, retryAfterSeconds: 120 });
      result.failed += 1;
      result.jobs.push({ id: job.id, type: job.job_type, ok: false, error: message });

      if (released?.status === "failed") {
        await recordSystemError(job, message);
      }
    }
  }

  return result;
}

/** Surface permanently failed jobs in the admin console. */
async function recordSystemError(job: JobRow, message: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("system_errors").insert({
    scope: `job:${job.job_type}`,
    message: message.slice(0, 1000),
    severity: "high",
    organization_id: job.organization_id,
    project_id: job.project_id,
    context: { jobId: job.id, attempts: job.attempts },
  });
}
