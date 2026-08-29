import "server-only";

import { hashUrl } from "@/lib/crawler/crawler";
import { normalizeUrl } from "@/lib/crawler/url";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const log = logger.child("url-provenance");

/**
 * Where every URL in the product came from.
 *
 * The rule this module exists to enforce: nothing is presented to a customer as
 * a page of their site unless we can say how we found it. Anything analysis
 * merely proposes is labelled a suggestion instead, because telling someone
 * their site has a page it does not have destroys trust in every other number
 * on the screen.
 */

export type UrlSource =
  | "project_seed"
  | "internal_link"
  | "sitemap"
  | "redirect"
  | "canonical"
  | "search_console"
  | "bing_webmaster"
  | "analytics_landing_page"
  | "user_input"
  | "suggested";

/** Human wording for a source, used wherever provenance is shown. */
export const URL_SOURCE_LABELS: Record<UrlSource, string> = {
  project_seed: "Your project address",
  internal_link: "Linked from",
  sitemap: "Declared in your sitemap",
  redirect: "Redirect target",
  canonical: "Named as canonical by",
  search_console: "Reported by Google Search Console",
  bing_webmaster: "Reported by Bing Webmaster Tools",
  analytics_landing_page: "A landing page in Google Analytics",
  user_input: "Entered by you",
  suggested: "Suggested by analysis, not found on your site",
};

export interface DiscoveryInput {
  projectId: string;
  url: string;
  sourceType: UrlSource;
  /** The page, sitemap or integration this came from. */
  sourceDetail?: string | null;
  crawlId?: string | null;
}

/**
 * Record how a URL came to our attention.
 *
 * Re-finding the same URL from the same place updates when it was last seen
 * rather than adding a row, so the table stays a record of distinct routes to a
 * page instead of a log of every crawl.
 */
export async function recordDiscoveries(discoveries: DiscoveryInput[]): Promise<number> {
  if (discoveries.length === 0) return 0;

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const rows = discoveries.flatMap((discovery) => {
    const normalized = normalizeUrl(discovery.url);
    // A URL that will not normalise is not a URL we can be accountable for.
    if (!normalized) return [];

    return [
      {
        project_id: discovery.projectId,
        url: discovery.url.slice(0, 2048),
        normalized_url: normalized.slice(0, 2048),
        url_hash: hashUrl(normalized),
        source_type: discovery.sourceType,
        source_detail: discovery.sourceDetail?.slice(0, 2048) ?? null,
        crawl_id: discovery.crawlId ?? null,
        last_seen_at: now,
      },
    ];
  });

  if (rows.length === 0) return 0;

  let stored = 0;
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = await supabase
      .from("url_discoveries")
      .upsert(chunk, { onConflict: "project_id,url_hash,source_type,source_detail" });

    if (error) {
      // Provenance failing must never fail a crawl: a page recorded without its
      // origin is recoverable, a lost crawl is not. It is logged loudly instead.
      log.error("Could not record URL discoveries", { count: chunk.length, error });
      continue;
    }
    stored += chunk.length;
  }

  return stored;
}

export interface UrlProvenance {
  url: string;
  normalizedUrl: string;
  sources: Array<{ type: UrlSource; label: string; detail: string | null; lastSeenAt: Date }>;
}

/**
 * Every recorded route to a set of URLs.
 *
 * Returned keyed by normalized URL, because that is the identity the rest of
 * the product reasons about.
 */
export async function getProvenance(input: {
  projectId: string;
  urls: string[];
}): Promise<Map<string, UrlProvenance>> {
  const result = new Map<string, UrlProvenance>();
  if (input.urls.length === 0) return result;

  const hashes = input.urls
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => url !== null)
    .map((url) => hashUrl(url));

  if (hashes.length === 0) return result;

  const supabase = createServiceRoleClient();

  // Chunked deliberately. A truncated lookup would report real pages as having
  // no provenance, and callers treat that as grounds to drop them, so a silent
  // cap here would delete evidence rather than merely slow things down.
  for (let index = 0; index < hashes.length; index += 200) {
    const chunk = hashes.slice(index, index + 200);
    const { data, error } = await supabase
      .from("url_discoveries")
      .select("url, normalized_url, source_type, source_detail, last_seen_at")
      .eq("project_id", input.projectId)
      .in("url_hash", chunk);

    if (error) {
      // Better to fail loudly than to return a partial map that reads as
      // "these URLs have no origin".
      throw new Error(`Could not read URL provenance: ${error.message}`);
    }

    for (const row of data ?? []) {
      const entry = result.get(row.normalized_url) ?? {
        url: row.url,
        normalizedUrl: row.normalized_url,
        sources: [],
      };
      entry.sources.push({
        type: row.source_type as UrlSource,
        label: URL_SOURCE_LABELS[row.source_type as UrlSource],
        detail: row.source_detail,
        lastSeenAt: new Date(row.last_seen_at),
      });
      result.set(row.normalized_url, entry);
    }
  }

  return result;
}

/**
 * One readable line per URL saying how we found it, keyed by the URL as given.
 *
 * Where a page was found several ways the strongest evidence wins, because a
 * reader wants the most convincing answer to "why is this here", not a list.
 * Being linked from a real page beats being declared in a sitemap, which in
 * turn beats an integration merely reporting the address.
 */
export async function getProvenanceLabels(input: {
  projectId: string;
  urls: string[];
}): Promise<Record<string, string>> {
  const labels: Record<string, string> = {};
  if (input.urls.length === 0) return labels;

  const provenance = await getProvenance(input);

  for (const url of input.urls) {
    const normalized = normalizeUrl(url);
    const entry = normalized ? provenance.get(normalized) : undefined;
    if (!entry || entry.sources.length === 0) continue;

    const best = [...entry.sources].sort(
      (a, b) => SOURCE_STRENGTH.indexOf(a.type) - SOURCE_STRENGTH.indexOf(b.type),
    )[0];
    if (!best) continue;

    labels[url] =
      best.type === "internal_link" && best.detail
        ? `Linked from ${best.detail.replace(/^https?:\/\//, "")}`
        : best.label;
  }

  return labels;
}

/** Most convincing evidence first. Used to pick which source to show. */
const SOURCE_STRENGTH: readonly UrlSource[] = [
  "internal_link",
  "project_seed",
  "sitemap",
  "canonical",
  "redirect",
  "search_console",
  "bing_webmaster",
  "analytics_landing_page",
  "user_input",
  "suggested",
];

/**
 * Which of these URLs we can account for.
 *
 * Opportunity generation resolves this once for a whole batch before writing
 * any `affected_urls`, so a finding can never cite a page with no recorded
 * origin. An unknown URL is a bug in whatever produced it, and is logged as one
 * rather than quietly shown to a customer.
 *
 * Returns the accepted URLs in their original spelling, so callers can filter
 * their own lists by membership without re-normalising.
 */
export async function knownUrlSet(input: {
  projectId: string;
  urls: string[];
}): Promise<Set<string>> {
  const known = new Set<string>();
  if (input.urls.length === 0) return known;

  const provenance = await getProvenance(input);
  const unknown: string[] = [];

  for (const url of input.urls) {
    const normalized = normalizeUrl(url);
    if (normalized && provenance.has(normalized)) known.add(url);
    else unknown.push(url);
  }

  if (unknown.length > 0) {
    log.warn("Dropped URLs with no recorded provenance", {
      projectId: input.projectId,
      count: unknown.length,
      sample: unknown.slice(0, 5),
    });
  }

  return known;
}
