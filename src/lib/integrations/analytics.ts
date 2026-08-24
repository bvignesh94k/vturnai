import "server-only";

import { loadCredentials, saveCredentials, setConnectionStatus } from "@/lib/integrations/credentials";
import { refreshGoogleAccessToken } from "@/lib/integrations/google-oauth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { isRecord, round } from "@/lib/utils";

/**
 * Google Analytics 4 (optional).
 *
 * Used for organic sessions, landing pages, engagement, key events and, the
 * part unique to this product, identifying referral traffic that arrived from
 * an AI assistant.
 *
 * An honest caveat we repeat in the UI: GA4 can only see visits that actually
 * happened. Most AI visibility is zero-click, so referral data is a floor on
 * your AI impact, never a measure of it.
 */

const log = logger.child("ga4");
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

/**
 * Referrer hosts that identify an AI assistant or answer engine.
 * Matched on hostname suffix, so subdomains are covered.
 */
export const AI_REFERRAL_HOSTS = [
  { host: "chatgpt.com", label: "ChatGPT" },
  { host: "chat.openai.com", label: "ChatGPT" },
  { host: "openai.com", label: "OpenAI" },
  { host: "perplexity.ai", label: "Perplexity" },
  { host: "gemini.google.com", label: "Gemini" },
  { host: "bard.google.com", label: "Gemini" },
  { host: "claude.ai", label: "Claude" },
  { host: "copilot.microsoft.com", label: "Microsoft Copilot" },
  { host: "bing.com/chat", label: "Bing Copilot" },
  { host: "grok.com", label: "Grok" },
  { host: "x.ai", label: "Grok" },
  { host: "you.com", label: "You.com" },
  { host: "phind.com", label: "Phind" },
  { host: "poe.com", label: "Poe" },
  { host: "mistral.ai", label: "Le Chat" },
  { host: "deepseek.com", label: "DeepSeek" },
] as const;

export function classifyAiReferral(source: string): string | null {
  const value = source.toLowerCase().trim();
  if (!value) return null;
  const match = AI_REFERRAL_HOSTS.find(
    (entry) => value === entry.host || value.endsWith(`.${entry.host}`) || value.includes(entry.host),
  );
  return match?.label ?? null;
}

async function getAccessToken(input: { organizationId: string; projectId: string }): Promise<string> {
  const credentials = await loadCredentials({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider: "google_analytics",
  });

  if (!credentials) throw new Error("Google Analytics is not connected for this project.");

  const stillValid =
    credentials.accessToken && credentials.expiresAt && credentials.expiresAt.getTime() > Date.now() + 60_000;
  if (stillValid && credentials.accessToken) return credentials.accessToken;

  if (!credentials.refreshToken) {
    throw new Error("The Google Analytics connection has expired. Reconnect it under Integrations.");
  }

  const refreshed = await refreshGoogleAccessToken(credentials.refreshToken);
  await saveCredentials({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider: "google_analytics",
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
    scopes: refreshed.scopes,
    accountIdentifier: credentials.accountIdentifier,
  });
  return refreshed.accessToken;
}

interface Ga4Row {
  dimensions: string[];
  metrics: number[];
}

async function runReport(input: {
  accessToken: string;
  propertyId: string;
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<Ga4Row[]> {
  const response = await fetch(`${DATA_API}/properties/${encodeURIComponent(input.propertyId)}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      dimensions: input.dimensions.map((name) => ({ name })),
      metrics: input.metrics.map((name) => ({ name })),
      limit: input.limit ?? 500,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Google Analytics returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload["rows"])) return [];

  return payload["rows"].filter(isRecord).map((row) => ({
    dimensions: Array.isArray(row["dimensionValues"])
      ? row["dimensionValues"].map((entry) =>
          isRecord(entry) && typeof entry["value"] === "string" ? entry["value"] : "",
        )
      : [],
    metrics: Array.isArray(row["metricValues"])
      ? row["metricValues"].map((entry) =>
          isRecord(entry) && typeof entry["value"] === "string" ? Number(entry["value"]) || 0 : 0,
        )
      : [],
  }));
}

export async function syncAnalytics(input: {
  organizationId: string;
  projectId: string;
  days?: number;
}): Promise<{ rowsStored: number; aiReferralSessions: number }> {
  const supabase = createServiceRoleClient();
  const days = input.days ?? 28;

  const { data: connection } = await supabase
    .from("analytics_connections")
    .select("*")
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (!connection) throw new Error("No GA4 property is configured for this project.");

  const accessToken = await getAccessToken(input);
  const startDate = `${days}daysAgo`;
  const endDate = "yesterday";

  const [landingPages, sources] = await Promise.all([
    runReport({
      accessToken,
      propertyId: connection.property_id,
      dimensions: ["date", "landingPagePlusQueryString"],
      metrics: ["sessions", "engagedSessions", "keyEvents"],
      startDate,
      endDate,
      limit: 1000,
    }),
    runReport({
      accessToken,
      propertyId: connection.property_id,
      dimensions: ["date", "sessionSource"],
      metrics: ["sessions", "engagedSessions", "keyEvents"],
      startDate,
      endDate,
      limit: 1000,
    }),
  ]);

  const rows: Array<Record<string, unknown>> = [];
  let aiReferralSessions = 0;

  for (const row of landingPages) {
    const [date, page] = row.dimensions;
    if (!date || !page) continue;
    rows.push({
      project_id: input.projectId,
      date: formatGaDate(date),
      dimension: "landing_page",
      dimension_value: page.slice(0, 500),
      sessions: Math.round(row.metrics[0] ?? 0),
      engaged_sessions: Math.round(row.metrics[1] ?? 0),
      conversions: round(row.metrics[2] ?? 0, 2),
      is_ai_referral: false,
    });
  }

  for (const row of sources) {
    const [date, source] = row.dimensions;
    if (!date || !source) continue;
    const aiLabel = classifyAiReferral(source);
    const sessions = Math.round(row.metrics[0] ?? 0);
    if (aiLabel) aiReferralSessions += sessions;
    rows.push({
      project_id: input.projectId,
      date: formatGaDate(date),
      dimension: "source",
      dimension_value: source.slice(0, 500),
      sessions,
      engaged_sessions: Math.round(row.metrics[1] ?? 0),
      conversions: round(row.metrics[2] ?? 0, 2),
      is_ai_referral: aiLabel !== null,
    });
  }

  let rowsStored = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("analytics_metrics")
      .upsert(chunk as never, { onConflict: "project_id,date,dimension,dimension_value" });
    if (error) log.error("Failed to store GA4 metrics", { error });
    else rowsStored += chunk.length;
  }

  const now = new Date();
  await supabase
    .from("analytics_connections")
    .update({ last_synced_at: now.toISOString() })
    .eq("project_id", input.projectId);

  await setConnectionStatus({
    projectId: input.projectId,
    provider: "google_analytics",
    status: "connected",
    displayName: connection.property_name ?? connection.property_id,
    accountIdentifier: connection.property_id,
    lastSyncedAt: now,
  });

  return { rowsStored, aiReferralSessions };
}

/** GA4 returns dates as `YYYYMMDD`. */
function formatGaDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

export interface AiReferralReport {
  totalSessions: number;
  bySource: Array<{ label: string; source: string; sessions: number; engagedSessions: number; conversions: number }>;
  hasData: boolean;
}

/** The "AI Referral Traffic" report shown under Reports and Integrations. */
export async function buildAiReferralReport(projectId: string, days = 28): Promise<AiReferralReport> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("analytics_metrics")
    .select("dimension_value, sessions, engaged_sessions, conversions")
    .eq("project_id", projectId)
    .eq("dimension", "source")
    .eq("is_ai_referral", true)
    .gte("date", since)
    .limit(2000);

  const grouped = new Map<string, { label: string; sessions: number; engagedSessions: number; conversions: number }>();
  for (const row of data ?? []) {
    const label = classifyAiReferral(row.dimension_value) ?? row.dimension_value;
    const entry = grouped.get(row.dimension_value) ?? {
      label,
      sessions: 0,
      engagedSessions: 0,
      conversions: 0,
    };
    entry.sessions += row.sessions;
    entry.engagedSessions += row.engaged_sessions;
    entry.conversions += Number(row.conversions);
    grouped.set(row.dimension_value, entry);
  }

  const bySource = [...grouped.entries()]
    .map(([source, entry]) => ({ source, ...entry }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    totalSessions: bySource.reduce((sum, entry) => sum + entry.sessions, 0),
    bySource,
    hasData: (data ?? []).length > 0,
  };
}
