/**
 * robots.txt parsing.
 *
 * Two jobs: keep the V Turn AI crawler compliant, and tell the user whether
 * they are blocking the AI crawlers that feed generative answer engines — a
 * common and completely invisible cause of zero AI visibility.
 */

import { safeFetch } from "@/lib/crawler/fetcher";
import { normalizeSiteUrl } from "@/lib/crawler/url";
import { SITE } from "@/lib/config/site";

export interface RobotsGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
  crawlDelaySeconds: number | null;
}

export interface RobotsTxt {
  found: boolean;
  raw: string | null;
  groups: RobotsGroup[];
  sitemaps: string[];
  fetchError?: string;
}

/**
 * User agents used by AI answer engines to fetch pages for retrieval and
 * training. Blocking these does not improve privacy in any way a business owner
 * usually intends — it removes them from AI answers entirely.
 */
export const AI_CRAWLER_AGENTS = [
  { agent: "GPTBot", engine: "OpenAI", purpose: "Training and retrieval for ChatGPT" },
  { agent: "OAI-SearchBot", engine: "OpenAI", purpose: "Search index behind ChatGPT search" },
  { agent: "ChatGPT-User", engine: "OpenAI", purpose: "Live page fetch when ChatGPT browses" },
  { agent: "Google-Extended", engine: "Google", purpose: "Gemini grounding and AI answers" },
  { agent: "ClaudeBot", engine: "Anthropic", purpose: "Retrieval for Claude" },
  { agent: "Claude-Web", engine: "Anthropic", purpose: "Live page fetch when Claude browses" },
  { agent: "anthropic-ai", engine: "Anthropic", purpose: "Anthropic content fetching" },
  { agent: "PerplexityBot", engine: "Perplexity", purpose: "Indexing for Perplexity answers" },
  { agent: "Perplexity-User", engine: "Perplexity", purpose: "Live page fetch for Perplexity" },
  { agent: "Applebot-Extended", engine: "Apple", purpose: "Apple Intelligence" },
  { agent: "Bingbot", engine: "Microsoft", purpose: "Bing index, which also feeds Copilot" },
  { agent: "CCBot", engine: "Common Crawl", purpose: "Open crawl used by many AI datasets" },
] as const;

function normaliseRule(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function parseRobotsTxt(raw: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasUserAgent = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group of rules.
      if (!current || !lastLineWasUserAgent) {
        current = { userAgents: [], allow: [], disallow: [], crawlDelaySeconds: null };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastLineWasUserAgent = true;
      continue;
    }

    lastLineWasUserAgent = false;

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (!current) continue;

    if (field === "allow") {
      const rule = normaliseRule(value);
      if (rule) current.allow.push(rule);
    } else if (field === "disallow") {
      // An empty Disallow means "allow everything" and is not a rule.
      if (value.trim()) current.disallow.push(normaliseRule(value));
    } else if (field === "crawl-delay") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed >= 0) current.crawlDelaySeconds = parsed;
    }
  }

  return { groups, sitemaps };
}

export async function fetchRobotsTxt(siteUrl: string): Promise<RobotsTxt> {
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) {
    return { found: false, raw: null, groups: [], sitemaps: [], fetchError: "Invalid site URL" };
  }

  const robotsUrl = new URL("/robots.txt", normalized).toString();
  try {
    const response = await safeFetch(robotsUrl, {
      timeoutMs: 10_000,
      maxBytes: 512 * 1024,
      acceptHeader: "text/plain,*/*;q=0.8",
    });

    if (!response.ok || response.status === 404) {
      return { found: false, raw: null, groups: [], sitemaps: [] };
    }

    const parsed = parseRobotsTxt(response.body);
    return { found: true, raw: response.body, ...parsed };
  } catch (error) {
    return {
      found: false,
      raw: null,
      groups: [],
      sitemaps: [],
      fetchError: error instanceof Error ? error.message : "robots.txt could not be fetched",
    };
  }
}

/** The most specific matching group for a user agent, per the robots.txt spec. */
export function matchGroup(robots: RobotsTxt, userAgent: string): RobotsGroup | null {
  const needle = userAgent.toLowerCase();
  let best: { group: RobotsGroup; specificity: number } | null = null;

  for (const group of robots.groups) {
    for (const agent of group.userAgents) {
      const isWildcard = agent === "*";
      const matches = isWildcard || needle.includes(agent);
      if (!matches) continue;
      const specificity = isWildcard ? 0 : agent.length;
      if (!best || specificity > best.specificity) best = { group, specificity };
    }
  }

  return best?.group ?? null;
}

function ruleMatches(path: string, rule: string): boolean {
  if (!rule) return false;
  const anchoredEnd = rule.endsWith("$");
  const pattern = anchoredEnd ? rule.slice(0, -1) : rule;
  const segments = pattern.split("*");

  let cursor = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] as string;
    if (segment === "") continue;
    const index = i === 0 ? (path.startsWith(segment) ? 0 : -1) : path.indexOf(segment, cursor);
    if (index === -1) return false;
    cursor = index + segment.length;
  }

  if (anchoredEnd) return cursor === path.length;
  return true;
}

/** Longest-match Allow/Disallow resolution, as search engines implement it. */
export function isAllowed(robots: RobotsTxt, url: string, userAgent = SITE.crawlerToken): boolean {
  if (!robots.found) return true;
  const group = matchGroup(robots, userAgent);
  if (!group) return true;

  let path: string;
  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    return false;
  }

  let bestAllow = -1;
  let bestDisallow = -1;
  for (const rule of group.allow) {
    if (ruleMatches(path, rule)) bestAllow = Math.max(bestAllow, rule.length);
  }
  for (const rule of group.disallow) {
    if (ruleMatches(path, rule)) bestDisallow = Math.max(bestDisallow, rule.length);
  }

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

export interface BlockedAiCrawler {
  agent: string;
  engine: string;
  purpose: string;
  scope: "site" | "partial";
}

/**
 * Report which AI crawlers the site blocks. `site` means the entire site is
 * disallowed for that agent; `partial` means only some paths are.
 *
 * Only agents named explicitly, or covered by a wildcard group that disallows
 * something, are reported — an unmatched agent is not blocked.
 */
export function detectBlockedAiCrawlers(robots: RobotsTxt, siteUrl?: string): BlockedAiCrawler[] {
  if (!robots.found) return [];
  const rootUrl = siteUrl ?? "https://example.com/";
  const blocked: BlockedAiCrawler[] = [];

  for (const crawler of AI_CRAWLER_AGENTS) {
    const group = matchGroup(robots, crawler.agent);
    if (!group || group.disallow.length === 0) continue;

    const blocksRoot = !isAllowed(robots, rootUrl, crawler.agent);
    const blocksEverything =
      group.disallow.some((rule) => rule === "/" || rule === "/*") &&
      !group.allow.some((rule) => rule === "/");

    if (blocksEverything) {
      blocked.push({ ...crawler, scope: "site" });
    } else if (blocksRoot || group.disallow.length > 0) {
      blocked.push({ ...crawler, scope: "partial" });
    }
  }

  return blocked;
}

export function crawlDelayMs(robots: RobotsTxt, fallbackMs: number): number {
  const group = matchGroup(robots, SITE.crawlerToken);
  const delaySeconds = group?.crawlDelaySeconds;
  if (delaySeconds === null || delaySeconds === undefined) return fallbackMs;
  // Cap at 10s so a hostile or mistaken robots.txt cannot stall a crawl forever.
  return Math.min(10_000, Math.max(fallbackMs, delaySeconds * 1000));
}
