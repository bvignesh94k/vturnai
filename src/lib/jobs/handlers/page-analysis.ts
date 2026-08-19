import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { analysePageAeo, aggregateAeoScores } from "@/lib/analysis/aeo";
import { analysePageGeo } from "@/lib/analysis/geo";
import { analyseCitationReadiness } from "@/lib/analysis/citation-readiness";
import { analyseEntity } from "@/lib/analysis/entity";
import { analyseSeo } from "@/lib/analysis/seo";
import { rehydrateExtractedPage } from "@/lib/analysis/rehydrate";
import { composeExperienceAuthorityScore, composeHeoScore } from "@/lib/metrics/scores";
import { summariseAiVisibility, type MeasurableRun } from "@/lib/metrics/ai-visibility";
import { bandScore, booleanScore } from "@/lib/metrics/scores";
import { completeJob, enqueueJob, payloadValue, updateJobProgress } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { round } from "@/lib/utils";
import type { CrawledPage } from "@/lib/crawler/crawler";
import type { AnalysisIssue } from "@/lib/analysis/types";
import type { CrawlPageRow, DisciplineDb, EffortLevelDb, IssueSeverityDb, JobRow, Json, PageLinkRow } from "@/lib/db/types";

const log = logger.child("page-analysis-job");

interface BlockedCrawler {
  agent: string;
  engine: string;
  purpose: string;
  scope: string;
}

/**
 * Page analysis handler.
 *
 * Runs after a crawl completes: scores every page, raises issues, builds the
 * entity profile, writes the project score snapshot, and queues opportunity
 * generation. Everything is derived from stored crawl data, so re-running this
 * job is safe and produces the same result.
 */
export async function handlePageAnalysis(job: JobRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const projectId = job.project_id;
  const crawlId = payloadValue<string | null>(job.payload, "crawlId", null);
  if (!projectId || !crawlId) throw new Error("page_analysis requires project_id and crawlId");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) throw new Error(`Project ${projectId} no longer exists`);

  await updateJobProgress({ jobId: job.id, label: "Scoring pages", current: 0, total: 0 });

  const { data: pageRows } = await supabase
    .from("crawl_pages")
    .select("*")
    .eq("crawl_id", crawlId)
    .order("depth", { ascending: true })
    .limit(1000);

  const rows = (pageRows ?? []) as CrawlPageRow[];
  if (rows.length === 0) {
    await completeJob({ jobId: job.id, label: "No pages to analyse" });
    return;
  }

  const { data: linkRows } = await supabase
    .from("page_links")
    .select("source_page_id, target_url, anchor_text, is_internal, is_nofollow")
    .eq("crawl_id", crawlId)
    .limit(20_000);

  const linksByPage = new Map<string, Array<Pick<PageLinkRow, "target_url" | "anchor_text" | "is_internal" | "is_nofollow">>>();
  for (const link of (linkRows ?? []) as Array<PageLinkRow & { source_page_id: string }>) {
    const existing = linksByPage.get(link.source_page_id);
    const entry = {
      target_url: link.target_url,
      anchor_text: link.anchor_text,
      is_internal: link.is_internal,
      is_nofollow: link.is_nofollow,
    };
    if (existing) existing.push(entry);
    else linksByPage.set(link.source_page_id, [entry]);
  }

  // Rebuild the crawl shape the SEO analyzer expects.
  const crawledPages: CrawledPage[] = rows.map((row) => ({
    url: row.url,
    finalUrl: row.url,
    urlHash: row.url_hash,
    depth: row.depth,
    httpStatus: row.http_status,
    contentType: row.content_type,
    responseTimeMs: row.response_time_ms,
    redirectChain: row.redirect_chain,
    fetchError: row.fetch_error,
    page: row.fetch_error ? null : rehydrateExtractedPage(row, linksByPage.get(row.id) ?? []),
  }));

  const { data: crawl } = await supabase.from("crawls").select("*").eq("id", crawlId).maybeSingle();
  const blockedAiCrawlers = payloadValue<BlockedCrawler[]>(job.payload, "blockedAiCrawlers", []);

  // ---- Entity analysis (needed as a site signal by the GEO analyzer) -------
  const entity = analyseEntity({
    pages: crawledPages,
    brandName: project.brand_name,
    siteUrl: project.site_url,
  });

  // ---- SEO (whole-crawl) ---------------------------------------------------
  const { data: latestPagespeed } = await supabase
    .from("pagespeed_runs")
    .select("performance_score")
    .eq("project_id", projectId)
    .eq("strategy", "mobile")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const seo = analyseSeo({
    siteUrl: project.site_url,
    pages: crawledPages,
    sitemapUrls: crawl?.sitemap_urls ?? [],
    blockedAiCrawlers,
    performanceScore: latestPagespeed?.performance_score ?? null,
  });

  // ---- Per-page AEO / GEO / citation readiness ----------------------------
  const aiCrawlersBlockedSiteWide = blockedAiCrawlers.filter((entry) => entry.scope === "site").length;

  const pageScoreRows: Array<Record<string, unknown>> = [];
  const perPageIssues: AnalysisIssue[] = [];
  const aeoForAggregate: Array<{ classification: string; score: number }> = [];
  const geoScores: number[] = [];
  const experienceScores: number[] = [];

  await updateJobProgress({ jobId: job.id, total: rows.length, label: "Scoring pages" });

  for (const [index, row] of rows.entries()) {
    const entry = crawledPages[index];
    if (!entry?.page) continue;
    const page = entry.page;

    const aeo = analysePageAeo(page);
    const geo = analysePageGeo({
      page,
      site: {
        hasOrganizationSchema: entity.siteSignals.hasOrganizationSchema,
        hasAboutPage: entity.siteSignals.hasAboutPage,
        hasContactPage: entity.siteSignals.hasContactPage,
        sameAsUrls: entity.profile.sameAsUrls,
        entityConsistencyScore: entity.profile.consistencyScore,
        aiCrawlersBlockedSiteWide,
        contactDetailsFound: entity.siteSignals.contactDetailsFound,
      },
    });
    const citation = analyseCitationReadiness(page);

    const experience = composeExperienceAuthorityScore({
      firstPartyExpertise: citation.components.find((component) => component.key === "originalExpertise")?.score ?? 0,
      authorIdentity: round(
        booleanScore(Boolean(page.authorName)) * 0.6 +
          booleanScore(page.schemaTypes.some((type) => type.toLowerCase() === "person")) * 0.4,
        1,
      ),
      trustSignals: round(
        booleanScore(entity.siteSignals.hasContactPage) * 0.4 +
          booleanScore(entity.siteSignals.contactDetailsFound) * 0.3 +
          booleanScore(entity.siteSignals.hasAboutPage) * 0.3,
        1,
      ),
      externalValidation: bandScore(entity.profile.sameAsUrls.length, 0, 3),
      performanceExperience: latestPagespeed?.performance_score ?? null,
    });

    const heo = composeHeoScore({
      seo: seo.score,
      aeo: aeo.score,
      geo: geo.score,
      experienceAuthority: experience.score,
    });

    pageScoreRows.push({
      page_id: row.id,
      crawl_id: crawlId,
      project_id: projectId,
      seo_score: seo.score,
      aeo_score: aeo.score,
      geo_score: geo.score,
      experience_authority_score: experience.score,
      heo_score: heo.score,
      citation_readiness_score: citation.score,
      breakdown: {
        aeo: aeo.components,
        geo: geo.components,
        experienceAuthority: experience.components,
        citationReadiness: citation.components,
        citationRecommendations: citation.recommendations,
        aeoSignals: aeo.signals,
        geoSignals: geo.signals,
        suggestions: [...aeo.suggestions, ...geo.suggestions],
      } as unknown as Json,
    });

    perPageIssues.push(...aeo.issues, ...geo.issues);
    aeoForAggregate.push({ classification: page.contentClassification, score: aeo.score });
    geoScores.push(geo.score);
    experienceScores.push(experience.score);

    if (index % 25 === 0) {
      await updateJobProgress({ jobId: job.id, current: index, total: rows.length });
    }
  }

  // ---- Persist page scores and issues -------------------------------------
  if (pageScoreRows.length > 0) {
    const { error } = await supabase
      .from("page_scores")
      .upsert(pageScoreRows as never, { onConflict: "page_id" });
    if (error) log.error("Failed to persist page scores", { crawlId, error });
  }

  const allIssues = [...seo.issues, ...entity.issues, ...dedupeIssues(perPageIssues)];
  await persistIssues(crawlId, projectId, allIssues);

  // ---- Entity profile ------------------------------------------------------
  await supabase.from("entity_profiles").upsert(
    {
      project_id: projectId,
      crawl_id: crawlId,
      brand_name: entity.profile.brandName,
      organization_name: entity.profile.organizationName,
      description: entity.profile.description,
      category: project.business_category,
      products: entity.profile.products,
      services: entity.profile.services,
      locations: entity.profile.locations,
      people: entity.profile.people as unknown as Json,
      same_as_urls: entity.profile.sameAsUrls,
      contact_email: entity.profile.contactEmail,
      contact_phone: entity.profile.contactPhone,
      contact_address: entity.profile.contactAddress,
      primary_topics: entity.profile.primaryTopics,
      target_audience: project.target_audience,
      unique_selling_propositions: entity.profile.uniqueSellingPropositions,
      structured_identity: entity.profile.structuredIdentity as unknown as Json,
      consistency_score: entity.profile.consistencyScore,
    },
    { onConflict: "project_id" },
  );

  await supabase.from("entity_issues").delete().eq("project_id", projectId);
  if (entity.contradictions.length > 0) {
    await supabase.from("entity_issues").insert(
      entity.contradictions.map((contradiction) => ({
        project_id: projectId,
        crawl_id: crawlId,
        field: contradiction.field,
        severity: "medium" as IssueSeverityDb,
        description: contradiction.description,
        conflicting_values: contradiction.values as unknown as Json,
        recommendation: contradiction.recommendation,
      })),
    );
  }

  // ---- Project score snapshot ---------------------------------------------
  const aeoScore = aggregateAeoScores(aeoForAggregate);
  const geoScore = average(geoScores);
  const experienceScore = average(experienceScores);
  const heo = composeHeoScore({
    seo: seo.score,
    aeo: aeoScore,
    geo: geoScore,
    experienceAuthority: experienceScore,
  });

  const aiSummary = await summariseRecentAiVisibility(projectId);

  await supabase.from("project_scores").insert({
    project_id: projectId,
    crawl_id: crawlId,
    v_score: heo.vScore,
    seo_score: seo.score,
    aeo_score: aeoScore,
    geo_score: geoScore,
    experience_authority_score: experienceScore,
    heo_score: heo.score,
    ai_visibility_score: aiSummary?.aiVisibilityScore ?? null,
    mention_rate: aiSummary?.mentionRate ?? null,
    citation_rate: aiSummary?.citationRate ?? null,
    recommendation_rate: aiSummary?.recommendationRate ?? null,
    share_of_voice: aiSummary?.shareOfVoice ?? null,
    prompt_coverage: aiSummary?.promptCoverage ?? null,
    engine_consistency: aiSummary?.engineConsistency ?? null,
    citation_diversity: aiSummary?.citationDiversity ?? null,
    critical_issue_count: allIssues.filter((issue) => issue.severity === "critical").length,
    breakdown: {
      heo: heo.components,
      heoFormula: heo.formula,
      seo: seo.components,
      seoStats: seo.stats,
      entityConsistency: entity.profile.consistencyScore,
    } as unknown as Json,
  });

  await supabase
    .from("projects")
    .update({ initial_scan_completed_at: project.initial_scan_completed_at ?? new Date().toISOString() })
    .eq("id", projectId);

  await enqueueJob({
    jobType: "opportunity_generation",
    projectId,
    organizationId: project.organization_id,
    payload: { crawlId },
    idempotencyKey: `opportunity_generation:${crawlId}`,
    priority: 4,
  });

  await completeJob({
    jobId: job.id,
    label: `Scored ${pageScoreRows.length} pages`,
    result: {
      vScore: heo.vScore,
      seo: seo.score,
      aeo: aeoScore,
      geo: geoScore,
      issues: allIssues.length,
    },
  });
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
}

/** Collapse identical per-page findings into one issue listing every URL. */
function dedupeIssues(issues: readonly AnalysisIssue[]): AnalysisIssue[] {
  const byCode = new Map<string, AnalysisIssue>();
  for (const issue of issues) {
    const existing = byCode.get(issue.code);
    if (!existing) {
      byCode.set(issue.code, { ...issue, affectedUrls: [...issue.affectedUrls] });
      continue;
    }
    for (const url of issue.affectedUrls) {
      if (existing.affectedUrls.length < 50 && !existing.affectedUrls.includes(url)) {
        existing.affectedUrls.push(url);
      }
    }
  }
  return [...byCode.values()];
}

async function persistIssues(
  crawlId: string,
  projectId: string,
  issues: readonly AnalysisIssue[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("page_issues").delete().eq("crawl_id", crawlId);
  if (issues.length === 0) return;

  const rows = issues.map((issue) => ({
    crawl_id: crawlId,
    project_id: projectId,
    issue_code: issue.code,
    title: issue.title,
    description: issue.description,
    severity: issue.severity as IssueSeverityDb,
    disciplines: issue.disciplines as DisciplineDb[],
    why_it_matters: issue.whyItMatters,
    seo_impact: issue.seoImpact,
    aeo_impact: issue.aeoImpact,
    geo_impact: issue.geoImpact,
    recommendation: issue.recommendation,
    implementation_example: issue.implementationExample,
    effort: issue.effort as EffortLevelDb,
    affected_url: issue.affectedUrls[0] ?? null,
    evidence: {
      affectedUrls: issue.affectedUrls,
      ...(issue.evidence ?? {}),
    } as unknown as Json,
  }));

  const { error } = await supabase.from("page_issues").insert(rows);
  if (error) log.error("Failed to persist issues", { crawlId, error });
}

/** AI visibility over the last 30 days, used to fill the score snapshot. */
async function summariseRecentAiVisibility(projectId: string) {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: runs } = await supabase
    .from("ai_runs")
    .select("id, engine, prompt_id, is_valid, brand_mentioned, domain_cited, recommended, sentiment")
    .eq("project_id", projectId)
    .gte("executed_at", since)
    .limit(3000);

  if (!runs || runs.length === 0) return null;

  const runIds = runs.map((run) => run.id);
  const [{ data: citations }, { data: competitorMentions }, { count: promptCount }] = await Promise.all([
    supabase
      .from("ai_citations")
      .select("ai_run_id, url, is_brand_domain")
      .in("ai_run_id", runIds.slice(0, 1000)),
    supabase
      .from("ai_competitor_mentions")
      .select("ai_run_id, brand_name, mentioned, recommended")
      .in("ai_run_id", runIds.slice(0, 1000)),
    supabase
      .from("prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_active", true),
  ]);

  const citationsByRun = new Map<string, string[]>();
  for (const citation of citations ?? []) {
    if (!citation.is_brand_domain) continue;
    const existing = citationsByRun.get(citation.ai_run_id);
    if (existing) existing.push(citation.url);
    else citationsByRun.set(citation.ai_run_id, [citation.url]);
  }

  const mentionsByRun = new Map<string, Array<{ brand: string; mentioned: boolean; recommended: boolean }>>();
  for (const mention of competitorMentions ?? []) {
    const entry = {
      brand: mention.brand_name,
      mentioned: mention.mentioned,
      recommended: mention.recommended,
    };
    const existing = mentionsByRun.get(mention.ai_run_id);
    if (existing) existing.push(entry);
    else mentionsByRun.set(mention.ai_run_id, [entry]);
  }

  const measurable: MeasurableRun[] = runs.map((run) => ({
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

  return summariseAiVisibility(measurable, promptCount ?? undefined);
}
