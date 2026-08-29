/**
 * The crawl engine.
 *
 * Designed for serverless execution: `crawlBatch` processes a bounded slice of
 * the frontier and returns, so a 500-page crawl is many short invocations
 * rather than one request that would exceed any function timeout.
 */

import { createHash } from "node:crypto";
import { crawlDelayMs, isAllowed, type RobotsTxt } from "@/lib/crawler/robots";
import { extractPage, type ExtractedPage } from "@/lib/crawler/extractor";
import { FetchFailedError, mapWithConcurrency, safeFetch, sleep } from "@/lib/crawler/fetcher";
import { evaluateCrawlEligibility, normalizeUrl } from "@/lib/crawler/url";
import { BlockedRequestError } from "@/lib/security/ssrf";
import { errorMessage } from "@/lib/logger";

export interface CrawlTarget {
  url: string;
  depth: number;
  /**
   * How this URL came to be in the frontier, carried so the job handler can
   * record its provenance. Without it a page arrives in the database with no
   * account of why it was crawled, which is how findings end up citing pages
   * nobody can trace.
   */
  source?: "project_seed" | "sitemap" | "internal_link";
  /** The page that linked here, for `internal_link`. */
  discoveredFrom?: string;
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  urlHash: string;
  depth: number;
  httpStatus: number | null;
  contentType: string | null;
  responseTimeMs: number | null;
  redirectChain: string[];
  fetchError: string | null;
  page: ExtractedPage | null;
}

export interface CrawlBatchInput {
  siteUrl: string;
  targets: readonly CrawlTarget[];
  robots: RobotsTxt;
  respectRobots: boolean;
  concurrency: number;
  delayMs: number;
  maxDepth?: number;
  /** URLs already crawled or queued, so discovery does not re-add them. */
  seen: ReadonlySet<string>;
  remainingBudget: number;
}

export interface CrawlBatchResult {
  pages: CrawledPage[];
  /** Newly discovered, eligible, in-budget URLs to append to the frontier. */
  discovered: CrawlTarget[];
  skipped: Array<{ url: string; reason: string }>;
}

export const DEFAULT_MAX_DEPTH = 5;

export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 40);
}

function isHtmlResponse(contentType: string | null): boolean {
  if (!contentType) return true;
  const value = contentType.toLowerCase();
  return value.includes("text/html") || value.includes("application/xhtml");
}

/**
 * Crawl one batch of URLs.
 *
 * A failure on one page never aborts the batch: the page is recorded with its
 * error so the audit can report "12 pages could not be fetched" rather than
 * silently under-reporting the site.
 */
export async function crawlBatch(input: CrawlBatchInput): Promise<CrawlBatchResult> {
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  const effectiveDelay = input.respectRobots
    ? crawlDelayMs(input.robots, input.delayMs)
    : input.delayMs;

  const skipped: Array<{ url: string; reason: string }> = [];
  const discoveredMap = new Map<string, CrawlTarget>();

  const pages = await mapWithConcurrency(
    input.targets,
    Math.max(1, Math.min(input.concurrency, 8)),
    async (target, index): Promise<CrawledPage> => {
      // Stagger requests within the batch so we never burst a small site.
      if (effectiveDelay > 0 && index > 0) {
        await sleep(Math.min(effectiveDelay, 2000));
      }

      const urlHash = hashUrl(target.url);
      const base: CrawledPage = {
        url: target.url,
        finalUrl: target.url,
        urlHash,
        depth: target.depth,
        httpStatus: null,
        contentType: null,
        responseTimeMs: null,
        redirectChain: [],
        fetchError: null,
        page: null,
      };

      if (input.respectRobots && !isAllowed(input.robots, target.url)) {
        return { ...base, fetchError: "Blocked by robots.txt" };
      }

      try {
        const response = await safeFetch(target.url, { timeoutMs: 15_000 });

        const result: CrawledPage = {
          ...base,
          finalUrl: response.finalUrl,
          httpStatus: response.status,
          contentType: response.contentType,
          responseTimeMs: response.responseTimeMs,
          redirectChain: response.redirectChain,
        };

        if (!response.ok) {
          return { ...result, fetchError: `HTTP ${response.status}` };
        }
        if (!isHtmlResponse(response.contentType)) {
          return { ...result, fetchError: "Not an HTML document" };
        }

        const extracted = extractPage(response.body, response.finalUrl, input.siteUrl);

        // Queue newly discovered internal links.
        if (target.depth < maxDepth) {
          for (const link of extracted.links) {
            if (!link.isInternal) continue;
            const normalized = normalizeUrl(link.url);
            if (!normalized || input.seen.has(normalized) || discoveredMap.has(normalized)) continue;
            const eligibility = evaluateCrawlEligibility(normalized, input.siteUrl);
            if (!eligibility.eligible) {
              skipped.push({ url: normalized, reason: eligibility.reason ?? "ineligible" });
              continue;
            }
            if (input.respectRobots && !isAllowed(input.robots, normalized)) {
              skipped.push({ url: normalized, reason: "robots-disallow" });
              continue;
            }
            discoveredMap.set(normalized, {
              url: normalized,
              depth: target.depth + 1,
              source: "internal_link",
              discoveredFrom: response.finalUrl,
            });
          }
        }

        return { ...result, page: extracted };
      } catch (error) {
        if (error instanceof BlockedRequestError) {
          return { ...base, fetchError: error.message };
        }
        if (error instanceof FetchFailedError) {
          return { ...base, fetchError: error.message };
        }
        return { ...base, fetchError: errorMessage(error) };
      }
    },
  );

  return {
    pages,
    discovered: [...discoveredMap.values()].slice(0, Math.max(0, input.remainingBudget)),
    skipped,
  };
}

/**
 * Build the initial frontier: the homepage, then sitemap URLs in declared
 * order, trimmed to the crawl budget.
 */
export function buildInitialFrontier(input: {
  siteUrl: string;
  sitemapUrls: readonly string[];
  maxUrls: number;
}): CrawlTarget[] {
  const frontier: CrawlTarget[] = [];
  const seen = new Set<string>();

  const home = normalizeUrl(input.siteUrl);
  if (home) {
    frontier.push({ url: home, depth: 0, source: "project_seed" });
    seen.add(home);
  }

  for (const url of input.sitemapUrls) {
    if (frontier.length >= input.maxUrls) break;
    const normalized = normalizeUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    if (!evaluateCrawlEligibility(normalized, input.siteUrl).eligible) continue;
    seen.add(normalized);
    frontier.push({ url: normalized, depth: 1, source: "sitemap" });
  }

  return frontier;
}
