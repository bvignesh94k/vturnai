import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { generatePromptSuggestions } from "@/lib/ai-engines/prompt-suggestions";
import { rehydrateExtractedPage } from "@/lib/analysis/rehydrate";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getConfiguredEngineIds } from "@/lib/ai-engines/registry";
import { completeJob, enqueueJob, payloadValue, updateJobProgress } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import type { CrawlPageRow, JobRow, PromptGroupDb } from "@/lib/db/types";

const log = logger.child("initial-scan-job");

/**
 * How many suggestions a brand-new project starts with switched on.
 *
 * Deliberately small: five prompts is a rounding error against the plan's
 * monthly execution quota, but it is the difference between a first dashboard
 * that reports a real mention rate and one that reports em dashes. A user who
 * has never seen the product cannot judge it from an empty grid, and asking
 * them to hand-pick prompts before anything works puts the homework before the
 * value.
 */
const STARTER_PROMPT_COUNT = 5;

/**
 * Initial scan orchestration.
 *
 * Runs immediately after onboarding and chains the whole "Building your
 * visibility profile…" sequence: crawl → analysis → PageSpeed on key pages →
 * prompt suggestions. Each stage is its own job, so the UI can show real
 * progress rather than an indeterminate spinner.
 */
export async function handleInitialScan(job: JobRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const projectId = job.project_id;
  if (!projectId) throw new Error("initial_scan requires a project_id");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) throw new Error(`Project ${projectId} no longer exists`);

  const stage = payloadValue<string>(job.payload, "stage", "crawl");

  if (stage === "crawl") {
    await updateJobProgress({ jobId: job.id, label: "Building your visibility profile…", current: 1, total: 4 });

    await enqueueJob({
      jobType: "website_crawl",
      projectId,
      organizationId: project.organization_id,
      payload: { triggerSource: "initial_scan", triggeredBy: project.created_by },
      idempotencyKey: `initial_crawl:${projectId}`,
      priority: 2,
    });

    await enqueueJob({
      jobType: "pagespeed_scan",
      projectId,
      organizationId: project.organization_id,
      payload: { limit: 3, strategies: ["mobile"] },
      idempotencyKey: `initial_pagespeed:${projectId}`,
      priority: 6,
      // Give the crawl time to identify which pages are worth measuring.
      runAfter: new Date(Date.now() + 120_000),
    });

    await enqueueJob({
      jobType: "initial_scan",
      projectId,
      organizationId: project.organization_id,
      payload: { stage: "prompts" },
      idempotencyKey: `initial_prompts:${projectId}`,
      priority: 7,
      runAfter: new Date(Date.now() + 180_000),
    });

    await completeJob({ jobId: job.id, label: "Scan started" });
    return;
  }

  if (stage === "prompts") {
    await generateSuggestedPrompts(job, projectId);
    return;
  }

  await completeJob({ jobId: job.id, label: "Nothing to do" });
}

/**
 * Generate suggested prompts from the crawled site and, where available, real
 * Search Console queries. The user reviews and edits these before activating
 * them — nothing is executed against a paid engine automatically.
 */
async function generateSuggestedPrompts(job: JobRow, projectId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  await updateJobProgress({ jobId: job.id, label: "Suggesting prompts to track", current: 4, total: 4 });

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) throw new Error(`Project ${projectId} no longer exists`);

  const { data: crawl } = await supabase
    .from("crawls")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pageRows } = crawl
    ? await supabase.from("crawl_pages").select("*").eq("crawl_id", crawl.id).limit(120)
    : { data: [] };

  const pages = ((pageRows ?? []) as CrawlPageRow[])
    .filter((row) => !row.fetch_error)
    .map((row) => rehydrateExtractedPage(row));

  const [{ data: competitors }, { data: queries }] = await Promise.all([
    supabase.from("competitors").select("brand_name").eq("project_id", projectId).eq("is_active", true),
    supabase
      .from("search_console_metrics")
      .select("dimension_value, impressions")
      .eq("project_id", projectId)
      .eq("dimension", "query")
      .order("impressions", { ascending: false })
      .limit(200),
  ]);

  const suggestions = generatePromptSuggestions({
    brandName: project.brand_name,
    businessCategory: project.business_category,
    businessDescription: project.business_description,
    targetCountry: project.target_country,
    targetAudience: project.target_audience,
    competitors: (competitors ?? []).map((competitor) => competitor.brand_name),
    pages,
    searchConsoleQueries: (queries ?? []).map((row) => ({
      query: row.dimension_value,
      impressions: row.impressions,
    })),
  });

  const { count: existingCount } = await supabase
    .from("prompts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  // Suggestions are inactive until the user reviews them, so generating them
  // can never consume AI quota or produce a surprise bill.
  const rows = suggestions.slice(0, 40).map((suggestion) => ({
    project_id: projectId,
    prompt_text: suggestion.promptText,
    intent: suggestion.intent,
    topic: suggestion.topic,
    prompt_group: suggestion.group as PromptGroupDb,
    country: project.target_country,
    language: project.primary_language,
    priority: suggestion.priority,
    is_active: false,
    is_suggested: true,
    suggestion_source: suggestion.source,
  }));

  if (rows.length > 0) {
    // Ignore conflicts so re-running the scan does not duplicate prompts.
    const { error } = await supabase.from("prompts").upsert(rows, {
      onConflict: "project_id,prompt_text",
      ignoreDuplicates: true,
    });
    if (error) log.warn("Some prompt suggestions could not be stored", { projectId, error });
  }

  // Only ever on a project's very first suggestion run. Keying off "the project
  // had no prompts at all beforehand" means a user who reviews their list and
  // deliberately switches everything off never has that decision undone by a
  // later re-scan.
  const activated =
    (existingCount ?? 0) === 0
      ? await activateStarterPrompts({ projectId, organizationId: project.organization_id })
      : 0;

  await completeJob({
    jobId: job.id,
    label:
      activated > 0
        ? `${rows.length} prompts ready, ${activated} tracking now`
        : `${rows.length} prompt suggestions ready`,
    result: { suggested: rows.length, existing: existingCount ?? 0, activated },
  });
}

/**
 * Switch on the highest-priority suggestions for a new project and measure them
 * straight away, so the first dashboard the user opens contains real numbers
 * about their own brand.
 *
 * Everything here degrades quietly: no configured engine, an inactive plan or a
 * failed update all just mean fewer starter prompts, never a failed scan. The
 * suggestions are still written either way and the user can activate them by
 * hand, which is exactly the behaviour this had before.
 */
async function activateStarterPrompts(input: {
  projectId: string;
  organizationId: string;
}): Promise<number> {
  const supabase = createServiceRoleClient();

  const entitlements = await getEntitlements(input.organizationId);
  if (!entitlements.isActive || !entitlements.features.aiVisibility) return 0;

  const limit = Math.min(STARTER_PROMPT_COUNT, entitlements.limits.activePrompts);
  if (limit <= 0) return 0;

  // Lower `priority` ranks higher — see the sort in generatePromptSuggestions.
  const { data: candidates } = await supabase
    .from("prompts")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("is_active", false)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  const promptIds = (candidates ?? []).map((row) => row.id);
  if (promptIds.length === 0) return 0;

  const { error } = await supabase.from("prompts").update({ is_active: true }).in("id", promptIds);
  if (error) {
    log.warn("Could not activate starter prompts", { projectId: input.projectId, error });
    return 0;
  }

  // No engine key configured means a scan would only record failures, so leave
  // the prompts active and let the user trigger one once a provider is added.
  if (getConfiguredEngineIds().length === 0) {
    log.info("Starter prompts activated but no AI engine is configured", {
      projectId: input.projectId,
      activated: promptIds.length,
    });
    return promptIds.length;
  }

  // The scan reads the active prompt list itself, so it picks up exactly the
  // rows just switched on. `initial_scan` also keeps this out of the monthly
  // manual-scan allowance, which the user has not chosen to spend.
  await enqueueJob({
    jobType: "ai_visibility_scan",
    projectId: input.projectId,
    organizationId: input.organizationId,
    payload: { triggerSource: "initial_scan" },
    idempotencyKey: `initial_ai_scan:${input.projectId}`,
    priority: 8,
  });

  return promptIds.length;
}
