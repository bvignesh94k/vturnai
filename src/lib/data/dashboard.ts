import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ENGINE_IDS, type EngineId } from "@/lib/config/engines";
import { getProviderStatuses } from "@/lib/ai-engines/registry";
import {
  buildEngineRows,
  delta,
  shareOfVoiceBreakdown,
  summariseAiVisibility,
  type AIVisibilitySummary,
  type EngineVisibilityRow,
  type MeasurableRun,
} from "@/lib/metrics/ai-visibility";
import { round } from "@/lib/utils";
import type { ProviderStatus } from "@/lib/ai-engines/types";
import type { CrawlRow, JobRow, ProjectScoreRow, SentimentDb } from "@/lib/db/types";

/**
 * Dashboard data loading.
 *
 * All queries run through the request-scoped Supabase client so RLS applies.
 * The functions here return view models, the pages that use them do no
 * arithmetic of their own, which keeps the numbers consistent across surfaces.
 */

export interface ScoreSnapshot {
  vScore: number | null;
  seo: number | null;
  aeo: number | null;
  geo: number | null;
  heo: number | null;
  experienceAuthority: number | null;
  capturedAt: string | null;
  criticalIssues: number;
  /** Change against the previous snapshot, in points. Null with no baseline. */
  deltas: {
    vScore: number | null;
    seo: number | null;
    aeo: number | null;
    geo: number | null;
    heo: number | null;
  };
  breakdown: unknown;
}

export interface SearchSnapshot {
  connected: boolean;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  deltas: { clicks: number | null; impressions: number | null; position: number | null };
}

export interface AiVisibilityData {
  summary: AIVisibilitySummary | null;
  previousSummary: AIVisibilitySummary | null;
  engineRows: EngineVisibilityRow[];
  providerStatuses: ProviderStatus[];
  shareOfVoice: Array<{ brand: string; mentions: number; share: number; isTrackedBrand: boolean }>;
  lastScanAt: string | null;
  lastScanLabel: string | null;
  trackedPrompts: number;
  activeEngines: number;
  runCount: number;
}

export interface TrendPoint {
  date: string;
  vScore: number;
  seo: number;
  aeo: number;
  geo: number;
  aiVisibility: number | null;
  citationRate: number | null;
  shareOfVoice: number | null;
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? round(parsed, 1) : null;
}

export async function loadScoreSnapshot(projectId: string): Promise<ScoreSnapshot> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("project_scores")
    .select("*")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false })
    .limit(2);

  const rows = (data ?? []) as ProjectScoreRow[];
  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;

  if (!latest) {
    return {
      vScore: null,
      seo: null,
      aeo: null,
      geo: null,
      heo: null,
      experienceAuthority: null,
      capturedAt: null,
      criticalIssues: 0,
      deltas: { vScore: null, seo: null, aeo: null, geo: null, heo: null },
      breakdown: null,
    };
  }

  const value = (row: ProjectScoreRow, key: keyof ProjectScoreRow): number | null =>
    toNumber(row[key] as number | string | null);

  return {
    vScore: value(latest, "v_score"),
    seo: value(latest, "seo_score"),
    aeo: value(latest, "aeo_score"),
    geo: value(latest, "geo_score"),
    heo: value(latest, "heo_score"),
    experienceAuthority: value(latest, "experience_authority_score"),
    capturedAt: latest.captured_at,
    criticalIssues: latest.critical_issue_count,
    deltas: {
      vScore: previous ? delta(value(latest, "v_score") ?? 0, value(previous, "v_score")) : null,
      seo: previous ? delta(value(latest, "seo_score") ?? 0, value(previous, "seo_score")) : null,
      aeo: previous ? delta(value(latest, "aeo_score") ?? 0, value(previous, "aeo_score")) : null,
      geo: previous ? delta(value(latest, "geo_score") ?? 0, value(previous, "geo_score")) : null,
      heo: previous ? delta(value(latest, "heo_score") ?? 0, value(previous, "heo_score")) : null,
    },
    breakdown: latest.breakdown,
  };
}

/**
 * Assemble the measurable-run view of AI activity for a period.
 * Shared by the dashboard, the AI visibility page and the competitor page.
 */
async function loadMeasurableRuns(
  projectId: string,
  since: Date,
  until?: Date,
): Promise<{ runs: MeasurableRun[]; lastCheckedByEngine: Record<string, string | null> }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("ai_runs")
    .select("id, engine, prompt_id, is_valid, brand_mentioned, domain_cited, recommended, sentiment, executed_at")
    .eq("project_id", projectId)
    .gte("executed_at", since.toISOString())
    .order("executed_at", { ascending: false })
    .limit(3000);

  if (until) query = query.lt("executed_at", until.toISOString());

  const { data: runRows } = await query;
  const rows = runRows ?? [];
  if (rows.length === 0) return { runs: [], lastCheckedByEngine: {} };

  const runIds = rows.map((row) => row.id).slice(0, 1000);
  const [{ data: citations }, { data: mentions }] = await Promise.all([
    supabase.from("ai_citations").select("ai_run_id, url, is_brand_domain").in("ai_run_id", runIds),
    supabase
      .from("ai_competitor_mentions")
      .select("ai_run_id, brand_name, mentioned, recommended")
      .in("ai_run_id", runIds),
  ]);

  const citationsByRun = new Map<string, string[]>();
  for (const citation of citations ?? []) {
    if (!citation.is_brand_domain) continue;
    const existing = citationsByRun.get(citation.ai_run_id);
    if (existing) existing.push(citation.url);
    else citationsByRun.set(citation.ai_run_id, [citation.url]);
  }

  const mentionsByRun = new Map<string, Array<{ brand: string; mentioned: boolean; recommended: boolean }>>();
  for (const mention of mentions ?? []) {
    const entry = {
      brand: mention.brand_name,
      mentioned: mention.mentioned,
      recommended: mention.recommended,
    };
    const existing = mentionsByRun.get(mention.ai_run_id);
    if (existing) existing.push(entry);
    else mentionsByRun.set(mention.ai_run_id, [entry]);
  }

  const lastCheckedByEngine = Object.fromEntries(
    ENGINE_IDS.map((engineId) => {
      const latest = rows.find((row) => row.engine === engineId);
      return [engineId, latest?.executed_at ?? null];
    }),
  );

  return {
    runs: rows.map((row) => ({
      engineId: row.engine,
      promptId: row.prompt_id,
      valid: row.is_valid,
      brandMentioned: row.brand_mentioned,
      domainCited: row.domain_cited,
      recommended: row.recommended,
      sentiment: row.sentiment as SentimentDb,
      citedUrls: citationsByRun.get(row.id) ?? [],
      competitorMentions: mentionsByRun.get(row.id) ?? [],
    })),
    lastCheckedByEngine,
  };
}

export async function loadAiVisibility(input: {
  projectId: string;
  brandName: string;
  periodDays?: number;
}): Promise<AiVisibilityData> {
  const supabase = await createServerSupabaseClient();
  const days = input.periodDays ?? 30;
  const now = Date.now();
  const since = new Date(now - days * 86_400_000);
  const previousSince = new Date(now - days * 2 * 86_400_000);

  const [current, previous, { count: promptCount }, { data: lastScan }] = await Promise.all([
    loadMeasurableRuns(input.projectId, since),
    loadMeasurableRuns(input.projectId, previousSince, since),
    supabase
      .from("prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", input.projectId)
      .eq("is_active", true),
    supabase
      .from("ai_scans")
      .select("completed_at, engines_succeeded, engines_attempted, status")
      .eq("project_id", input.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const providerStatuses = getProviderStatuses();
  const engineRows = buildEngineRows(current.runs, ENGINE_IDS, current.lastCheckedByEngine);

  return {
    summary: current.runs.length > 0 ? summariseAiVisibility(current.runs, promptCount ?? undefined) : null,
    previousSummary: previous.runs.length > 0 ? summariseAiVisibility(previous.runs) : null,
    engineRows,
    providerStatuses,
    shareOfVoice: current.runs.length > 0 ? shareOfVoiceBreakdown(current.runs, input.brandName) : [],
    lastScanAt: lastScan?.completed_at ?? null,
    lastScanLabel:
      lastScan && lastScan.engines_attempted > 0
        ? `${lastScan.engines_succeeded} of ${lastScan.engines_attempted} engines completed`
        : null,
    trackedPrompts: promptCount ?? 0,
    activeEngines: engineRows.filter((row) => row.validResponses > 0).length,
    runCount: current.runs.length,
  };
}

export async function loadSearchSnapshot(projectId: string, days = 28): Promise<SearchSnapshot> {
  const supabase = await createServerSupabaseClient();
  const since = new Date(Date.now() - (days + 3) * 86_400_000).toISOString().slice(0, 10);
  const priorSince = new Date(Date.now() - (days * 2 + 3) * 86_400_000).toISOString().slice(0, 10);

  const [{ data: connection }, { data: rows }] = await Promise.all([
    supabase.from("search_console_connections").select("site_url").eq("project_id", projectId).maybeSingle(),
    supabase
      .from("search_console_metrics")
      .select("date, clicks, impressions, position")
      .eq("project_id", projectId)
      .eq("dimension", "total")
      .gte("date", priorSince),
  ]);

  const empty: SearchSnapshot = {
    connected: Boolean(connection),
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    deltas: { clicks: null, impressions: null, position: null },
  };

  if (!rows || rows.length === 0) return empty;

  const aggregate = (subset: typeof rows) => {
    const clicks = subset.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = subset.reduce((sum, row) => sum + row.impressions, 0);
    const weighted = subset.reduce((sum, row) => sum + Number(row.position) * row.impressions, 0);
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? round((clicks / impressions) * 100, 2) : 0,
      position: impressions > 0 ? round(weighted / impressions, 1) : 0,
    };
  };

  const current = aggregate(rows.filter((row) => row.date >= since));
  const prior = rows.filter((row) => row.date < since);
  const previous = prior.length > 0 ? aggregate(prior) : null;

  return {
    connected: Boolean(connection),
    ...current,
    deltas: {
      clicks: previous ? current.clicks - previous.clicks : null,
      impressions: previous ? current.impressions - previous.impressions : null,
      // Position is inverted: a lower number is better, so we report the
      // improvement rather than the raw arithmetic difference.
      position: previous ? round(previous.position - current.position, 1) : null,
    },
  };
}

export async function loadScoreTrend(projectId: string, limit = 30): Promise<TrendPoint[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("project_scores")
    .select(
      "captured_at, v_score, seo_score, aeo_score, geo_score, ai_visibility_score, citation_rate, share_of_voice",
    )
    .eq("project_id", projectId)
    .order("captured_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    date: row.captured_at.slice(0, 10),
    vScore: toNumber(row.v_score) ?? 0,
    seo: toNumber(row.seo_score) ?? 0,
    aeo: toNumber(row.aeo_score) ?? 0,
    geo: toNumber(row.geo_score) ?? 0,
    aiVisibility: toNumber(row.ai_visibility_score),
    citationRate: toNumber(row.citation_rate),
    shareOfVoice: toNumber(row.share_of_voice),
  }));
}

export interface ProjectActivity {
  latestCrawl: CrawlRow | null;
  activeJob: JobRow | null;
  openOpportunities: number;
  urgentOpportunities: number;
  criticalIssues: number;
  totalPages: number;
}

export async function loadProjectActivity(projectId: string): Promise<ProjectActivity> {
  const supabase = await createServerSupabaseClient();

  const [{ data: crawl }, { data: job }, { count: open }, { count: urgent }, { count: critical }] =
    await Promise.all([
      supabase
        .from("crawls")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("jobs")
        .select("*")
        .eq("project_id", projectId)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .in("status", ["open", "in_progress"]),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "open")
        .gte("priority_score", 78),
      supabase
        .from("page_issues")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("severity", "critical"),
    ]);

  return {
    latestCrawl: crawl ?? null,
    activeJob: job ?? null,
    openOpportunities: open ?? 0,
    urgentOpportunities: urgent ?? 0,
    criticalIssues: critical ?? 0,
    totalPages: crawl?.urls_crawled ?? 0,
  };
}

export type { EngineId };
