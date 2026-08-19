import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertPublicUrl } from "@/lib/security/ssrf";
import { logger } from "@/lib/logger";
import { isRecord, round } from "@/lib/utils";
import type { Json } from "@/lib/db/types";

/**
 * PageSpeed Insights.
 *
 * Never run automatically across a whole crawl: the API is quota-limited and
 * each call takes many seconds. Only the homepage, the top landing pages, the
 * commercially important pages and anything the user picks are measured.
 */

const log = logger.child("pagespeed");
const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PagespeedStrategy = "mobile" | "desktop";

export interface PagespeedOpportunity {
  id: string;
  title: string;
  description: string;
  savingsMs: number | null;
  displayValue: string | null;
}

export interface PagespeedResult {
  url: string;
  strategy: PagespeedStrategy;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  speedIndexMs: number | null;
  totalBlockingTimeMs: number | null;
  opportunities: PagespeedOpportunity[];
}

export function isPagespeedConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PAGESPEED_API_KEY?.trim());
}

function categoryScore(categories: unknown, key: string): number | null {
  if (!isRecord(categories)) return null;
  const category = categories[key];
  if (!isRecord(category)) return null;
  const score = category["score"];
  return typeof score === "number" ? round(score * 100, 0) : null;
}

function auditNumber(audits: unknown, key: string): number | null {
  if (!isRecord(audits)) return null;
  const audit = audits[key];
  if (!isRecord(audit)) return null;
  const value = audit["numericValue"];
  return typeof value === "number" ? round(value, 3) : null;
}

function extractOpportunities(audits: unknown): PagespeedOpportunity[] {
  if (!isRecord(audits)) return [];
  const results: PagespeedOpportunity[] = [];

  for (const [id, audit] of Object.entries(audits)) {
    if (!isRecord(audit)) continue;
    const details = audit["details"];
    if (!isRecord(details) || details["type"] !== "opportunity") continue;
    const score = audit["score"];
    if (typeof score === "number" && score >= 0.9) continue;

    results.push({
      id,
      title: typeof audit["title"] === "string" ? audit["title"] : id,
      description: typeof audit["description"] === "string" ? audit["description"] : "",
      savingsMs: typeof details["overallSavingsMs"] === "number" ? Math.round(details["overallSavingsMs"]) : null,
      displayValue: typeof audit["displayValue"] === "string" ? audit["displayValue"] : null,
    });
  }

  return results.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0)).slice(0, 12);
}

export async function runPagespeed(input: {
  url: string;
  strategy: PagespeedStrategy;
}): Promise<PagespeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY?.trim();
  if (!apiKey) throw new Error("GOOGLE_PAGESPEED_API_KEY is not configured.");

  // The URL originates from a user-supplied site, so it is validated here too.
  assertPublicUrl(input.url);

  const params = new URLSearchParams({
    url: input.url,
    strategy: input.strategy,
    key: apiKey,
  });
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) {
    params.append("category", category);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new Error(aborted ? "PageSpeed Insights timed out." : "PageSpeed Insights could not be reached.");
  }
  clearTimeout(timer);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `PageSpeed Insights returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error("PageSpeed Insights returned an unexpected response.");

  const lighthouse = payload["lighthouseResult"];
  const categories = isRecord(lighthouse) ? lighthouse["categories"] : null;
  const audits = isRecord(lighthouse) ? lighthouse["audits"] : null;

  return {
    url: input.url,
    strategy: input.strategy,
    performanceScore: categoryScore(categories, "performance"),
    accessibilityScore: categoryScore(categories, "accessibility"),
    bestPracticesScore: categoryScore(categories, "best-practices"),
    seoScore: categoryScore(categories, "seo"),
    lcpMs: auditNumber(audits, "largest-contentful-paint"),
    cls: auditNumber(audits, "cumulative-layout-shift"),
    inpMs: auditNumber(audits, "interaction-to-next-paint"),
    fcpMs: auditNumber(audits, "first-contentful-paint"),
    ttfbMs: auditNumber(audits, "server-response-time"),
    speedIndexMs: auditNumber(audits, "speed-index"),
    totalBlockingTimeMs: auditNumber(audits, "total-blocking-time"),
    opportunities: extractOpportunities(audits),
  };
}

export async function storePagespeedResult(input: {
  projectId: string;
  pageId?: string | null;
  result: PagespeedResult;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { result } = input;

  const { error } = await supabase.from("pagespeed_runs").insert({
    project_id: input.projectId,
    page_id: input.pageId ?? null,
    url: result.url,
    strategy: result.strategy,
    performance_score: result.performanceScore,
    accessibility_score: result.accessibilityScore,
    best_practices_score: result.bestPracticesScore,
    seo_score: result.seoScore,
    lcp_ms: result.lcpMs === null ? null : Math.round(result.lcpMs),
    cls: result.cls,
    inp_ms: result.inpMs === null ? null : Math.round(result.inpMs),
    fcp_ms: result.fcpMs === null ? null : Math.round(result.fcpMs),
    ttfb_ms: result.ttfbMs === null ? null : Math.round(result.ttfbMs),
    speed_index_ms: result.speedIndexMs === null ? null : Math.round(result.speedIndexMs),
    total_blocking_time_ms:
      result.totalBlockingTimeMs === null ? null : Math.round(result.totalBlockingTimeMs),
    opportunities: result.opportunities as unknown as Json,
  });

  if (error) log.error("Failed to store PageSpeed result", { url: result.url, error });
}

/**
 * Choose which pages are worth measuring, in priority order: the homepage
 * first, then commercially important page types, then the pages Search Console
 * says actually receive impressions.
 */
export async function selectPagespeedTargets(input: {
  projectId: string;
  limit?: number;
}): Promise<Array<{ url: string; pageId: string | null; reason: string }>> {
  const supabase = createServiceRoleClient();
  const limit = input.limit ?? 5;

  const { data: crawl } = await supabase
    .from("crawls")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!crawl) return [];

  const { data: pages } = await supabase
    .from("crawl_pages")
    .select("id, url, content_classification, internal_link_count")
    .eq("crawl_id", crawl.id)
    .is("fetch_error", null)
    .limit(500);

  if (!pages || pages.length === 0) return [];

  const { data: topPages } = await supabase
    .from("search_console_metrics")
    .select("dimension_value, impressions")
    .eq("project_id", input.projectId)
    .eq("dimension", "page")
    .order("impressions", { ascending: false })
    .limit(50);

  const impressions = new Map<string, number>();
  for (const row of topPages ?? []) {
    impressions.set(row.dimension_value, (impressions.get(row.dimension_value) ?? 0) + row.impressions);
  }

  const priorityOf = (classification: string | null): number => {
    if (classification === "homepage") return 0;
    if (classification === "pricing") return 1;
    if (classification === "product" || classification === "service") return 2;
    if (classification === "comparison") return 3;
    return 5;
  };

  return pages
    .map((page) => ({
      url: page.url,
      pageId: page.id,
      classification: page.content_classification,
      impressions: impressions.get(page.url) ?? 0,
      priority: priorityOf(page.content_classification),
      links: page.internal_link_count,
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.impressions !== b.impressions) return b.impressions - a.impressions;
      return b.links - a.links;
    })
    .slice(0, limit)
    .map((page) => ({
      url: page.url,
      pageId: page.pageId,
      reason:
        page.classification === "homepage"
          ? "Homepage"
          : page.impressions > 0
            ? `Top landing page (${page.impressions.toLocaleString("en-IN")} impressions)`
            : `Important ${page.classification ?? "page"}`,
    }));
}
