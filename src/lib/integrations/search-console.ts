import "server-only";

import { loadCredentials, saveCredentials, setConnectionStatus } from "@/lib/integrations/credentials";
import { refreshGoogleAccessToken } from "@/lib/integrations/google-oauth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger, errorMessage } from "@/lib/logger";
import { isRecord, round } from "@/lib/utils";

/**
 * Google Search Console.
 *
 * A thin, typed wrapper over the Search Analytics REST API. Deliberately not
 * the googleapis SDK: we need four endpoints, and the SDK adds tens of
 * megabytes to a serverless bundle for no benefit.
 */

const log = logger.child("search-console");
const API_BASE = "https://www.googleapis.com/webmasters/v3";

export type ScDimension = "query" | "page" | "country" | "device" | "date";

export interface ScRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ScSite {
  siteUrl: string;
  permissionLevel: string;
}

/** Obtain a valid access token, refreshing it when it has expired. */
async function getAccessToken(input: {
  organizationId: string;
  projectId: string;
}): Promise<string> {
  const credentials = await loadCredentials({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider: "google_search_console",
  });

  if (!credentials) throw new Error("Google Search Console is not connected for this project.");

  const stillValid =
    credentials.accessToken && credentials.expiresAt && credentials.expiresAt.getTime() > Date.now() + 60_000;

  if (stillValid && credentials.accessToken) return credentials.accessToken;

  if (!credentials.refreshToken) {
    throw new Error("The Google connection has expired. Reconnect Search Console under Integrations.");
  }

  const refreshed = await refreshGoogleAccessToken(credentials.refreshToken);
  await saveCredentials({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider: "google_search_console",
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
    scopes: refreshed.scopes,
    accountIdentifier: credentials.accountIdentifier,
  });
  return refreshed.accessToken;
}

async function callSearchConsole(input: {
  accessToken: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<unknown> {
  const response = await fetch(`${API_BASE}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Search Console returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return (await response.json()) as unknown;
}

export async function listSearchConsoleSites(input: {
  organizationId: string;
  projectId: string;
}): Promise<ScSite[]> {
  const accessToken = await getAccessToken(input);
  const payload = await callSearchConsole({ accessToken, path: "/sites" });
  if (!isRecord(payload) || !Array.isArray(payload["siteEntry"])) return [];

  return payload["siteEntry"]
    .filter(isRecord)
    .map((entry) => ({
      siteUrl: typeof entry["siteUrl"] === "string" ? entry["siteUrl"] : "",
      permissionLevel: typeof entry["permissionLevel"] === "string" ? entry["permissionLevel"] : "unknown",
    }))
    .filter((site) => site.siteUrl.length > 0);
}

export async function querySearchAnalytics(input: {
  organizationId: string;
  projectId: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: ScDimension[];
  rowLimit?: number;
}): Promise<ScRow[]> {
  const accessToken = await getAccessToken(input);
  const payload = await callSearchConsole({
    accessToken,
    method: "POST",
    path: `/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    body: {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: input.dimensions,
      rowLimit: input.rowLimit ?? 1000,
      dataState: "final",
    },
  });

  if (!isRecord(payload) || !Array.isArray(payload["rows"])) return [];

  return payload["rows"].filter(isRecord).map((row) => ({
    keys: Array.isArray(row["keys"]) ? row["keys"].filter((key): key is string => typeof key === "string") : [],
    clicks: typeof row["clicks"] === "number" ? row["clicks"] : 0,
    impressions: typeof row["impressions"] === "number" ? row["impressions"] : 0,
    ctr: typeof row["ctr"] === "number" ? row["ctr"] : 0,
    position: typeof row["position"] === "number" ? row["position"] : 0,
  }));
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pull the dimensions the product actually uses and store them.
 *
 * Search Console finalises data with a lag, so we always re-fetch the last
 * `days` window and upsert, letting late-arriving rows correct earlier ones.
 */
export async function syncSearchConsole(input: {
  organizationId: string;
  projectId: string;
  days?: number;
}): Promise<{ rowsStored: number }> {
  const supabase = createServiceRoleClient();
  const days = input.days ?? 28;

  const { data: connection } = await supabase
    .from("search_console_connections")
    .select("*")
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (!connection) throw new Error("No Search Console property is selected for this project.");

  // Data is final only after ~2 days; ending the window earlier avoids storing
  // partial rows that would later look like a traffic drop.
  const startDate = isoDaysAgo(days + 3);
  const endDate = isoDaysAgo(3);

  const dimensionSets: Array<{ dimension: string; dimensions: ScDimension[] }> = [
    { dimension: "query", dimensions: ["date", "query"] },
    { dimension: "page", dimensions: ["date", "page"] },
    { dimension: "country", dimensions: ["date", "country"] },
    { dimension: "device", dimensions: ["date", "device"] },
    { dimension: "total", dimensions: ["date"] },
  ];

  let rowsStored = 0;

  for (const set of dimensionSets) {
    const rows = await querySearchAnalytics({
      organizationId: input.organizationId,
      projectId: input.projectId,
      siteUrl: connection.site_url,
      startDate,
      endDate,
      dimensions: set.dimensions,
      rowLimit: set.dimension === "total" ? 500 : 2000,
    });

    const records = rows
      .map((row) => {
        const date = row.keys[0];
        if (!date) return null;
        const value = set.dimension === "total" ? "total" : (row.keys[1] ?? "");
        if (set.dimension !== "total" && !value) return null;
        return {
          project_id: input.projectId,
          date,
          dimension: set.dimension,
          dimension_value: value.slice(0, 500),
          country: set.dimension === "country" ? value : null,
          device: set.dimension === "device" ? value : null,
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: round(row.ctr, 4),
          position: round(row.position, 2),
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null);

    if (records.length === 0) continue;

    // Chunked because Postgres has a parameter limit per statement.
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase
        .from("search_console_metrics")
        .upsert(chunk, { onConflict: "project_id,date,dimension,dimension_value,country,device" });
      if (error) {
        log.error("Failed to store Search Console metrics", { dimension: set.dimension, error });
      } else {
        rowsStored += chunk.length;
      }
    }
  }

  const now = new Date();
  await supabase
    .from("search_console_connections")
    .update({ last_synced_at: now.toISOString() })
    .eq("project_id", input.projectId);

  await setConnectionStatus({
    projectId: input.projectId,
    provider: "google_search_console",
    status: "connected",
    displayName: connection.site_url,
    accountIdentifier: connection.site_url,
    lastSyncedAt: now,
  });

  return { rowsStored };
}

export async function markSearchConsoleError(input: {
  projectId: string;
  error: unknown;
}): Promise<void> {
  await setConnectionStatus({
    projectId: input.projectId,
    provider: "google_search_console",
    status: "error",
    lastError: errorMessage(input.error).slice(0, 500),
  });
}

export interface SearchConsoleInsights {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  previousTotals: { clicks: number; impressions: number; ctr: number; position: number } | null;
  highImpressionLowClick: Array<{ page: string; impressions: number; clicks: number; ctr: number }>;
  strikingDistance: Array<{ query: string; position: number; impressions: number; clicks: number }>;
  questionQueries: Array<{ query: string; impressions: number; clicks: number }>;
  decliningPages: Array<{ page: string; change: number; impressions: number }>;
}

/**
 * Turn stored metrics into the opportunities the product actually acts on.
 * Runs entirely against our own tables, so it costs nothing and works offline.
 */
export async function buildSearchConsoleInsights(
  projectId: string,
  days = 28,
): Promise<SearchConsoleInsights | null> {
  const supabase = createServiceRoleClient();
  const since = isoDaysAgo(days + 3);
  const midpoint = isoDaysAgo(Math.floor(days / 2) + 3);
  const priorStart = isoDaysAgo(days * 2 + 3);

  const [{ data: totalsRows }, { data: pageRows }, { data: queryRows }] = await Promise.all([
    supabase
      .from("search_console_metrics")
      .select("date, clicks, impressions, ctr, position")
      .eq("project_id", projectId)
      .eq("dimension", "total")
      .gte("date", priorStart),
    supabase
      .from("search_console_metrics")
      .select("date, dimension_value, clicks, impressions, ctr, position")
      .eq("project_id", projectId)
      .eq("dimension", "page")
      .gte("date", since)
      .limit(5000),
    supabase
      .from("search_console_metrics")
      .select("date, dimension_value, clicks, impressions, ctr, position")
      .eq("project_id", projectId)
      .eq("dimension", "query")
      .gte("date", since)
      .limit(5000),
  ]);

  if (!totalsRows || totalsRows.length === 0) return null;

  const current = totalsRows.filter((row) => row.date >= since);
  const previous = totalsRows.filter((row) => row.date < since);

  const aggregate = (rows: typeof totalsRows) => {
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const weightedPosition = rows.reduce((sum, row) => sum + row.position * row.impressions, 0);
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? round((clicks / impressions) * 100, 2) : 0,
      position: impressions > 0 ? round(weightedPosition / impressions, 1) : 0,
    };
  };

  const byPage = new Map<string, { clicks: number; impressions: number; recent: number; older: number }>();
  for (const row of pageRows ?? []) {
    const entry = byPage.get(row.dimension_value) ?? { clicks: 0, impressions: 0, recent: 0, older: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    if (row.date >= midpoint) entry.recent += row.clicks;
    else entry.older += row.clicks;
    byPage.set(row.dimension_value, entry);
  }

  const byQuery = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();
  for (const row of queryRows ?? []) {
    const entry = byQuery.get(row.dimension_value) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.positionWeighted += row.position * row.impressions;
    byQuery.set(row.dimension_value, entry);
  }

  const highImpressionLowClick = [...byPage.entries()]
    .map(([page, entry]) => ({
      page,
      impressions: entry.impressions,
      clicks: entry.clicks,
      ctr: entry.impressions > 0 ? round((entry.clicks / entry.impressions) * 100, 2) : 0,
    }))
    .filter((entry) => entry.impressions >= 100 && entry.ctr < 1.5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  const strikingDistance = [...byQuery.entries()]
    .map(([query, entry]) => ({
      query,
      clicks: entry.clicks,
      impressions: entry.impressions,
      position: entry.impressions > 0 ? round(entry.positionWeighted / entry.impressions, 1) : 0,
    }))
    .filter((entry) => entry.position >= 4 && entry.position <= 20 && entry.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  const questionQueries = [...byQuery.entries()]
    .filter(([query]) => /^(what|why|how|when|where|which|who|can|should|is|are|does|do)\b/i.test(query))
    .map(([query, entry]) => ({ query, impressions: entry.impressions, clicks: entry.clicks }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  const decliningPages = [...byPage.entries()]
    .map(([page, entry]) => ({
      page,
      change: entry.recent - entry.older,
      impressions: entry.impressions,
    }))
    .filter((entry) => entry.change < -5)
    .sort((a, b) => a.change - b.change)
    .slice(0, 15);

  return {
    totals: aggregate(current),
    previousTotals: previous.length > 0 ? aggregate(previous) : null,
    highImpressionLowClick,
    strikingDistance,
    questionQueries,
    decliningPages,
  };
}
