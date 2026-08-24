/**
 * Microsoft Copilot adapter.
 *
 * There is no public developer API for consumer Copilot, and scraping
 * Microsoft's consumer Copilot website is not something this product does. The
 * only legitimate programmatic route is the Microsoft 365 Copilot Chat API,
 * which requires an Entra ID app registration and eligible Microsoft 365 Copilot
 * licensing on the tenant.
 *
 * Until those credentials exist, this provider reports
 * "Copilot connection unavailable" and returns no data. It never estimates,
 * infers or fabricates a Copilot result, a fake number here would be worse
 * than no number, because a customer would act on it.
 */

import { ENGINES } from "@/lib/config/engines";
import {
  MAX_OUTPUT_TOKENS,
  buildResult,
  buildStatus,
  buildVisibilityRequest,
  normaliseCitations,
  postJson,
} from "@/lib/ai-engines/base";
import { isRecord } from "@/lib/utils";
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type AIVisibilityPromptInput,
  type AIVisibilityProvider,
  type AIVisibilityResult,
  type ProviderStatus,
} from "@/lib/ai-engines/types";

export const COPILOT_UNAVAILABLE_MESSAGE = "Copilot connection unavailable";

const TOKEN_ENDPOINT = (tenantId: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

/**
 * Microsoft 365 Copilot Chat endpoint. Held as a constant so that when a tenant
 * is connected the call site does not change, only credentials appear.
 */
const COPILOT_CHAT_ENDPOINT = "https://graph.microsoft.com/beta/copilot/conversations";

interface ClientCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

function readCredentials(): ClientCredentials | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim();
  if (!clientId || !clientSecret || !tenantId) return null;
  return { clientId, clientSecret, tenantId };
}

async function requestAccessToken(credentials: ClientCredentials): Promise<string> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(TOKEN_ENDPOINT(credentials.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new ProviderRequestError(
      "copilot",
      `${COPILOT_UNAVAILABLE_MESSAGE}: Microsoft rejected the credentials (HTTP ${response.status}).`,
      response.status === 401 || response.status === 403 ? "licensing_required" : "provider_error",
      response.status,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload["access_token"] !== "string") {
    throw new ProviderRequestError(
      "copilot",
      `${COPILOT_UNAVAILABLE_MESSAGE}: no access token was returned.`,
      "invalid_response",
    );
  }
  return payload["access_token"];
}

export class CopilotVisibilityProvider implements AIVisibilityProvider {
  readonly id = "copilot";
  readonly name = ENGINES.copilot.name;

  isConfigured(): boolean {
    return buildStatus("copilot").configured;
  }

  status(): ProviderStatus {
    const status = buildStatus("copilot");
    if (!status.configured) {
      return {
        ...status,
        message:
          status.missingEnvKeys.length > 0
            ? `${COPILOT_UNAVAILABLE_MESSAGE}. A Microsoft 365 Copilot Chat connection and eligible licensing are required.`
            : COPILOT_UNAVAILABLE_MESSAGE,
      };
    }
    return status;
  }

  async runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult> {
    const status = this.status();
    if (!status.configured) {
      throw new ProviderNotConfiguredError(
        "copilot",
        status.message ?? COPILOT_UNAVAILABLE_MESSAGE,
        "licensing_required",
      );
    }

    const credentials = readCredentials();
    if (!credentials) {
      throw new ProviderNotConfiguredError(
        "copilot",
        COPILOT_UNAVAILABLE_MESSAGE,
        "licensing_required",
      );
    }

    const accessToken = await requestAccessToken(credentials);
    const { system, user } = buildVisibilityRequest(input);

    const payload = await postJson({
      engineId: "copilot",
      url: COPILOT_CHAT_ENDPOINT,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        messages: [
          { role: "system", text: system },
          { role: "user", text: user },
        ],
        maxTokens: MAX_OUTPUT_TOKENS,
      },
    });

    const parsed = parseCopilotResponse(payload);
    if (!parsed.text) {
      throw new ProviderRequestError(
        "copilot",
        `${COPILOT_UNAVAILABLE_MESSAGE}: the tenant returned no answer.`,
        "invalid_response",
      );
    }

    return buildResult({
      engineId: "copilot",
      model: "microsoft-365-copilot-chat",
      request: input,
      answer: parsed.text,
      citations: normaliseCitations(parsed.citations),
      estimatedCost: 0,
      metadata: { tenantConnected: true },
    });
  }
}

/**
 * Parse a Microsoft 365 Copilot Chat response. Tolerant of the shape varying
 * between the beta and GA surfaces.
 */
export function parseCopilotResponse(payload: unknown): {
  text: string;
  citations: Array<{ url?: string | null; title?: string | null }>;
} {
  const citations: Array<{ url?: string | null; title?: string | null }> = [];
  const textParts: string[] = [];

  if (!isRecord(payload)) return { text: "", citations };

  const messages = payload["messages"] ?? payload["value"];
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!isRecord(message)) continue;
      const text = message["text"] ?? message["content"];
      if (typeof text === "string") textParts.push(text);

      const attributions = message["attributions"] ?? message["references"];
      if (!Array.isArray(attributions)) continue;
      for (const attribution of attributions) {
        if (!isRecord(attribution)) continue;
        citations.push({
          url:
            (typeof attribution["url"] === "string" ? attribution["url"] : null) ??
            (typeof attribution["seeMoreWebUrl"] === "string" ? attribution["seeMoreWebUrl"] : null),
          title: typeof attribution["providerDisplayName"] === "string"
            ? attribution["providerDisplayName"]
            : typeof attribution["title"] === "string"
              ? attribution["title"]
              : null,
        });
      }
    }
  }

  return { text: textParts.join("\n").trim(), citations };
}
