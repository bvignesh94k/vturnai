/**
 * Shared adapter machinery.
 *
 * Providers differ in transport and response shape but not in what we ask of
 * them. This module holds the parts that must be identical across engines:
 * how the question is phrased, how citations are normalised, how failures are
 * classified, and how detection is applied to the answer.
 */

import { ENGINES, OBSERVATION_MODES, type EngineId } from "@/lib/config/engines";
import { analyseAnswer } from "@/lib/metrics/detection";
import { toRegistrableHost } from "@/lib/crawler/url";
import { unique } from "@/lib/utils";
import type {
  AICitation,
  AIVisibilityPromptInput,
  AIVisibilityResult,
  ProviderStatus,
  ProviderUnavailableReason,
} from "@/lib/ai-engines/types";
import { ProviderRequestError } from "@/lib/ai-engines/types";

export const PROVIDER_TIMEOUT_MS = 60_000;
export const MAX_OUTPUT_TOKENS = 900;

/**
 * The question sent to every engine.
 *
 * Deliberately neutral: it never names the tracked brand, because naming it
 * would prime the model to mention it and produce a flattering, meaningless
 * measurement. We ask the engine what it would tell a real user, then measure
 * whether the brand appears on its own merits.
 */
export function buildVisibilityRequest(input: AIVisibilityPromptInput): {
  system: string;
  user: string;
} {
  const locale = input.country ? ` The person asking is in ${input.country}.` : "";
  const language = input.language && input.language !== "en" ? ` Answer in ${input.language}.` : "";

  return {
    system:
      "You are answering a real user's question using current information from the web. " +
      "Give the answer you would actually give: name specific companies, products or services where that is genuinely useful, " +
      "and say which you would recommend and why. Cite the sources you used. " +
      "Do not hedge by refusing to name options. Keep the answer under 350 words.",
    user: `${input.prompt}${locale}${language}`,
  };
}

/** Normalise a raw citation into `{ url, domain, title }`, dropping unusable entries. */
export function normaliseCitations(
  raw: ReadonlyArray<{ url?: string | null; title?: string | null }>,
): AICitation[] {
  const seen = new Set<string>();
  const citations: AICitation[] = [];

  for (const entry of raw) {
    const url = entry?.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    let canonical: string;
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      canonical = parsed.toString();
    } catch {
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    const domain = toRegistrableHost(canonical);
    if (!domain) continue;

    const citation: AICitation = { url: canonical, domain };
    const title = entry.title?.trim();
    if (title) citation.title = title;
    citations.push(citation);
  }

  return citations;
}

/**
 * Turn a provider's raw answer plus citations into the normalised result.
 * Every adapter ends here, so mention, citation, recommendation and sentiment
 * detection is provably identical across engines.
 */
export function buildResult(input: {
  engineId: EngineId;
  model: string;
  request: AIVisibilityPromptInput;
  answer: string;
  citations: AICitation[];
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
}): AIVisibilityResult {
  const analysis = analyseAnswer({
    answer: input.answer,
    brand: input.request.brand,
    domain: input.request.domain,
    citations: input.citations,
    competitors: input.request.competitors ?? [],
    brandAliases: input.request.brandAliases ?? [],
  });

  const result: AIVisibilityResult = {
    provider: input.engineId,
    model: input.model,
    prompt: input.request.prompt,
    answer: input.answer,
    brandMentioned: analysis.brandMentioned,
    domainCited: analysis.domainCited,
    recommended: analysis.recommended,
    sentiment: analysis.sentiment,
    citations: input.citations,
    competitorMentions: analysis.competitorMentions,
    executedAt: new Date().toISOString(),
    metadata: {
      observationMode: OBSERVATION_MODES.api_observation.key,
      observationNote: ENGINES[input.engineId].observationNote,
      citedBrandUrls: analysis.citedBrandUrls,
      citationDomains: unique(input.citations.map((citation) => citation.domain)),
      ...(input.metadata ?? {}),
    },
  };

  if (input.estimatedCost !== undefined) result.estimatedCost = input.estimatedCost;
  return result;
}

/** Which environment variables a provider is missing. */
export function missingEnvKeys(engineId: EngineId): string[] {
  return ENGINES[engineId].envKeys.filter((key) => !process.env[key]?.trim());
}

export function buildStatus(engineId: EngineId): ProviderStatus {
  const definition = ENGINES[engineId];
  const missing = missingEnvKeys(engineId);

  if (definition.featureFlag) {
    const flag = process.env[definition.featureFlag]?.trim().toLowerCase();
    if (flag !== "true" && flag !== "1") {
      return {
        id: engineId,
        name: definition.name,
        configured: false,
        message: `${definition.name} connection unavailable`,
        missingEnvKeys: missing,
        observationMode: "unavailable",
      };
    }
  }

  if (missing.length > 0) {
    return {
      id: engineId,
      name: definition.name,
      configured: false,
      message: `Add ${missing.join(", ")} under Integrations to monitor ${definition.name}.`,
      missingEnvKeys: missing,
      observationMode: "unavailable",
    };
  }

  return {
    id: engineId,
    name: definition.name,
    configured: true,
    missingEnvKeys: [],
    observationMode: "api_observation",
  };
}

/** POST JSON with a timeout, mapping transport and HTTP failures onto provider errors. */
export async function postJson(input: {
  engineId: EngineId;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? PROVIDER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...input.headers },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ProviderRequestError(
      input.engineId,
      aborted
        ? `${ENGINES[input.engineId].name} did not respond within ${(input.timeoutMs ?? PROVIDER_TIMEOUT_MS) / 1000}s.`
        : `${ENGINES[input.engineId].name} could not be reached.`,
      aborted ? "timeout" : "provider_error",
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const detail = await safeErrorText(response);
    throw new ProviderRequestError(
      input.engineId,
      `${ENGINES[input.engineId].name} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      classifyStatus(response.status),
      response.status,
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(
      input.engineId,
      `${ENGINES[input.engineId].name} returned a response that could not be parsed.`,
      "invalid_response",
      response.status,
    );
  }
}

function classifyStatus(status: number): ProviderUnavailableReason {
  if (status === 401 || status === 403) return "not_configured";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    // Provider error bodies can embed the API key in an echo of the request.
    return text.replace(/(sk-|key-|Bearer\s+)[A-Za-z0-9_\-.]{8,}/g, "$1[redacted]").slice(0, 300);
  } catch {
    return "";
  }
}

/** Approximate per-call cost in USD, used for spend tracking, not billing. */
export const ESTIMATED_COST_USD: Record<EngineId, number> = {
  openai: 0.02,
  gemini: 0.008,
  anthropic: 0.022,
  perplexity: 0.006,
  grok: 0.012,
  copilot: 0,
};

/** Stable key used to skip re-running an identical prompt within a scan window. */
export function dedupeKey(input: {
  engineId: EngineId;
  prompt: string;
  brand: string;
  competitors: readonly string[];
  country: string;
}): string {
  return [
    input.engineId,
    input.prompt.trim().toLowerCase(),
    input.brand.trim().toLowerCase(),
    [...input.competitors].map((entry) => entry.trim().toLowerCase()).sort().join("|"),
    input.country.toLowerCase(),
  ].join("::");
}
