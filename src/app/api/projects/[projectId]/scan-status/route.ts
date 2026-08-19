import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runJobs } from "@/lib/jobs/runner";
import { logger } from "@/lib/logger";

const log = logger.child("scan-status");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StepState = "pending" | "running" | "done";

/**
 * Scan status for the onboarding progress screen and the in-app scan banner.
 *
 * Reads through the user's session so RLS confirms they may see this project.
 * It also nudges the job queue: on a deployment without a cron trigger yet, a
 * user watching this screen is enough to keep their own scan moving.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { projectId } = await context.params;
  const supabase = await createServerSupabaseClient();

  // RLS returns nothing when the caller is not a member of the project's org.
  const { data: project } = await supabase
    .from("projects")
    .select("id, initial_scan_completed_at")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [{ data: jobs }, { data: crawl }, { count: promptCount }] = await Promise.all([
    supabase
      .from("jobs")
      .select("job_type, status, progress_current, progress_total, progress_label, last_error")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("crawls")
      .select("status, urls_crawled, urls_discovered, max_urls")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);

  const jobList = jobs ?? [];
  const active = jobList.find((job) => job.status === "running" || job.status === "queued");

  const stateOf = (types: string[]): StepState => {
    const matching = jobList.filter((job) => types.includes(job.job_type));
    if (matching.length === 0) return "pending";
    if (matching.some((job) => job.status === "running")) return "running";
    if (matching.some((job) => job.status === "succeeded")) return "done";
    if (matching.some((job) => job.status === "queued")) return "pending";
    return "pending";
  };

  const crawlDone = crawl?.status === "completed";
  const analysisState = stateOf(["page_analysis"]);
  const promptsState = (promptCount ?? 0) > 0 ? "done" : stateOf(["initial_scan"]);

  const steps: Array<{ key: string; label: string; state: StepState }> = [
    {
      key: "discover",
      label: "Reading robots.txt and your sitemap",
      state: crawl ? "done" : active ? "running" : "pending",
    },
    {
      key: "crawl",
      label: "Crawling and extracting your pages",
      state: crawlDone ? "done" : crawl?.status === "running" ? "running" : "pending",
    },
    { key: "analyse", label: "Scoring SEO, AEO and GEO", state: analysisState },
    { key: "prompts", label: "Suggesting prompts to track", state: promptsState },
  ];

  const failedJob = jobList.find((job) => job.status === "failed");
  const ready = Boolean(project.initial_scan_completed_at) && !active;

  const stage: "running" | "ready" | "failed" = ready
    ? "ready"
    : failedJob && !active
      ? "failed"
      : "running";

  // Advance the queue opportunistically. Bounded and non-fatal: a failure here
  // must never break the status response the UI depends on.
  if (stage === "running") {
    try {
      await runJobs({ limit: 1, budgetMs: 20_000 });
    } catch (error) {
      log.warn("Opportunistic job run failed", { projectId, error });
    }
  }

  return NextResponse.json(
    {
      stage,
      label:
        stage === "ready"
          ? "Your visibility profile is ready"
          : (active?.progress_label ?? crawl?.status === "running"
              ? "Crawling your website"
              : "Getting started"),
      current: active?.progress_current ?? crawl?.urls_crawled ?? 0,
      total: active?.progress_total ?? crawl?.max_urls ?? 0,
      steps,
      ...(stage === "failed" && failedJob?.last_error
        ? { message: `Something went wrong: ${failedJob.last_error}` }
        : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
