import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { IntegrationsBoard } from "@/app/app/integrations/integrations-board";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { ENGINES, ENGINE_IDS } from "@/lib/config/engines";
import { getEngineHealth } from "@/lib/ai-engines/health";
import { isGoogleOAuthConfigured } from "@/lib/integrations/google-oauth";
import { isPagespeedConfigured } from "@/lib/integrations/pagespeed";
import { isBingConfigured } from "@/lib/integrations/bing";
import { isEncryptionConfigured } from "@/lib/security/encryption";
import { loadPageContext } from "@/lib/data/project-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { IntegrationStatusDb } from "@/lib/db/types";

export const metadata: Metadata = { title: "Integrations" };

export interface IntegrationCard {
  provider: string;
  name: string;
  vendor: string;
  description: string;
  status: IntegrationStatusDb;
  statusMessage: string | null;
  displayName: string | null;
  lastSyncedAt: string | null;
  kind: "oauth" | "api_key" | "server_key";
  canSync: boolean;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, canWrite } = await loadPageContext(searchParams);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const [{ data: connections }, { data: gsc }, { data: bing }, { data: ga4 }] = await Promise.all([
    supabase.from("integration_connections").select("*").eq("project_id", project.id),
    supabase.from("search_console_connections").select("*").eq("project_id", project.id).maybeSingle(),
    supabase.from("bing_connections").select("*").eq("project_id", project.id).maybeSingle(),
    supabase.from("analytics_connections").select("*").eq("project_id", project.id).maybeSingle(),
  ]);

  const connectionByProvider = new Map((connections ?? []).map((row) => [row.provider, row]));


  const searchCards: IntegrationCard[] = [
    {
      provider: "google_search_console",
      name: "Google Search Console",
      vendor: "Google",
      description:
        "Clicks, impressions, CTR, average position, queries, pages, countries and devices. Powers striking-distance and low-CTR opportunities.",
      status: !isGoogleOAuthConfigured()
        ? "configuration_required"
        : gsc
          ? "connected"
          : (connectionByProvider.get("google_search_console")?.status ?? "not_connected"),
      statusMessage: !isGoogleOAuthConfigured()
        ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set on this deployment."
        : (connectionByProvider.get("google_search_console")?.last_error ?? null),
      displayName: gsc?.site_url ?? connectionByProvider.get("google_search_console")?.display_name ?? null,
      lastSyncedAt: gsc?.last_synced_at ?? null,
      kind: "oauth",
      canSync: Boolean(gsc),
    },
    {
      provider: "bing_webmaster",
      name: "Bing Webmaster Tools",
      vendor: "Microsoft",
      description:
        "Traffic, keywords, crawl and index information from Bing, the index that also feeds Microsoft Copilot.",
      // A `bing_connections` row is only written after the key has been proven
      // against Bing's own site list, so its presence is real evidence. Absent
      // that, fall through to the recorded status rather than assuming a
      // deployment key means this project is connected.
      status: bing
        ? "connected"
        : (connectionByProvider.get("bing_webmaster")?.status ?? "not_connected"),
      statusMessage:
        connectionByProvider.get("bing_webmaster")?.last_error ??
        (isBingConfigured() ? null : "Add your Bing Webmaster API key to connect."),
      displayName: bing?.site_url ?? null,
      lastSyncedAt: bing?.last_synced_at ?? null,
      kind: "api_key",
      canSync: Boolean(bing),
    },
    {
      provider: "google_analytics",
      name: "Google Analytics 4",
      vendor: "Google",
      description:
        "Optional. Organic sessions, landing pages, engagement, key events, and the AI referral traffic report.",
      // An `analytics_connections` row is only written once the chosen property
      // has answered a real Data API request. Before that the recorded status
      // carries the truth: `configuration_required` means the Google account is
      // authorised but no property has been verified yet.
      status: !isGoogleOAuthConfigured()
        ? "configuration_required"
        : ga4
          ? "connected"
          : (connectionByProvider.get("google_analytics")?.status ?? "not_connected"),
      statusMessage: !isGoogleOAuthConfigured()
        ? "Google OAuth is not configured on this deployment."
        : (connectionByProvider.get("google_analytics")?.last_error ??
          (connectionByProvider.get("google_analytics")?.status === "configuration_required"
            ? "Google account connected. Choose which property to report on."
            : null)),
      displayName:
        ga4?.property_name ??
        ga4?.property_id ??
        connectionByProvider.get("google_analytics")?.display_name ??
        null,
      lastSyncedAt: ga4?.last_synced_at ?? null,
      kind: "oauth",
      canSync: Boolean(ga4),
    },
    {
      provider: "pagespeed",
      name: "PageSpeed Insights",
      vendor: "Google",
      description:
        "Mobile and desktop performance, accessibility, best practices and SEO scores on your most important pages.",
      status: isPagespeedConfigured() ? "connected" : "configuration_required",
      statusMessage: isPagespeedConfigured()
        ? null
        : "GOOGLE_PAGESPEED_API_KEY is not set on this deployment.",
      displayName: isPagespeedConfigured() ? "Configured on this deployment" : null,
      lastSyncedAt: connectionByProvider.get("pagespeed")?.last_synced_at ?? null,
      kind: "server_key",
      canSync: false,
    },
  ];

  /**
   * Engine cards report what each engine last *did*, not whether a key exists.
   * A credential can be revoked or out of quota and still look configured, so
   * "connected" here means the engine actually answered.
   *
   * Nothing in this section names an environment variable: these are the
   * operator's credentials, and a customer can neither see nor fix them.
   */
  const engineHealth = await getEngineHealth(project.id);

  const engineCards: IntegrationCard[] = ENGINE_IDS.map((engineId) => {
    const engine = ENGINES[engineId];
    const health = engineHealth.find((entry) => entry.engineId === engineId);

    const status =
      health?.state === "answering"
        ? ("connected" as const)
        : health?.state === "failing"
          ? ("error" as const)
          : health?.state === "untested"
            ? ("connected" as const)
            : ("not_connected" as const);

    const statusMessage =
      health?.state === "failing"
        ? health.failureSummary
        : health?.state === "unavailable"
          ? `${engine.name} is not available on this deployment, so it is left out of your scores rather than counted as zero.`
          : null;

    const displayName =
      health?.state === "answering"
        ? "Answering scans"
        : health?.state === "untested"
          ? "Ready, not yet used"
          : health?.state === "failing"
            ? "Not answering"
            : null;

    return {
      provider: engineId,
      name: engine.name,
      vendor: engine.vendor,
      description: engine.observationNote,
      status,
      statusMessage,
      displayName,
      lastSyncedAt: health?.lastAttemptAt?.toISOString() ?? null,
      kind: "server_key",
      canSync: false,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect the data sources that make your measurements complete. We never show a token or key back to the browser."
      />

      {typeof params["error"] === "string" ? (
        <Alert variant="destructive">
          <InfoIcon />
          <AlertDescription>{params["error"]}</AlertDescription>
        </Alert>
      ) : null}

      {typeof params["connected"] === "string" ? (
        <Alert variant="success">
          <InfoIcon />
          <AlertDescription>
            Connected. Select the property you want to track below.
          </AlertDescription>
        </Alert>
      ) : null}

      {!isEncryptionConfigured() ? (
        <Alert variant="warning">
          <InfoIcon />
          <AlertDescription>
            ENCRYPTION_KEY is not configured on this deployment, so OAuth tokens and API keys cannot
            be stored securely. Set it before connecting any integration.
          </AlertDescription>
        </Alert>
      ) : null}

      <IntegrationsBoard
        projectId={project.id}
        searchCards={searchCards}
        engineCards={engineCards}
        canWrite={canWrite}
        hasGoogleAccount={Boolean(connectionByProvider.get("google_search_console"))}
        selectedSearchConsoleSite={gsc?.site_url ?? null}
      />
    </div>
  );
}
