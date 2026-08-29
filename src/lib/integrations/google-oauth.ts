import "server-only";

import { absoluteUrl } from "@/lib/config/site";
import { isRecord } from "@/lib/utils";

/**
 * Google OAuth 2.0, server side only.
 *
 * The client secret never leaves the server, the authorization code exchange
 * happens in a route handler, and the resulting refresh token is encrypted
 * before it touches the database.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPES = {
  searchConsole: [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "openid",
    "email",
  ],
  analytics: ["https://www.googleapis.com/auth/analytics.readonly", "openid", "email"],
} as const;

export type GoogleIntegration = keyof typeof GOOGLE_SCOPES;

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

/**
 * Whether Google has approved this app's sensitive-scope verification.
 *
 * Being configured and being verified are different facts. A configured but
 * unverified app can still request the OAuth grant, but Google shows every
 * user who is not the developer a page reading "you shouldn't use this" -
 * indistinguishable from a phishing warning to someone who has never seen an
 * app in review before. Sending real customers into that flow costs more
 * trust than the feature is worth until the review actually clears, so the
 * Connect button for Search Console and GA4 stays hidden behind this flag
 * rather than behind whether OAuth happens to be configured.
 *
 * Flip to "true" in the deployment's environment once Google's Auth Platform
 * verification centre shows the app as verified, then redeploy. The developer
 * can still exercise the real flow at any time by clicking through Google's
 * own "Advanced -> Go to (unsafe)" link, unaffected by this flag - it only
 * changes what customers are offered, not whether the OAuth route works.
 */
export function isGoogleOAuthVerified(): boolean {
  return process.env.GOOGLE_OAUTH_VERIFIED?.trim().toLowerCase() === "true";
}

export function googleRedirectUri(integration: GoogleIntegration): string {
  return absoluteUrl(
    integration === "searchConsole"
      ? "/api/integrations/google/callback"
      : "/api/integrations/google-analytics/callback",
  );
}

export function buildGoogleAuthUrl(input: {
  integration: GoogleIntegration;
  state: string;
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(input.integration),
    response_type: "code",
    scope: GOOGLE_SCOPES[input.integration].join(" "),
    access_type: "offline",
    // `consent` guarantees a refresh token even on repeat authorisation.
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
  idToken: string | null;
}

async function requestTokens(body: URLSearchParams): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok || !isRecord(payload) || typeof payload["access_token"] !== "string") {
    const detail = isRecord(payload) && typeof payload["error_description"] === "string"
      ? payload["error_description"]
      : `HTTP ${response.status}`;
    throw new Error(`Google rejected the token request: ${detail}`);
  }

  const expiresIn = typeof payload["expires_in"] === "number" ? payload["expires_in"] : 3600;
  return {
    accessToken: payload["access_token"],
    refreshToken: typeof payload["refresh_token"] === "string" ? payload["refresh_token"] : null,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scopes: typeof payload["scope"] === "string" ? payload["scope"].split(" ") : [],
    idToken: typeof payload["id_token"] === "string" ? payload["id_token"] : null,
  };
}

export async function exchangeGoogleCode(input: {
  code: string;
  integration: GoogleIntegration;
}): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured.");

  return requestTokens(
    new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(input.integration),
      grant_type: "authorization_code",
    }),
  );
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured.");

  const tokens = await requestTokens(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  );
  // Google omits the refresh token on refresh; keep the one we already hold.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

/** Decode the email claim from an id_token without verifying the signature. */
export function emailFromIdToken(idToken: string | null): string | null {
  if (!idToken) return null;
  const segment = idToken.split(".")[1];
  if (!segment) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return isRecord(decoded) && typeof decoded["email"] === "string" ? decoded["email"] : null;
  } catch {
    return null;
  }
}
