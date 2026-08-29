import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { calculatePriority, priorityBand, PRIORITY_BAND_LABELS } from "@/lib/metrics/opportunity-priority";
import { completeJob, payloadValue, updateJobProgress } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { knownUrlSet } from "@/lib/crawler/provenance";
import { percentage, unique } from "@/lib/utils";
import type { EffortLevel, IssueSeverity } from "@/lib/config/scoring";
import type { DisciplineDb, EffortLevelDb, IssueSeverityDb, JobRow, Json } from "@/lib/db/types";

const log = logger.child("opportunity-job");

/**
 * Opportunity generation.
 *
 * This is where the product earns its keep: audits produce hundreds of
 * findings, and this job turns them into a ranked list where the top item is
 * genuinely the next thing worth doing. Every opportunity carries the priority
 * breakdown that produced its rank, so the ordering is explainable rather than
 * mysterious.
 */
export async function handleOpportunityGeneration(job: JobRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const projectId = job.project_id;
  if (!projectId) throw new Error("opportunity_generation requires a project_id");

  const crawlId = payloadValue<string | null>(job.payload, "crawlId", null);

  await updateJobProgress({ jobId: job.id, label: "Building your action plan" });

  const [{ data: issues }, { data: crawl }, { count: totalPages }] = await Promise.all([
    crawlId
      ? supabase.from("page_issues").select("*").eq("crawl_id", crawlId)
      : supabase
          .from("page_issues")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(500),
    crawlId ? supabase.from("crawls").select("*").eq("id", crawlId).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from("crawl_pages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("crawl_id", crawlId ?? ""),
  ]);

  const pageCount = totalPages ?? crawl?.urls_crawled ?? 1;

  // Search Console impressions per URL, when connected. Absent data simply
  // drops out of the priority formula rather than defaulting to zero.
  const impressionsByUrl = await loadImpressionsByUrl(projectId);
  const promptGap = await loadPromptGap(projectId);

  const urlsByIssue = new Map<string, string[]>();
  for (const issue of issues ?? []) {
    const evidence = (issue.evidence ?? {}) as Record<string, unknown>;
    urlsByIssue.set(
      issue.id,
      Array.isArray(evidence["affectedUrls"])
        ? (evidence["affectedUrls"] as string[])
        : issue.affected_url
          ? [issue.affected_url]
          : [],
    );
  }

  /**
   * An opportunity may only name pages we can account for.
   *
   * A URL with no discovery record is one we cannot explain to the person
   * reading the finding, and showing it invites exactly the reaction it got
   * from the first customer to look closely: "there is no such url". Anything
   * unaccounted for is dropped and logged, so the gap surfaces as a bug in
   * whatever produced it rather than as a wrong number on a dashboard.
   *
   * Resolved once for the whole batch: this runs over hundreds of issues, and a
   * lookup per issue would put the crawl's slowest step inside a loop.
   */
  const accountableUrls = await knownUrlSet({
    projectId,
    urls: unique([...urlsByIssue.values()].flat()),
  });

  const rows = [];
  for (const issue of issues ?? []) {
    const claimedUrls = urlsByIssue.get(issue.id) ?? [];
    const affectedUrls = claimedUrls.filter((url) => accountableUrls.has(url));

    // A finding whose entire evidence base was untraceable is not a finding.
    if (claimedUrls.length > 0 && affectedUrls.length === 0) continue;

    const trafficPotential =
      impressionsByUrl === null
        ? null
        : affectedUrls.reduce((sum, url) => sum + (impressionsByUrl.get(normaliseForMatch(url)) ?? 0), 0);

    const disciplines = issue.disciplines as DisciplineDb[];
    const visibilityImpact = estimateVisibilityImpact(issue.severity as IssueSeverity, disciplines);

    const priority = calculatePriority({
      severity: issue.severity as IssueSeverity,
      visibilityImpact,
      affectedPages: Math.max(1, affectedUrls.length),
      totalPages: Math.max(1, pageCount),
      effort: issue.effort as EffortLevel,
      trafficPotential,
      aiPromptOpportunity: disciplines.includes("geo") || disciplines.includes("aeo") ? promptGap : null,
    });

    const band = priorityBand(priority.score);

    rows.push({
      project_id: projectId,
      crawl_id: crawlId,
      source_key: `issue:${issue.issue_code}`,
      title: issue.title,
      opportunity_type: issue.issue_code,
      disciplines,
      severity: issue.severity as IssueSeverityDb,
      expected_impact: describeImpact(band, disciplines, trafficPotential),
      effort: issue.effort as EffortLevelDb,
      priority_score: priority.score,
      priority_breakdown: {
        band,
        bandLabel: PRIORITY_BAND_LABELS[band],
        components: priority.components,
      } as unknown as Json,
      affected_urls: affectedUrls.slice(0, 50),
      affected_page_count: affectedUrls.length,
      explanation: issue.why_it_matters,
      recommendation: issue.recommendation,
      implementation_guidance: issue.implementation_example,
    });
  }

  // Preserve the user's workflow state: an opportunity they already completed
  // or ignored must not silently reappear as open after the next crawl.
  const { data: existing } = await supabase
    .from("opportunities")
    .select("source_key, status, completed_at, assigned_to")
    .eq("project_id", projectId);

  const stateByKey = new Map((existing ?? []).map((row) => [row.source_key, row]));

  const upsertRows = rows.map((row) => {
    const previous = stateByKey.get(row.source_key);
    return {
      ...row,
      status: previous?.status ?? "open",
      completed_at: previous?.completed_at ?? null,
      assigned_to: previous?.assigned_to ?? null,
    };
  });

  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("opportunities")
      .upsert(upsertRows as never, { onConflict: "project_id,source_key" });
    if (error) log.error("Failed to upsert opportunities", { projectId, error });
  }

  // Findings that no longer appear in the latest crawl are resolved.
  const currentKeys = new Set(rows.map((row) => row.source_key));
  const staleKeys = (existing ?? [])
    .filter((row) => row.status === "open" && !currentKeys.has(row.source_key))
    .map((row) => row.source_key);

  if (staleKeys.length > 0) {
    await supabase
      .from("opportunities")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .in("source_key", staleKeys);
  }

  await completeJob({
    jobId: job.id,
    label: `${upsertRows.length} opportunities ranked`,
    result: { generated: upsertRows.length, autoResolved: staleKeys.length },
  });
}

function normaliseForMatch(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * How much fixing this is expected to move visibility, on 0–100.
 *
 * Severity carries most of the weight, with a bump for issues that block more
 * than one discipline, a page that is invisible to both search and AI engines
 * is worth more than one that is merely untidy.
 */
function estimateVisibilityImpact(severity: IssueSeverity, disciplines: readonly DisciplineDb[]): number {
  const base: Record<IssueSeverity, number> = {
    critical: 90,
    high: 70,
    medium: 45,
    low: 25,
    information: 10,
  };
  const breadthBonus = Math.min(15, Math.max(0, disciplines.length - 1) * 7);
  return Math.min(100, base[severity] + breadthBonus);
}

function describeImpact(
  band: ReturnType<typeof priorityBand>,
  disciplines: readonly DisciplineDb[],
  trafficPotential: number | null,
): string {
  const areas = disciplines.map((discipline) => discipline.toUpperCase()).join(", ") || "visibility";
  const traffic =
    trafficPotential && trafficPotential > 0
      ? ` Affects pages with about ${Math.round(trafficPotential).toLocaleString("en-IN")} Google impressions.`
      : "";
  const framing: Record<ReturnType<typeof priorityBand>, string> = {
    urgent: `Blocking your ${areas} performance right now.`,
    high: `A meaningful step up in ${areas}.`,
    medium: `A worthwhile improvement to ${areas}.`,
    low: `A small refinement to ${areas}.`,
  };
  return `${framing[band]}${traffic}`;
}

/** Impressions per URL from the last 28 days, or null when GSC is not connected. */
async function loadImpressionsByUrl(projectId: string): Promise<Map<string, number> | null> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("search_console_metrics")
    .select("dimension_value, impressions")
    .eq("project_id", projectId)
    .eq("dimension", "page")
    .gte("date", since)
    .limit(5000);

  if (!data || data.length === 0) return null;

  const totals = new Map<string, number>();
  for (const row of data) {
    const key = normaliseForMatch(row.dimension_value);
    totals.set(key, (totals.get(key) ?? 0) + row.impressions);
  }
  return totals;
}

/**
 * How much AI prompt coverage is currently missing, 0–100. Higher means more
 * prompts where the brand is absent, so AEO/GEO work is worth more.
 */
async function loadPromptGap(projectId: string): Promise<number | null> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data } = await supabase
    .from("ai_runs")
    .select("prompt_id, brand_mentioned, is_valid")
    .eq("project_id", projectId)
    .gte("executed_at", since)
    .limit(3000);

  if (!data || data.length === 0) return null;

  const valid = data.filter((row) => row.is_valid);
  if (valid.length === 0) return null;

  const promptIds = unique(valid.map((row) => row.prompt_id));
  const covered = promptIds.filter((promptId) =>
    valid.some((row) => row.prompt_id === promptId && row.brand_mentioned),
  );

  return Math.round(100 - percentage(covered.length, promptIds.length));
}
