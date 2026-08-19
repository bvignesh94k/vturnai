/**
 * Sitemap discovery and parsing.
 *
 * Handles sitemap indexes, plain sitemaps and gzip-less text sitemaps. A site
 * that declares a sitemap gives us a far better crawl seed than link discovery
 * alone, and the difference between declared and reachable URLs is itself a
 * finding we report.
 */

import * as cheerio from "cheerio";
import { safeFetch } from "@/lib/crawler/fetcher";
import { normalizeUrl, isSameSite } from "@/lib/crawler/url";
import { unique } from "@/lib/utils";

export interface SitemapEntry {
  url: string;
  lastModified: string | null;
  changeFrequency: string | null;
  priority: number | null;
}

export interface SitemapDiscovery {
  /** Sitemap documents that were located and parsed. */
  sitemapUrls: string[];
  entries: SitemapEntry[];
  errors: Array<{ url: string; message: string }>;
}

const COMMON_SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
  "/wp-sitemap.xml",
  "/sitemap.txt",
];

const MAX_SITEMAP_DOCUMENTS = 25;
const MAX_ENTRIES = 5000;

function parseXmlSitemap(xml: string): { entries: SitemapEntry[]; nestedSitemaps: string[] } {
  const $ = cheerio.load(xml, { xml: true });
  const entries: SitemapEntry[] = [];
  const nestedSitemaps: string[] = [];

  $("sitemapindex > sitemap > loc").each((_, element) => {
    const value = $(element).text().trim();
    if (value) nestedSitemaps.push(value);
  });

  $("urlset > url").each((_, element) => {
    const node = $(element);
    const loc = node.find("loc").first().text().trim();
    if (!loc) return;
    const priorityText = node.find("priority").first().text().trim();
    const priority = priorityText ? Number.parseFloat(priorityText) : null;
    entries.push({
      url: loc,
      lastModified: node.find("lastmod").first().text().trim() || null,
      changeFrequency: node.find("changefreq").first().text().trim() || null,
      priority: priority !== null && Number.isFinite(priority) ? priority : null,
    });
  });

  return { entries, nestedSitemaps };
}

function parseTextSitemap(text: string): SitemapEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line))
    .map((url) => ({ url, lastModified: null, changeFrequency: null, priority: null }));
}

/**
 * Fetch and parse a sitemap tree, following index documents breadth-first.
 * Bounded by document count and entry count so a hostile sitemap cannot be used
 * to exhaust the crawl budget.
 */
export async function discoverSitemaps(input: {
  siteUrl: string;
  declaredSitemaps?: readonly string[];
  maxEntries?: number;
}): Promise<SitemapDiscovery> {
  const maxEntries = input.maxEntries ?? MAX_ENTRIES;
  const candidates = unique([
    ...(input.declaredSitemaps ?? []),
    ...COMMON_SITEMAP_PATHS.map((path) => {
      try {
        return new URL(path, input.siteUrl).toString();
      } catch {
        return "";
      }
    }).filter(Boolean),
  ]);

  const queue = [...candidates];
  const visited = new Set<string>();
  const sitemapUrls: string[] = [];
  const entries: SitemapEntry[] = [];
  const errors: Array<{ url: string; message: string }> = [];

  while (queue.length > 0 && visited.size < MAX_SITEMAP_DOCUMENTS && entries.length < maxEntries) {
    const next = queue.shift();
    if (!next) break;
    const normalized = normalizeUrl(next, { keepQuery: true });
    if (!normalized || visited.has(normalized)) continue;
    visited.add(normalized);

    // Never follow a sitemap that points off-site.
    if (!isSameSite(normalized, input.siteUrl)) continue;

    try {
      const response = await safeFetch(normalized, {
        timeoutMs: 15_000,
        maxBytes: 10 * 1024 * 1024,
        acceptHeader: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
      });

      if (!response.ok) {
        // A missing well-known path is expected, not an error worth surfacing.
        if (!input.declaredSitemaps?.includes(next)) continue;
        errors.push({ url: normalized, message: `Returned HTTP ${response.status}` });
        continue;
      }

      sitemapUrls.push(normalized);

      const isText =
        normalized.endsWith(".txt") || (response.contentType ?? "").includes("text/plain");

      if (isText) {
        entries.push(...parseTextSitemap(response.body));
        continue;
      }

      const parsed = parseXmlSitemap(response.body);
      entries.push(...parsed.entries);
      for (const nested of parsed.nestedSitemaps) {
        if (!visited.has(nested)) queue.push(nested);
      }
    } catch (error) {
      if (input.declaredSitemaps?.includes(next)) {
        errors.push({
          url: normalized,
          message: error instanceof Error ? error.message : "Could not be fetched",
        });
      }
    }
  }

  // De-duplicate while keeping the richest metadata for each URL.
  const byUrl = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const normalized = normalizeUrl(entry.url);
    if (!normalized || !isSameSite(normalized, input.siteUrl)) continue;
    const existing = byUrl.get(normalized);
    if (!existing) {
      byUrl.set(normalized, { ...entry, url: normalized });
    } else if (!existing.lastModified && entry.lastModified) {
      byUrl.set(normalized, { ...existing, lastModified: entry.lastModified });
    }
  }

  return {
    sitemapUrls,
    entries: [...byUrl.values()].slice(0, maxEntries),
    errors,
  };
}
