import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { HEO_WEIGHTS } from "@/lib/config/scoring";
import { ENGINES, ENGINE_IDS, type EngineId } from "@/lib/config/engines";
import { SITE } from "@/lib/config/site";
import { buildEngineRows, summariseAiVisibility, type MeasurableRun } from "@/lib/metrics/ai-visibility";
import { buildAiReferralReport } from "@/lib/integrations/analytics";
import { buildSearchConsoleInsights } from "@/lib/integrations/search-console";
import { round } from "@/lib/utils";

/**
 * Report assembly.
 *
 * Produces one structured payload covering every section of the deliverable.
 * It always states its data sources and the scan date, and any section without
 * a connected source is marked unavailable rather than silently omitted — a
 * report that quietly drops a section reads as though the data was zero.
 */

export interface ReportSectionAvailability {
  available: boolean;
  reason?: string;
}

export interface ReportPayload {
  title: string;
  generatedAt: string;
  period: { start: string; end: string; days: number };
  dataSources: string[];
  project: {
    name: string;
    domain: string;
    siteUrl: string;
    brandName: string;
    country: string;
  };
  executiveSummary: {
    headline: string;
    vScore: number | null;
    previousVScore: number | null;
    keyFindings: string[];
    topPriorities: string[];
  };
  scores: {
    vScore: number | null;
    seo: number | null;
    aeo: number | null;
    geo: number | null;
    experienceAuthority: number | null;
    weights: typeof HEO_WEIGHTS;
    formula: string;
    capturedAt: string | null;
  };
  aiVisibility: {
    availability: ReportSectionAvailability;
    summary: ReturnType<typeof summariseAiVisibility> | null;
    engines: Array<{
      engineId: EngineId;
      name: string;
      vendor: string;
      observationNote: string;
      visibilityScore: number;
      mentions: number;
      citations: number;
      recommendations: number;
      sentiment: string;
      validResponses: number;
      lastCheckedAt: string | null;
    }>;
    lastScanAt: string | null;
  };
  competitors: {
    availability: ReportSectionAvailability;
    rows: Array<{ brand: string; mentions: number; share: number; isTrackedBrand: boolean }>;
  };
  topIssues: Array<{
    title: string;
    severity: string;
    disciplines: string[];
    affectedPages: number;
    recommendation: string;
  }>;
  topOpportunities: Array<{
    title: string;
    priorityScore: number;
    effort: string;
    expectedImpact: string;
    recommendation: string;
    affectedPages: number;
  }>;
  search: {
    availability: ReportSectionAvailability;
    totals: { clicks: number; impressions: number; ctr: number; position: number } | null;
    previousTotals: { clicks: number; impressions: number; ctr: number; position: number } | null;
    strikingDistance: Array<{ query: string; position: number; impressions: number; clicks: number }>;
    highImpressionLowClick: Array<{ page: string; impressions: number; clicks: number; ctr: number }>;
  };
  aiReferralTraffic: {
    availability: ReportSectionAvailability;
    totalSessions: number;
    bySource: Array<{ label: string; source: string; sessions: number }>;
    caveat: string;
  };
  actionPlan: Array<{ step: number; title: string; why: string; how: string; effort: string }>;
}

export async function buildReportPayload(input: {
  projectId: string;
  periodDays?: number;
}): Promise<ReportPayload> {
  const supabase = createServiceRoleClient();
  const days = input.periodDays ?? 30;
  const periodStart = new Date(Date.now() - days * 86_400_000);
  const dataSources: string[] = ["V Turn AI crawler"];

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", input.projectId)
    .maybeSingle();

  if (!project) throw new Error("Project not found");

  const [{ data: scoreRows }, { data: issues }, { data: opportunities }, { data: aiScan }] =
    await Promise.all([
      supabase
        .from("project_scores")
        .select("*")
        .eq("project_id", input.projectId)
        .order("captured_at", { ascending: false })
        .limit(2),
      supabase
        .from("page_issues")
        .select("*")
        .eq("project_id", input.projectId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("opportunities")
        .select("*")
        .eq("project_id", input.projectId)
        .eq("status", "open")
        .order("priority_score", { ascending: false })
        .limit(12),
      supabase
        .from("ai_scans")
        .select("*")
        .eq("project_id", input.projectId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const latest = scoreRows?.[0] ?? null;
  const previous = scoreRows?.[1] ?? null;

  // ---- AI visibility -------------------------------------------------------
  const { data: runs } = await supabase
    .from("ai_runs")
    .select("id, engine, prompt_id, is_valid, brand_mentioned, domain_cited, recommended, sentiment, executed_at")
    .eq("project_id", input.projectId)
    .gte("executed_at", periodStart.toISOString())
    .limit(3000);

  let measurable: MeasurableRun[] = [];
  let lastCheckedByEngine: Record<string, string | null> = {};
  let competitorRows: Array<{ brand: string; mentions: number; share: number; isTrackedBrand: boolean }> = [];

  if (runs && runs.length > 0) {
    dataSources.push("AI engine APIs");
    const runIds = runs.map((run) => run.id).slice(0, 1000);
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

    measurable = runs.map((run) => ({
      engineId: run.engine,
      promptId: run.prompt_id,
      valid: run.is_valid,
      brandMentioned: run.brand_mentioned,
      domainCited: run.domain_cited,
      recommended: run.recommended,
      sentiment: run.sentiment,
      citedUrls: citationsByRun.get(run.id) ?? [],
      competitorMentions: mentionsByRun.get(run.id) ?? [],
    }));

    lastCheckedByEngine = Object.fromEntries(
      ENGINE_IDS.map((engineId) => {
        const latestRun = runs
          .filter((run) => run.engine === engineId)
          .sort((a, b) => b.executed_at.localeCompare(a.executed_at))[0];
        return [engineId, latestRun?.executed_at ?? null];
      }),
    );

    const brandMentions = measurable.filter((run) => run.valid && run.brandMentioned).length;
    const competitorCounts = new Map<string, number>();
    for (const run of measurable) {
      if (!run.valid) continue;
      for (const mention of run.competitorMentions) {
        if (!mention.mentioned) continue;
        competitorCounts.set(mention.brand, (competitorCounts.get(mention.brand) ?? 0) + 1);
      }
    }
    const total = brandMentions + [...competitorCounts.values()].reduce((sum, value) => sum + value, 0);
    competitorRows = [
      { brand: project.brand_name, mentions: brandMentions, share: total ? round((brandMentions / total) * 100, 1) : 0, isTrackedBrand: true },
      ...[...competitorCounts.entries()].map(([brand, count]) => ({
        brand,
        mentions: count,
        share: total ? round((count / total) * 100, 1) : 0,
        isTrackedBrand: false,
      })),
    ].sort((a, b) => b.mentions - a.mentions);
  }

  const aiSummary = measurable.length > 0 ? summariseAiVisibility(measurable) : null;
  const engineRows = buildEngineRows(measurable, ENGINE_IDS, lastCheckedByEngine);

  // ---- Search Console ------------------------------------------------------
  const searchInsights = await buildSearchConsoleInsights(input.projectId, days);
  if (searchInsights) dataSources.push("Google Search Console");

  // ---- GA4 -----------------------------------------------------------------
  const referral = await buildAiReferralReport(input.projectId, days);
  if (referral.hasData) dataSources.push("Google Analytics 4");

  // ---- Narrative -----------------------------------------------------------
  const criticalIssues = (issues ?? []).filter((issue) => issue.severity === "critical");
  const keyFindings: string[] = [];

  if (latest) {
    keyFindings.push(
      `Your V Score is ${round(Number(latest.v_score), 0)} out of 100${
        previous ? `, ${describeChange(Number(latest.v_score) - Number(previous.v_score))} since the previous scan` : ""
      }.`,
    );
  }
  if (criticalIssues.length > 0) {
    keyFindings.push(
      `${criticalIssues.length} critical issue${criticalIssues.length === 1 ? "" : "s"} ${criticalIssues.length === 1 ? "is" : "are"} currently limiting how search and AI engines can use your site.`,
    );
  }
  if (aiSummary) {
    keyFindings.push(
      `AI engines mentioned your brand in ${round(aiSummary.mentionRate, 0)}% of tracked answers and cited your domain in ${round(aiSummary.citationRate, 0)}%.`,
    );
  } else {
    keyFindings.push(
      "No AI visibility scan has been run for this period yet, so AI figures are not included.",
    );
  }
  if (searchInsights) {
    keyFindings.push(
      `Google sent ${searchInsights.totals.clicks.toLocaleString("en-IN")} organic clicks from ${searchInsights.totals.impressions.toLocaleString("en-IN")} impressions.`,
    );
  }

  return {
    title: `${project.name} — Visibility Report`,
    generatedAt: new Date().toISOString(),
    period: {
      start: periodStart.toISOString().slice(0, 10),
      end: new Date().toISOString().slice(0, 10),
      days,
    },
    dataSources,
    project: {
      name: project.name,
      domain: project.domain,
      siteUrl: project.site_url,
      brandName: project.brand_name,
      country: project.target_country,
    },
    executiveSummary: {
      headline: latest
        ? `${project.brand_name} scores ${round(Number(latest.v_score), 0)}/100 for overall visibility across search and AI answer engines.`
        : `${project.brand_name} has not completed a full scan yet.`,
      vScore: latest ? round(Number(latest.v_score), 1) : null,
      previousVScore: previous ? round(Number(previous.v_score), 1) : null,
      keyFindings,
      topPriorities: (opportunities ?? []).slice(0, 3).map((opportunity) => opportunity.title),
    },
    scores: {
      vScore: latest ? round(Number(latest.v_score), 1) : null,
      seo: latest ? round(Number(latest.seo_score), 1) : null,
      aeo: latest ? round(Number(latest.aeo_score), 1) : null,
      geo: latest ? round(Number(latest.geo_score), 1) : null,
      experienceAuthority: latest ? round(Number(latest.experience_authority_score), 1) : null,
      weights: HEO_WEIGHTS,
      formula: `SEO ${HEO_WEIGHTS.seo * 100}% + AEO ${HEO_WEIGHTS.aeo * 100}% + GEO ${HEO_WEIGHTS.geo * 100}% + Experience & Authority ${HEO_WEIGHTS.experienceAuthority * 100}%`,
      capturedAt: latest?.captured_at ?? null,
    },
    aiVisibility: {
      availability: aiSummary
        ? { available: true }
        : {
            available: false,
            reason:
              "No AI visibility scan has completed for this period. Connect at least one AI provider and run a scan to populate this section.",
          },
      summary: aiSummary,
      engines: engineRows.map((row) => ({
        engineId: row.engineId as EngineId,
        name: ENGINES[row.engineId as EngineId].name,
        vendor: ENGINES[row.engineId as EngineId].vendor,
        observationNote: ENGINES[row.engineId as EngineId].observationNote,
        visibilityScore: row.visibilityScore,
        mentions: row.mentions,
        citations: row.citations,
        recommendations: row.recommendations,
        sentiment: row.sentiment,
        validResponses: row.validResponses,
        lastCheckedAt: row.lastCheckedAt,
      })),
      lastScanAt: aiScan?.completed_at ?? null,
    },
    competitors: {
      availability:
        competitorRows.length > 1
          ? { available: true }
          : { available: false, reason: "Add competitors and run an AI visibility scan to compare share of voice." },
      rows: competitorRows,
    },
    topIssues: (issues ?? [])
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .slice(0, 12)
      .map((issue) => ({
        title: issue.title,
        severity: issue.severity,
        disciplines: issue.disciplines,
        affectedPages: Array.isArray((issue.evidence as { affectedUrls?: string[] })?.affectedUrls)
          ? ((issue.evidence as { affectedUrls?: string[] }).affectedUrls?.length ?? 0)
          : 0,
        recommendation: issue.recommendation,
      })),
    topOpportunities: (opportunities ?? []).map((opportunity) => ({
      title: opportunity.title,
      priorityScore: round(Number(opportunity.priority_score), 1),
      effort: opportunity.effort,
      expectedImpact: opportunity.expected_impact,
      recommendation: opportunity.recommendation,
      affectedPages: opportunity.affected_page_count,
    })),
    search: {
      availability: searchInsights
        ? { available: true }
        : { available: false, reason: "Connect Google Search Console to include organic search performance." },
      totals: searchInsights?.totals ?? null,
      previousTotals: searchInsights?.previousTotals ?? null,
      strikingDistance: searchInsights?.strikingDistance.slice(0, 10) ?? [],
      highImpressionLowClick: searchInsights?.highImpressionLowClick.slice(0, 10) ?? [],
    },
    aiReferralTraffic: {
      availability: referral.hasData
        ? { available: true }
        : { available: false, reason: "Connect Google Analytics 4 to see visits that arrived from AI assistants." },
      totalSessions: referral.totalSessions,
      bySource: referral.bySource.slice(0, 10).map((entry) => ({
        label: entry.label,
        source: entry.source,
        sessions: entry.sessions,
      })),
      caveat:
        "This counts only visits that actually reached your site from an identifiable AI assistant. Most AI visibility is zero-click, so treat this as a floor on your AI impact, not a measure of it.",
    },
    actionPlan: (opportunities ?? []).slice(0, 8).map((opportunity, index) => ({
      step: index + 1,
      title: opportunity.title,
      why: opportunity.explanation,
      how: opportunity.recommendation,
      effort: opportunity.effort,
    })),
  };
}

function severityWeight(severity: string): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    default:
      return 1;
  }
}

function describeChange(delta: number): string {
  if (Math.abs(delta) < 0.5) return "unchanged";
  return delta > 0 ? `up ${round(delta, 1)} points` : `down ${round(Math.abs(delta), 1)} points`;
}

export { SITE };
