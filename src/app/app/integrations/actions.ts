"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserContext, getProjectForUser, canWrite } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { deleteCredentials, saveCredentials, setConnectionStatus } from "@/lib/integrations/credentials";
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from "@/lib/integrations/google-oauth";
import { listAnalyticsProperties, verifyAnalyticsPropertyAccess } from "@/lib/integrations/analytics";
import { verifyBingSiteAccess } from "@/lib/integrations/bing";
import { enqueueJob } from "@/lib/jobs/queue";
import { encryptSecret } from "@/lib/security/encryption";
import {
  bingConnectSchema,
  selectAnalyticsPropertySchema,
  selectSearchConsoleSiteSchema,
} from "@/lib/validation/schemas";
import { errorMessage, logger } from "@/lib/logger";
import type { ActionResult } from "@/app/app/actions";
import type { IntegrationProvider } from "@/lib/db/types";

const log = logger.child("integration-actions");

async function requireAccess(projectId: string) {
  const context = await requireUserContext();
  const project = await getProjectForUser(projectId);
  if (!project) throw new Error("That project could not be found.");
  if (!canWrite(context.activeRole)) throw new Error("Your role on this workspace is read-only.");
  return { context, project };
}

function fail(error: unknown): ActionResult {
  const message = errorMessage(error);
  log.warn("Integration action failed", { message });
  return { ok: false, error: message || "Something went wrong." };
}

/**
 * Start the Google OAuth flow.
 *
 * The state parameter carries the project id and a nonce, and is stored
 * server-side so the callback can verify the response belongs to a flow we
 * actually started.
 */
export async function connectGoogleAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const integration = formData.get("integration") === "analytics" ? "analytics" : "searchConsole";
  const { context, project } = await requireAccess(projectId);

  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured on this deployment.");
  }

  const admin = createServiceRoleClient();
  const nonce = crypto.randomUUID();

  await admin.from("audit_logs").insert({
    organization_id: project.organization_id,
    actor_id: context.user.id,
    action: "oauth.google.start",
    entity_type: "project",
    entity_id: project.id,
    metadata: { nonce, integration },
  });

  redirect(
    buildGoogleAuthUrl({
      integration,
      state: Buffer.from(JSON.stringify({ projectId: project.id, nonce, integration })).toString(
        "base64url",
      ),
    }),
  );
}

export async function selectSearchConsoleSiteAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = selectSearchConsoleSiteSchema.parse({
      projectId: formData.get("projectId"),
      siteUrl: formData.get("siteUrl"),
    });
    const { project } = await requireAccess(parsed.projectId);

    const admin = createServiceRoleClient();
    await admin.from("search_console_connections").upsert(
      {
        project_id: project.id,
        site_url: parsed.siteUrl,
        is_verified: true,
      },
      { onConflict: "project_id" },
    );

    await setConnectionStatus({
      projectId: project.id,
      provider: "google_search_console",
      status: "connected",
      displayName: parsed.siteUrl,
      accountIdentifier: parsed.siteUrl,
    });

    await enqueueJob({
      jobType: "search_console_sync",
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { days: 28 },
      idempotencyKey: `gsc_sync:${project.id}:${new Date().toISOString().slice(0, 13)}`,
      priority: 4,
    });

    revalidatePath("/app/integrations");
    return { ok: true, message: "Property selected. We are pulling in your data now." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Connect Bing Webmaster Tools.
 *
 * The API key is the authentication, so it is proven before anything is
 * stored: we ask Bing which sites the key grants, and refuse the connection
 * unless the requested property is among them. A key that works but does not
 * cover this site returns the list it does cover, which is far more useful
 * than a generic failure.
 */
export async function connectBingAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = bingConnectSchema.parse({
      projectId: formData.get("projectId"),
      siteUrl: formData.get("siteUrl"),
      apiKey: formData.get("apiKey"),
    });
    const { project } = await requireAccess(parsed.projectId);

    const verification = await verifyBingSiteAccess({
      apiKey: parsed.apiKey,
      siteUrl: parsed.siteUrl,
    });

    if (!verification.ok) {
      await setConnectionStatus({
        projectId: project.id,
        provider: "bing_webmaster",
        status: "configuration_required",
        lastError: verification.reason,
      });
      revalidatePath("/app/integrations");

      const available = verification.sites
        .map((site) => site.url)
        .slice(0, 5)
        .join(", ");
      return {
        ok: false,
        error: available
          ? `${verification.reason} That key covers: ${available}.`
          : verification.reason,
      };
    }

    // Bing's own spelling of the URL, not whatever the user typed.
    const siteUrl = verification.site.url;

    // Stored encrypted; never returned to any client.
    await saveCredentials({
      organizationId: project.organization_id,
      projectId: project.id,
      provider: "bing_webmaster",
      apiKey: parsed.apiKey,
      accountIdentifier: siteUrl,
    });

    const admin = createServiceRoleClient();
    await admin.from("bing_connections").upsert(
      { project_id: project.id, site_url: siteUrl, is_verified: verification.site.isVerified },
      { onConflict: "project_id" },
    );

    await setConnectionStatus({
      projectId: project.id,
      provider: "bing_webmaster",
      status: "connected",
      displayName: siteUrl,
      accountIdentifier: siteUrl,
      lastError: null,
    });

    await enqueueJob({
      jobType: "bing_sync",
      projectId: project.id,
      organizationId: project.organization_id,
      idempotencyKey: `bing_sync:${project.id}:${new Date().toISOString().slice(0, 13)}`,
      priority: 5,
    });

    revalidatePath("/app/integrations");
    return {
      ok: true,
      message: verification.site.isVerified
        ? `Connected to ${siteUrl}. Pulling in your Bing data now.`
        : `Connected to ${siteUrl}, but Bing has not verified that site yet. Complete verification in Bing Webmaster Tools to get full data.`,
    };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Choose the GA4 property to report on.
 *
 * Reachable only after the Google account has been authorised, and the choice
 * is checked twice before it counts: the property must appear in the list
 * Google returned for this account, and it must answer a real Data API report.
 * Administrative visibility is not the same as reporting access, and only the
 * second of those proves the product can do its job.
 */
export async function selectAnalyticsPropertyAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = selectAnalyticsPropertySchema.parse({
      projectId: formData.get("projectId"),
      propertyId: formData.get("propertyId"),
      propertyName: formData.get("propertyName") || undefined,
    });
    const { project } = await requireAccess(parsed.projectId);

    const context = { organizationId: project.organization_id, projectId: project.id };

    const available = await listAnalyticsProperties(context);
    const chosen = available.find((entry) => entry.propertyId === parsed.propertyId);

    if (!chosen) {
      return {
        ok: false,
        error:
          "That property is not available to the connected Google account. Reconnect with an account that has access to it.",
      };
    }

    const verification = await verifyAnalyticsPropertyAccess({
      ...context,
      propertyId: parsed.propertyId,
    });

    if (!verification.ok) {
      await setConnectionStatus({
        projectId: project.id,
        provider: "google_analytics",
        status: "configuration_required",
        lastError: verification.reason,
      });
      revalidatePath("/app/integrations");
      return { ok: false, error: verification.reason };
    }

    const admin = createServiceRoleClient();
    await admin.from("analytics_connections").upsert(
      {
        project_id: project.id,
        property_id: chosen.propertyId,
        property_name: chosen.displayName,
      },
      { onConflict: "project_id" },
    );

    await setConnectionStatus({
      projectId: project.id,
      provider: "google_analytics",
      status: "connected",
      displayName: chosen.displayName,
      accountIdentifier: chosen.propertyId,
      lastError: null,
    });

    await enqueueJob({
      jobType: "analytics_sync",
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { days: 28 },
      idempotencyKey: `ga4_sync:${project.id}:${new Date().toISOString().slice(0, 13)}`,
      priority: 5,
    });

    revalidatePath("/app/integrations");
    return { ok: true, message: `Reporting on ${chosen.displayName}. Pulling in your data now.` };
  } catch (error) {
    return fail(error);
  }
}

export async function disconnectIntegrationAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const provider = String(formData.get("provider") ?? "") as IntegrationProvider;
    const { project } = await requireAccess(projectId);

    const admin = createServiceRoleClient();

    await deleteCredentials({
      organizationId: project.organization_id,
      projectId: project.id,
      provider,
    });

    if (provider === "google_search_console") {
      await admin.from("search_console_connections").delete().eq("project_id", project.id);
    } else if (provider === "bing_webmaster") {
      await admin.from("bing_connections").delete().eq("project_id", project.id);
    } else if (provider === "google_analytics") {
      await admin.from("analytics_connections").delete().eq("project_id", project.id);
    }

    await setConnectionStatus({
      projectId: project.id,
      provider,
      status: "not_connected",
      displayName: null,
      accountIdentifier: null,
      lastError: null,
    });

    revalidatePath("/app/integrations");
    return { ok: true, message: "Disconnected." };
  } catch (error) {
    return fail(error);
  }
}

export async function syncIntegrationAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const provider = String(formData.get("provider") ?? "");
    const { project } = await requireAccess(projectId);

    const jobType =
      provider === "google_search_console"
        ? "search_console_sync"
        : provider === "bing_webmaster"
          ? "bing_sync"
          : provider === "google_analytics"
            ? "analytics_sync"
            : null;

    if (!jobType) return { ok: false, error: "That integration cannot be synced manually." };

    await enqueueJob({
      jobType,
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { days: 28 },
      idempotencyKey: `${jobType}:${project.id}:${new Date().toISOString().slice(0, 13)}`,
      priority: 4,
    });

    revalidatePath("/app/integrations");
    return { ok: true, message: "Sync queued." };
  } catch (error) {
    return fail(error);
  }
}

export { encryptSecret };
