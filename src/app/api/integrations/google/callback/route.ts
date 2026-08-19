import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { emailFromIdToken, exchangeGoogleCode } from "@/lib/integrations/google-oauth";
import { saveCredentials, setConnectionStatus } from "@/lib/integrations/credentials";
import { isRecord } from "@/lib/utils";
import { logger, errorMessage } from "@/lib/logger";

const log = logger.child("google-oauth-callback");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google OAuth callback for Search Console.
 *
 * The `state` parameter is decoded and matched against the audit log entry
 * written when the flow started, so a response we did not initiate is rejected.
 * The refresh token is encrypted before it is stored.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const failureUrl = (message: string) =>
    `${origin}/app/integrations?error=${encodeURIComponent(message)}`;

  if (error) return NextResponse.redirect(failureUrl(`Google returned: ${error}`));
  if (!code || !state) return NextResponse.redirect(failureUrl("That authorisation link was incomplete."));

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  let decoded: { projectId?: string; nonce?: string; integration?: string };
  try {
    const parsed: unknown = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (!isRecord(parsed)) throw new Error("bad state");
    decoded = parsed as { projectId?: string; nonce?: string; integration?: string };
  } catch {
    return NextResponse.redirect(failureUrl("That authorisation response could not be verified."));
  }

  if (!decoded.projectId || !decoded.nonce) {
    return NextResponse.redirect(failureUrl("That authorisation response was missing its state."));
  }

  // Confirm the project belongs to this user, under RLS.
  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, organization_id")
    .eq("id", decoded.projectId)
    .maybeSingle();

  if (!project) return NextResponse.redirect(failureUrl("That project could not be found."));

  // Verify the nonce matches a flow we started for this project.
  const admin = createServiceRoleClient();
  const { data: startedFlow } = await admin
    .from("audit_logs")
    .select("id, metadata")
    .eq("actor_id", user.id)
    .eq("action", "oauth.google.start")
    .eq("entity_id", project.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const nonceMatches = (startedFlow ?? []).some((row) => {
    const metadata = row.metadata;
    return isRecord(metadata) && metadata["nonce"] === decoded.nonce;
  });

  if (!nonceMatches) {
    log.warn("OAuth state nonce did not match a started flow", { projectId: project.id });
    return NextResponse.redirect(failureUrl("That authorisation response could not be verified."));
  }

  try {
    const tokens = await exchangeGoogleCode({ code, integration: "searchConsole" });

    await saveCredentials({
      organizationId: project.organization_id,
      projectId: project.id,
      provider: "google_search_console",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      accountIdentifier: emailFromIdToken(tokens.idToken),
    });

    await setConnectionStatus({
      projectId: project.id,
      provider: "google_search_console",
      // Connected at the account level; the user still picks which property.
      status: "configuration_required",
      displayName: emailFromIdToken(tokens.idToken),
      lastError: null,
    });

    return NextResponse.redirect(`${origin}/app/integrations?connected=google_search_console`);
  } catch (caught) {
    log.error("Google token exchange failed", { error: caught });
    return NextResponse.redirect(failureUrl(errorMessage(caught)));
  }
}
