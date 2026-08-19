import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { assertWithinQuota, recordUsage } from "@/lib/billing/usage";
import { syncAnalytics } from "@/lib/integrations/analytics";
import { syncBing } from "@/lib/integrations/bing";
import { markSearchConsoleError, syncSearchConsole } from "@/lib/integrations/search-console";
import {
  isPagespeedConfigured,
  runPagespeed,
  selectPagespeedTargets,
  storePagespeedResult,
  type PagespeedStrategy,
} from "@/lib/integrations/pagespeed";
import { setConnectionStatus } from "@/lib/integrations/credentials";
import { completeJob, payloadValue, updateJobProgress } from "@/lib/jobs/queue";
import { logger, errorMessage } from "@/lib/logger";
import type { JobRow } from "@/lib/db/types";

const log = logger.child("integration-jobs");

export async function handleSearchConsoleSync(job: JobRow): Promise<void> {
  const projectId = job.project_id;
  const organizationId = await resolveOrganizationId(job);
  if (!projectId || !organizationId) throw new Error("search_console_sync requires a project");

  await updateJobProgress({ jobId: job.id, label: "Syncing Google Search Console" });

  try {
    const result = await syncSearchConsole({
      organizationId,
      projectId,
      days: payloadValue<number>(job.payload, "days", 28),
    });
    await completeJob({
      jobId: job.id,
      label: `Stored ${result.rowsStored} Search Console rows`,
      result,
    });
  } catch (error) {
    await markSearchConsoleError({ projectId, error });
    throw error;
  }
}

export async function handleBingSync(job: JobRow): Promise<void> {
  const projectId = job.project_id;
  const organizationId = await resolveOrganizationId(job);
  if (!projectId || !organizationId) throw new Error("bing_sync requires a project");

  await updateJobProgress({ jobId: job.id, label: "Syncing Bing Webmaster Tools" });

  try {
    const result = await syncBing({ organizationId, projectId });
    await completeJob({ jobId: job.id, label: `Stored ${result.rowsStored} Bing rows`, result });
  } catch (error) {
    await setConnectionStatus({
      projectId,
      provider: "bing_webmaster",
      status: "error",
      lastError: errorMessage(error).slice(0, 500),
    });
    throw error;
  }
}

export async function handleAnalyticsSync(job: JobRow): Promise<void> {
  const projectId = job.project_id;
  const organizationId = await resolveOrganizationId(job);
  if (!projectId || !organizationId) throw new Error("analytics_sync requires a project");

  await updateJobProgress({ jobId: job.id, label: "Syncing Google Analytics" });

  try {
    const result = await syncAnalytics({
      organizationId,
      projectId,
      days: payloadValue<number>(job.payload, "days", 28),
    });
    await completeJob({
      jobId: job.id,
      label: `Stored ${result.rowsStored} analytics rows`,
      result,
    });
  } catch (error) {
    await setConnectionStatus({
      projectId,
      provider: "google_analytics",
      status: "error",
      lastError: errorMessage(error).slice(0, 500),
    });
    throw error;
  }
}

/**
 * PageSpeed scan.
 *
 * Only a handful of pages are measured per run — the API is slow and
 * quota-limited, and measuring 500 URLs would produce a large bill and very
 * little extra insight.
 */
export async function handlePagespeedScan(job: JobRow): Promise<void> {
  const projectId = job.project_id;
  const organizationId = await resolveOrganizationId(job);
  if (!projectId || !organizationId) throw new Error("pagespeed_scan requires a project");

  if (!isPagespeedConfigured()) {
    await setConnectionStatus({
      projectId,
      provider: "pagespeed",
      status: "configuration_required",
      lastError: "GOOGLE_PAGESPEED_API_KEY is not set.",
    });
    await completeJob({ jobId: job.id, label: "PageSpeed is not configured" });
    return;
  }

  const entitlements = await getEntitlements(organizationId);
  const explicitUrls = payloadValue<string[]>(job.payload, "urls", []);
  const strategies = payloadValue<PagespeedStrategy[]>(job.payload, "strategies", ["mobile", "desktop"]);

  const targets =
    explicitUrls.length > 0
      ? explicitUrls.map((url) => ({ url, pageId: null, reason: "Selected by you" }))
      : await selectPagespeedTargets({ projectId, limit: payloadValue<number>(job.payload, "limit", 5) });

  if (targets.length === 0) {
    await completeJob({ jobId: job.id, label: "No pages available to measure" });
    return;
  }

  const quota = await assertWithinQuota({
    organizationId,
    metric: "pagespeed_checks",
    limits: entitlements.limits,
    requested: targets.length * strategies.length,
  });

  if (!quota.allowed) {
    await completeJob({ jobId: job.id, label: quota.reason ?? "PageSpeed quota reached" });
    return;
  }

  await updateJobProgress({
    jobId: job.id,
    total: targets.length * strategies.length,
    current: 0,
    label: "Measuring page performance",
  });

  let completed = 0;
  let failures = 0;

  for (const target of targets) {
    for (const strategy of strategies) {
      try {
        const result = await runPagespeed({ url: target.url, strategy });
        await storePagespeedResult({ projectId, pageId: target.pageId, result });
        await recordUsage(
          {
            organizationId,
            projectId,
            metric: "pagespeed_checks",
            quantity: 1,
            metadata: { url: target.url, strategy },
          },
          entitlements.limits,
        );
      } catch (error) {
        // One slow or unreachable page must not abandon the rest of the run.
        failures += 1;
        log.warn("PageSpeed check failed", { url: target.url, strategy, error });
      }
      completed += 1;
      await updateJobProgress({ jobId: job.id, current: completed });
    }
  }

  await setConnectionStatus({
    projectId,
    provider: "pagespeed",
    status: failures === completed ? "error" : "connected",
    lastSyncedAt: new Date(),
    lastError: failures > 0 ? `${failures} of ${completed} checks failed` : null,
  });

  await completeJob({
    jobId: job.id,
    label: `${completed - failures} of ${completed} performance checks completed`,
    result: { completed, failures, targets: targets.map((target) => target.url) },
  });
}

async function resolveOrganizationId(job: JobRow): Promise<string | null> {
  if (job.organization_id) return job.organization_id;
  if (!job.project_id) return null;
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", job.project_id)
    .maybeSingle();
  return data?.organization_id ?? null;
}
