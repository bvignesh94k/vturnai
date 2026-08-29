import "server-only";

import { ENGINE_IDS, ENGINES, type EngineId } from "@/lib/config/engines";
import { getEngineHealth, type EngineState } from "@/lib/ai-engines/health";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * What we know about each AI engine, from both directions.
 *
 * There are two independent ways to observe an engine, and conflating them is
 * what made this section useless:
 *
 *   Visibility  Can we put your tracked questions to it, and does it name you?
 *               Comes from our own scans.
 *   Traffic     Does it send real people to your pages? Comes from GA4 referrers.
 *
 * They are genuinely separate facts. An engine can name you constantly and send
 * nobody, or send steady traffic while we have no way to query it at all.
 * Copilot is the second case: its licensing puts the API out of reach for most
 * accounts, but every visit it refers is sitting in GA4 already.
 *
 * So no engine is dead weight. Each one shows whichever signals it genuinely
 * has, and says plainly which it does not. That is the difference between a
 * blank and a zero, and we never print a zero we cannot stand behind.
 */

export interface EngineCoverage {
  engineId: EngineId;
  name: string;
  vendor: string;
  accent: string;

  /** Whether we can ask this engine questions, and what happened last time. */
  scanState: EngineState;
  scanStateLabel: string;
  failureSummary: string | null;
  lastScanAt: Date | null;

  /** Visibility, from our scans. Null when this engine has never answered. */
  visibility: {
    promptsAnswered: number;
    promptsMentioningYou: number;
    citationsToYou: number;
  } | null;

  /** Traffic, from GA4. Null when GA4 is not connected. */
  referral: {
    sessions: number;
    engagedSessions: number;
  } | null;

  /** One line stating what this engine can and cannot tell you right now. */
  summary: string;
}

const SCAN_STATE_LABELS: Record<EngineState, string> = {
  answering: "Answering your scans",
  failing: "Not answering",
  untested: "Ready, not yet used",
  unavailable: "Cannot be queried",
};

/** GA4 reports a session source; decide which engine, if any, it belongs to. */
function engineForReferralSource(source: string): EngineId | null {
  const value = source.toLowerCase().trim();
  if (!value) return null;

  for (const engineId of ENGINE_IDS) {
    for (const host of ENGINES[engineId].referralHosts) {
      if (value === host || value.endsWith(`.${host}`) || value.includes(host)) {
        return engineId;
      }
    }
  }
  return null;
}

export async function getEngineCoverage(input: {
  projectId: string;
  days?: number;
}): Promise<EngineCoverage[]> {
  const supabase = createServiceRoleClient();
  const days = input.days ?? 28;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const [health, { data: runs }, { data: ga4 }, { data: referrals }] = await Promise.all([
    getEngineHealth(input.projectId),
    supabase
      .from("ai_runs")
      .select("engine, is_valid, brand_mentioned, brand_citation_count")
      .eq("project_id", input.projectId)
      .eq("is_valid", true)
      .gte("executed_at", new Date(Date.now() - days * 86_400_000).toISOString())
      .limit(2000),
    supabase
      .from("analytics_connections")
      .select("project_id")
      .eq("project_id", input.projectId)
      .maybeSingle(),
    supabase
      .from("analytics_metrics")
      .select("dimension_value, sessions, engaged_sessions")
      .eq("project_id", input.projectId)
      .eq("dimension", "source")
      .eq("is_ai_referral", true)
      .gte("date", since)
      .limit(2000),
  ]);

  // Visibility, folded per engine.
  const visibilityByEngine = new Map<
    string,
    { promptsAnswered: number; promptsMentioningYou: number; citationsToYou: number }
  >();
  for (const run of runs ?? []) {
    const entry = visibilityByEngine.get(run.engine) ?? {
      promptsAnswered: 0,
      promptsMentioningYou: 0,
      citationsToYou: 0,
    };
    entry.promptsAnswered += 1;
    if (run.brand_mentioned) entry.promptsMentioningYou += 1;
    entry.citationsToYou += run.brand_citation_count;
    visibilityByEngine.set(run.engine, entry);
  }

  // Traffic, folded per engine. Only meaningful when GA4 is actually connected:
  // without it every engine would read zero sessions, which is a lie about the
  // engine rather than a fact about the account.
  const ga4Connected = Boolean(ga4);
  const referralByEngine = new Map<string, { sessions: number; engagedSessions: number }>();
  if (ga4Connected) {
    for (const row of referrals ?? []) {
      const engineId = engineForReferralSource(row.dimension_value);
      if (!engineId) continue;
      const entry = referralByEngine.get(engineId) ?? { sessions: 0, engagedSessions: 0 };
      entry.sessions += row.sessions;
      entry.engagedSessions += row.engaged_sessions;
      referralByEngine.set(engineId, entry);
    }
  }

  return ENGINE_IDS.map((engineId) => {
    const engine = ENGINES[engineId];
    const engineHealth = health.find((entry) => entry.engineId === engineId);
    const scanState = engineHealth?.state ?? "unavailable";

    const visibility = visibilityByEngine.get(engineId) ?? null;
    const referral = ga4Connected
      ? (referralByEngine.get(engineId) ?? { sessions: 0, engagedSessions: 0 })
      : null;

    return {
      engineId,
      name: engine.name,
      vendor: engine.vendor,
      accent: engine.accent,
      scanState,
      scanStateLabel: SCAN_STATE_LABELS[scanState],
      failureSummary: engineHealth?.failureSummary ?? null,
      lastScanAt: engineHealth?.lastAttemptAt ?? null,
      visibility,
      referral,
      summary: buildSummary({
        name: engine.name,
        scanState,
        visibility,
        referral,
        ga4Connected,
      }),
    };
  });
}

function buildSummary(input: {
  name: string;
  scanState: EngineState;
  visibility: { promptsAnswered: number; promptsMentioningYou: number } | null;
  referral: { sessions: number } | null;
  ga4Connected: boolean;
}): string {
  const parts: string[] = [];

  if (input.visibility && input.visibility.promptsAnswered > 0) {
    const { promptsMentioningYou, promptsAnswered } = input.visibility;
    parts.push(
      promptsMentioningYou === 0
        ? `Named you in none of ${promptsAnswered} answers`
        : `Named you in ${promptsMentioningYou} of ${promptsAnswered} answers`,
    );
  } else if (input.scanState === "unavailable") {
    parts.push(`We cannot put questions to ${input.name}`);
  } else if (input.scanState === "failing") {
    parts.push("Left out of your scores until it answers again");
  } else {
    parts.push("No answers recorded yet");
  }

  if (!input.ga4Connected) {
    parts.push("connect Google Analytics to see the traffic it sends");
  } else if (input.referral && input.referral.sessions > 0) {
    parts.push(
      `sent ${input.referral.sessions} ${input.referral.sessions === 1 ? "visit" : "visits"}`,
    );
  } else {
    parts.push("sent no visits we could attribute");
  }

  return `${parts.join(", ")}.`;
}
