import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { recordUsage } from "@/lib/billing/usage";
import { buildInitialFrontier, crawlBatch, hashUrl, type CrawlTarget, type CrawledPage } from "@/lib/crawler/crawler";
import { detectBlockedAiCrawlers, fetchRobotsTxt } from "@/lib/crawler/robots";
import { discoverSitemaps } from "@/lib/crawler/sitemap";
import { normalizeUrl } from "@/lib/crawler/url";
import { logger } from "@/lib/logger";
import { completeJob, enqueueJob, payloadValue, rescheduleJob, updateJobProgress } from "@/lib/jobs/queue";
import { notifyOrganization } from "@/lib/notifications/service";
import type { JobRow, Json } from "@/lib/db/types";

const log = logger.child("crawl-job");

/** URLs fetched per invocation. Small enough to finish well inside a function timeout. */
const URLS_PER_BATCH = 12;

interface CrawlJobState {
  crawlId: string;
  frontier: CrawlTarget[];
  seen: string[];
  sitemapUrls: string[];
  declaredSitemaps: string[];
  crawled: number;
  failed: number;
  maxUrls: number;
  respectRobots: boolean;
  concurrency: number;
  delayMs: number;
  robotsRaw: string | null;
  blockedAiCrawlers: Array<{ agent: string; engine: string; purpose: string; scope: string }>;
}

/**
 * Website crawl handler.
 *
 * First invocation performs discovery (robots.txt, sitemaps, frontier) and
 * writes the crawl row. Every invocation after that fetches one batch and
 * re-queues itself until the frontier or the budget is exhausted.
 */
export async function handleWebsiteCrawl(job: JobRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const projectId = job.project_id;
  if (!projectId) throw new Error("website_crawl requires a project_id");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) throw new Error(`Project ${projectId} no longer exists`);

  const existingState = payloadValue<CrawlJobState | null>(job.payload, "state", null);
  const state = existingState ?? (await beginCrawl(job, project.site_url, projectId, project.organization_id));

  const seen = new Set(state.seen);
  const remainingBudget = Math.max(0, state.maxUrls - state.crawled);
  const batch = state.frontier.slice(0, Math.min(URLS_PER_BATCH, remainingBudget));

  if (batch.length === 0) {
    await finishCrawl(job, state, projectId, project.organization_id);
    return;
  }

  const robots = {
    found: state.robotsRaw !== null,
    raw: state.robotsRaw,
    groups: state.robotsRaw ? (await import("@/lib/crawler/robots")).parseRobotsTxt(state.robotsRaw).groups : [],
    sitemaps: state.declaredSitemaps,
  };

  const result = await crawlBatch({
    siteUrl: project.site_url,
    targets: batch,
    robots,
    respectRobots: state.respectRobots,
    concurrency: state.concurrency,
    delayMs: state.delayMs,
    seen,
    remainingBudget: remainingBudget - batch.length,
  });

  await persistPages(state.crawlId, projectId, result.pages);

  const succeeded = result.pages.filter((page) => page.page !== null).length;
  const failed = result.pages.length - succeeded;

  const nextFrontier = [
    ...state.frontier.slice(batch.length),
    ...result.discovered.filter((target) => !seen.has(target.url)),
  ];
  for (const target of result.discovered) seen.add(target.url);

  const nextState: CrawlJobState = {
    ...state,
    frontier: nextFrontier.slice(0, Math.max(0, state.maxUrls * 2)),
    seen: [...seen].slice(0, state.maxUrls * 3),
    crawled: state.crawled + succeeded,
    failed: state.failed + failed,
  };

  await supabase
    .from("crawls")
    .update({
      urls_crawled: nextState.crawled,
      urls_failed: nextState.failed,
      urls_discovered: nextState.seen.length,
    })
    .eq("id", state.crawlId);

  await updateJobProgress({
    jobId: job.id,
    current: nextState.crawled,
    total: Math.min(nextState.maxUrls, nextState.seen.length),
    label: `Crawled ${nextState.crawled} of up to ${nextState.maxUrls} pages`,
  });

  await recordUsage({
    organizationId: project.organization_id,
    projectId,
    metric: "pages_crawled",
    quantity: Math.max(1, succeeded),
    referenceId: state.crawlId,
  });

  const budgetLeft = nextState.maxUrls - nextState.crawled;
  if (nextState.frontier.length === 0 || budgetLeft <= 0) {
    await finishCrawl(job, nextState, projectId, project.organization_id);
    return;
  }

  await rescheduleJob({ jobId: job.id, payloadPatch: { state: nextState as unknown as Json } });
}

async function beginCrawl(
  job: JobRow,
  siteUrl: string,
  projectId: string,
  organizationId: string,
): Promise<CrawlJobState> {
  const supabase = createServiceRoleClient();

  const [{ data: settings }, entitlements] = await Promise.all([
    supabase.from("project_settings").select("*").eq("project_id", projectId).maybeSingle(),
    getEntitlements(organizationId),
  ]);

  // The plan limit is the ceiling; a project setting may lower it but never raise it.
  const maxUrls = Math.min(settings?.max_crawl_urls ?? entitlements.limits.crawledUrls, entitlements.limits.crawledUrls);

  await updateJobProgress({ jobId: job.id, label: "Reading robots.txt and sitemaps", current: 0, total: maxUrls });

  const robots = await fetchRobotsTxt(siteUrl);
  const blocked = detectBlockedAiCrawlers(robots, siteUrl);

  const sitemaps = await discoverSitemaps({
    siteUrl,
    declaredSitemaps: robots.sitemaps,
    maxEntries: maxUrls * 2,
  });

  const frontier = buildInitialFrontier({
    siteUrl,
    sitemapUrls: sitemaps.entries.map((entry) => entry.url),
    maxUrls,
  });

  const { data: crawl, error } = await supabase
    .from("crawls")
    .insert({
      project_id: projectId,
      status: "running",
      trigger_source: payloadValue<string>(job.payload, "triggerSource", "manual"),
      triggered_by: payloadValue<string | null>(job.payload, "triggeredBy", null),
      max_urls: maxUrls,
      urls_discovered: frontier.length,
      robots_txt_found: robots.found,
      robots_txt_content: robots.raw?.slice(0, 20_000) ?? null,
      sitemap_urls: sitemaps.sitemapUrls,
      sitemap_url_count: sitemaps.entries.length,
      ai_crawlers_blocked: blocked.filter((entry) => entry.scope === "site").map((entry) => entry.agent),
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !crawl) throw new Error(`Could not create crawl record: ${error?.message ?? "unknown error"}`);

  await supabase
    .from("projects")
    .update({ last_crawl_at: new Date().toISOString() })
    .eq("id", projectId);

  await recordUsage({
    organizationId,
    projectId,
    metric: "website_audits",
    quantity: 1,
    referenceId: crawl.id,
  });

  return {
    crawlId: crawl.id,
    frontier,
    seen: frontier.map((target) => target.url),
    sitemapUrls: sitemaps.entries.map((entry) => entry.url),
    declaredSitemaps: robots.sitemaps,
    crawled: 0,
    failed: 0,
    maxUrls,
    respectRobots: settings?.respect_robots ?? true,
    concurrency: settings?.crawl_concurrency ?? 4,
    delayMs: settings?.crawl_delay_ms ?? 400,
    robotsRaw: robots.raw,
    blockedAiCrawlers: blocked,
  };
}

async function persistPages(
  crawlId: string,
  projectId: string,
  pages: readonly CrawledPage[],
): Promise<void> {
  if (pages.length === 0) return;
  const supabase = createServiceRoleClient();

  const rows = pages.map((entry) => {
    const page = entry.page;
    return {
      crawl_id: crawlId,
      project_id: projectId,
      url: entry.finalUrl,
      url_hash: hashUrl(entry.finalUrl),
      depth: entry.depth,
      http_status: entry.httpStatus,
      content_type: entry.contentType,
      response_time_ms: entry.responseTimeMs,
      redirected_to: entry.redirectChain.at(-1) ?? null,
      redirect_chain: entry.redirectChain,
      fetch_error: entry.fetchError,
      title: page?.title ?? null,
      title_length: page?.titleLength ?? null,
      meta_description: page?.metaDescription ?? null,
      meta_description_length: page?.metaDescriptionLength ?? null,
      canonical_url: page?.canonicalUrl ?? null,
      robots_meta: page?.robotsMeta ?? null,
      is_indexable: page?.isIndexable ?? null,
      noindex: page?.noindex ?? false,
      nofollow: page?.nofollow ?? false,
      h1: page?.h1 ?? [],
      h2: page?.h2.slice(0, 50) ?? [],
      h3: page?.h3.slice(0, 50) ?? [],
      question_headings: page?.questionHeadings.slice(0, 40) ?? [],
      word_count: page?.wordCount ?? 0,
      language: page?.language ?? null,
      content_text: page?.contentText.slice(0, 40_000) ?? null,
      direct_answer_paragraphs: page?.directAnswerParagraphs.slice(0, 20) ?? [],
      open_graph: (page?.openGraph ?? {}) as Json,
      twitter_card: (page?.twitterCard ?? {}) as Json,
      structured_data: (page?.structuredData ?? []) as Json,
      schema_types: page?.schemaTypes ?? [],
      image_count: page?.imageCount ?? 0,
      images_missing_alt: page?.imagesMissingAlt ?? 0,
      internal_link_count: page?.internalLinkCount ?? 0,
      external_link_count: page?.externalLinkCount ?? 0,
      nofollow_link_count: page?.nofollowLinkCount ?? 0,
      has_faq_content: page?.hasFaqContent ?? false,
      faq_pairs: (page?.faqPairs ?? []) as unknown as Json,
      table_count: page?.tableCount ?? 0,
      list_count: page?.listCount ?? 0,
      has_breadcrumbs: page?.hasBreadcrumbs ?? false,
      author_name: page?.authorName ?? null,
      published_date: page?.publishedDate ?? null,
      modified_date: page?.modifiedDate ?? null,
      content_classification: page?.contentClassification ?? null,
      is_https: entry.finalUrl.startsWith("https://"),
      has_mixed_content: page?.hasMixedContent ?? false,
      crawled_at: new Date().toISOString(),
    };
  });

  // Upsert on (crawl_id, url_hash) so a retried batch cannot duplicate rows.
  const { data: inserted, error } = await supabase
    .from("crawl_pages")
    .upsert(rows, { onConflict: "crawl_id,url_hash" })
    .select("id, url");

  if (error) {
    log.error("Failed to persist crawl pages", { crawlId, error });
    return;
  }

  const idByUrl = new Map((inserted ?? []).map((row) => [row.url, row.id]));
  const linkRows = pages.flatMap((entry) => {
    const sourceId = idByUrl.get(entry.finalUrl);
    if (!sourceId || !entry.page) return [];
    return entry.page.links.slice(0, 300).map((link) => ({
      crawl_id: crawlId,
      source_page_id: sourceId,
      target_url: link.url,
      anchor_text: link.anchorText.slice(0, 300) || null,
      is_internal: link.isInternal,
      is_nofollow: link.isNofollow,
    }));
  });

  if (linkRows.length > 0) {
    const { error: linkError } = await supabase.from("page_links").insert(linkRows);
    if (linkError) log.warn("Failed to persist page links", { crawlId, error: linkError });
  }
}

async function finishCrawl(
  job: JobRow,
  state: CrawlJobState,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();

  await supabase
    .from("crawls")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      urls_crawled: state.crawled,
      urls_failed: state.failed,
    })
    .eq("id", state.crawlId);

  await enqueueJob({
    jobType: "page_analysis",
    projectId,
    organizationId,
    payload: { crawlId: state.crawlId, blockedAiCrawlers: state.blockedAiCrawlers },
    idempotencyKey: `page_analysis:${state.crawlId}`,
    priority: 3,
  });

  await completeJob({
    jobId: job.id,
    label: `Crawled ${state.crawled} pages`,
    result: { crawlId: state.crawlId, crawled: state.crawled, failed: state.failed },
  });

  await notifyOrganization(organizationId, {
    projectId,
    type: "audit_complete",
    title: "Website audit complete",
    body: `We crawled ${state.crawled} page${state.crawled === 1 ? "" : "s"} and your scores are ready.`,
    actionUrl: "/app/audit",
  });
}

export { normalizeUrl };
