import "server-only";

import { loadCredentials, setConnectionStatus } from "@/lib/integrations/credentials";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { toRegistrableHost } from "@/lib/crawler/url";
import { logger } from "@/lib/logger";
import { isRecord, round } from "@/lib/utils";

/**
 * Bing Webmaster Tools.
 *
 * Bing exposes a simple REST API keyed by an API key generated in the Webmaster
 * Tools UI. The abstraction below keeps every endpoint behind one typed call so
 * a future OAuth-based flow can replace the transport without touching callers.
 */

const log = logger.child("bing");
const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

export interface BingRankAndTraffic {
  date: string;
  clicks: number;
  impressions: number;
}

export interface BingKeyword {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface BingIndexInfo {
  crawledPages: number | null;
  indexedPages: number | null;
  inboundLinks: number | null;
  crawlErrors: number | null;
}

export function isBingConfigured(): boolean {
  return Boolean(process.env.BING_WEBMASTER_API_KEY?.trim());
}

export interface BingSite {
  url: string;
  isVerified: boolean;
}

async function resolveApiKey(input: {
  organizationId: string;
  projectId: string;
}): Promise<string> {
  // A per-project key stored by the user wins; otherwise fall back to the
  // deployment-wide key so a single-tenant install works without extra setup.
  const stored = await loadCredentials({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider: "bing_webmaster",
  }).catch(() => null);

  const key = stored?.apiKey ?? process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!key) throw new Error("Bing Webmaster Tools is not connected. Add an API key under Integrations.");
  return key;
}

async function callBing(input: {
  apiKey: string;
  method: string;
  params: Record<string, string>;
}): Promise<unknown> {
  const query = new URLSearchParams({ apikey: input.apiKey, ...input.params });
  const response = await fetch(`${API_BASE}/${input.method}?${query.toString()}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bing Webmaster returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return (await response.json()) as unknown;
}

function readArray(payload: unknown): unknown[] {
  if (!isRecord(payload)) return [];
  const value = payload["d"];
  return Array.isArray(value) ? value : [];
}

/** Bing serialises dates as `/Date(1699999999999)/`. */
function parseBingDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /\/Date\((\d+)\)\//.exec(value);
  if (match?.[1]) return new Date(Number(match[1])).toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * The sites a Bing Webmaster API key actually grants access to.
 *
 * Takes the key directly rather than loading it from storage, so a key can be
 * proven to work before anything is written. This is what makes a Bing
 * connection real: the key is the authentication, so the set of sites it
 * returns is the only evidence that the user controls the property.
 */
export async function listBingSites(apiKey: string): Promise<BingSite[]> {
  const payload = await callBing({ apiKey, method: "GetUserSites", params: {} });

  return readArray(payload)
    .filter(isRecord)
    .map((row) => ({
      url: typeof row["Url"] === "string" ? row["Url"] : "",
      isVerified: row["IsVerified"] === true,
    }))
    .filter((site) => site.url.length > 0);
}

/**
 * Confirm a key works and grants the requested site.
 *
 * Returns the matched site so the caller can store Bing's own spelling of the
 * URL rather than whatever the user typed. Host comparison ignores `www.` and
 * scheme, which routinely differ between what someone enters here and how the
 * property is registered in Bing.
 */
export async function verifyBingSiteAccess(input: {
  apiKey: string;
  siteUrl: string;
}): Promise<{ ok: true; site: BingSite } | { ok: false; reason: string; sites: BingSite[] }> {
  let sites: BingSite[];
  try {
    sites = await listBingSites(input.apiKey);
  } catch (error) {
    log.warn("Bing site listing failed during verification", { error });
    return {
      ok: false,
      reason:
        "Bing did not accept that API key. Generate a new one in Bing Webmaster Tools under Settings → API access.",
      sites: [],
    };
  }

  if (sites.length === 0) {
    return {
      ok: false,
      reason:
        "That API key works, but no sites are registered against it in Bing Webmaster Tools. Add and verify your site there first.",
      sites,
    };
  }

  // Compare on host alone: scheme and a leading `www.` routinely differ between
  // what someone types here and how the property is registered in Bing.
  const wanted = toRegistrableHost(input.siteUrl);
  const match = sites.find((site) => wanted !== null && toRegistrableHost(site.url) === wanted);

  if (!match) {
    return {
      ok: false,
      reason: `That key does not grant access to ${input.siteUrl}.`,
      sites,
    };
  }

  return { ok: true, site: match };
}

export async function fetchBingRankAndTraffic(input: {
  organizationId: string;
  projectId: string;
  siteUrl: string;
}): Promise<BingRankAndTraffic[]> {
  const apiKey = await resolveApiKey(input);
  const payload = await callBing({
    apiKey,
    method: "GetRankAndTrafficStats",
    params: { siteUrl: input.siteUrl },
  });

  return readArray(payload)
    .filter(isRecord)
    .map((row) => ({
      date: parseBingDate(row["Date"]) ?? "",
      clicks: typeof row["Clicks"] === "number" ? row["Clicks"] : 0,
      impressions: typeof row["Impressions"] === "number" ? row["Impressions"] : 0,
    }))
    .filter((row) => row.date.length > 0);
}

export async function fetchBingKeywords(input: {
  organizationId: string;
  projectId: string;
  siteUrl: string;
}): Promise<BingKeyword[]> {
  const apiKey = await resolveApiKey(input);
  const payload = await callBing({
    apiKey,
    method: "GetQueryStats",
    params: { siteUrl: input.siteUrl },
  });

  return readArray(payload)
    .filter(isRecord)
    .map((row) => ({
      query: typeof row["Query"] === "string" ? row["Query"] : "",
      clicks: typeof row["Clicks"] === "number" ? row["Clicks"] : 0,
      impressions: typeof row["Impressions"] === "number" ? row["Impressions"] : 0,
      position: typeof row["AvgImpressionPosition"] === "number" ? round(row["AvgImpressionPosition"], 2) : null,
    }))
    .filter((row) => row.query.length > 0);
}

export async function fetchBingIndexInfo(input: {
  organizationId: string;
  projectId: string;
  siteUrl: string;
}): Promise<BingIndexInfo> {
  const apiKey = await resolveApiKey(input);
  const payload = await callBing({
    apiKey,
    method: "GetUrlTrafficInfo",
    params: { siteUrl: input.siteUrl },
  });

  const record = isRecord(payload) && isRecord(payload["d"]) ? payload["d"] : null;
  return {
    crawledPages: record && typeof record["CrawledPages"] === "number" ? record["CrawledPages"] : null,
    indexedPages: record && typeof record["IndexedPages"] === "number" ? record["IndexedPages"] : null,
    inboundLinks: record && typeof record["InboundLinks"] === "number" ? record["InboundLinks"] : null,
    crawlErrors: record && typeof record["CrawlErrors"] === "number" ? record["CrawlErrors"] : null,
  };
}

export async function syncBing(input: {
  organizationId: string;
  projectId: string;
}): Promise<{ rowsStored: number }> {
  const supabase = createServiceRoleClient();

  const { data: connection } = await supabase
    .from("bing_connections")
    .select("*")
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (!connection) throw new Error("No Bing Webmaster property is configured for this project.");

  const context = { ...input, siteUrl: connection.site_url };

  // Each call is independent: one failing endpoint must not lose the others.
  const [traffic, keywords, indexInfo] = await Promise.all([
    fetchBingRankAndTraffic(context).catch((error: unknown) => {
      log.warn("Bing traffic fetch failed", { error });
      return [] as BingRankAndTraffic[];
    }),
    fetchBingKeywords(context).catch((error: unknown) => {
      log.warn("Bing keyword fetch failed", { error });
      return [] as BingKeyword[];
    }),
    fetchBingIndexInfo(context).catch((error: unknown) => {
      log.warn("Bing index info fetch failed", { error });
      return null;
    }),
  ]);

  const rows: Array<Record<string, unknown>> = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const entry of traffic) {
    rows.push({
      project_id: input.projectId,
      date: entry.date,
      dimension: "total",
      dimension_value: "total",
      clicks: entry.clicks,
      impressions: entry.impressions,
    });
  }

  for (const keyword of keywords.slice(0, 1000)) {
    rows.push({
      project_id: input.projectId,
      date: today,
      dimension: "query",
      dimension_value: keyword.query.slice(0, 500),
      clicks: keyword.clicks,
      impressions: keyword.impressions,
      position: keyword.position,
    });
  }

  if (indexInfo) {
    rows.push({
      project_id: input.projectId,
      date: today,
      dimension: "index",
      dimension_value: "site",
      clicks: 0,
      impressions: 0,
      crawled_pages: indexInfo.crawledPages,
      indexed_pages: indexInfo.indexedPages,
      inbound_links: indexInfo.inboundLinks,
    });
  }

  let rowsStored = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("bing_metrics")
      .upsert(chunk as never, { onConflict: "project_id,date,dimension,dimension_value" });
    if (error) log.error("Failed to store Bing metrics", { error });
    else rowsStored += chunk.length;
  }

  const now = new Date();
  await supabase
    .from("bing_connections")
    .update({ last_synced_at: now.toISOString() })
    .eq("project_id", input.projectId);

  await setConnectionStatus({
    projectId: input.projectId,
    provider: "bing_webmaster",
    status: "connected",
    displayName: connection.site_url,
    accountIdentifier: connection.site_url,
    lastSyncedAt: now,
  });

  return { rowsStored };
}
