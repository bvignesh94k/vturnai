/**
 * Gemini adapter — the Gemini API with Google Search grounding.
 *
 * Grounding metadata gives us the web sources the model consulted, which is
 * what we record as citations. Note that Google's grounding redirect URLs are
 * kept as-is when no original URI is supplied; the domain is still resolvable
 * for share-of-voice purposes and the raw entry is preserved in metadata.
 */

import { ENGINES } from "@/lib/config/engines";
import {
  ESTIMATED_COST_USD,
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

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Pinned deliberately rather than tracking a `-latest` alias. This product
 * reports visibility trends over time, and a model that changes underneath a
 * trend line makes the movement unattributable — a reader cannot tell a real
 * visibility shift from a model swap. The cost of pinning is that a retired
 * model must be bumped by hand; Google 404s with the replacement name in the
 * message, and `GOOGLE_GEMINI_MODEL` overrides this without a deploy meanwhile.
 */
const DEFAULT_MODEL = "gemini-3.6-flash";

interface ParsedResponse {
  text: string;
  citations: Array<{ url?: string | null; title?: string | null }>;
  groundingQueries: string[];
  usage: Record<string, unknown> | null;
}

export function parseGeminiResponse(payload: unknown): ParsedResponse {
  const citations: Array<{ url?: string | null; title?: string | null }> = [];
  const textParts: string[] = [];
  const groundingQueries: string[] = [];

  if (!isRecord(payload)) return { text: "", citations, groundingQueries, usage: null };

  const candidates = payload["candidates"];
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!isRecord(candidate)) continue;

      const content = candidate["content"];
      if (isRecord(content) && Array.isArray(content["parts"])) {
        for (const part of content["parts"]) {
          if (isRecord(part) && typeof part["text"] === "string") textParts.push(part["text"]);
        }
      }

      const grounding = candidate["groundingMetadata"];
      if (!isRecord(grounding)) continue;

      const chunks = grounding["groundingChunks"];
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          if (!isRecord(chunk)) continue;
          const web = chunk["web"];
          if (!isRecord(web)) continue;
          citations.push({
            url:
              (typeof web["uri"] === "string" ? web["uri"] : null) ??
              (typeof web["url"] === "string" ? web["url"] : null),
            title:
              (typeof web["title"] === "string" ? web["title"] : null) ??
              (typeof web["domain"] === "string" ? web["domain"] : null),
          });
        }
      }

      const queries = grounding["webSearchQueries"];
      if (Array.isArray(queries)) {
        for (const query of queries) if (typeof query === "string") groundingQueries.push(query);
      }
    }
  }

  return {
    text: textParts.join("").trim(),
    citations,
    groundingQueries,
    usage: isRecord(payload["usageMetadata"]) ? payload["usageMetadata"] : null,
  };
}

export class GeminiVisibilityProvider implements AIVisibilityProvider {
  readonly id = "gemini";
  readonly name = ENGINES.gemini.name;

  private get model(): string {
    return process.env.GOOGLE_GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return buildStatus("gemini").configured;
  }

  status(): ProviderStatus {
    return buildStatus("gemini");
  }

  async runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult> {
    const status = this.status();
    if (!status.configured) {
      throw new ProviderNotConfiguredError("gemini", status.message ?? "Gemini is not configured.");
    }

    const { system, user } = buildVisibilityRequest(input);
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY?.trim() ?? "";

    const payload = await postJson({
      engineId: "gemini",
      url: `${API_BASE}/${encodeURIComponent(this.model)}:generateContent`,
      headers: { "x-goog-api-key": apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.3 },
      },
    });

    const parsed = parseGeminiResponse(payload);
    if (!parsed.text) {
      throw new ProviderRequestError("gemini", "Gemini returned an empty answer.", "invalid_response");
    }

    return buildResult({
      engineId: "gemini",
      model: this.model,
      request: input,
      answer: parsed.text,
      citations: normaliseCitations(parsed.citations),
      estimatedCost: ESTIMATED_COST_USD.gemini,
      metadata: {
        usage: parsed.usage,
        grounding: true,
        groundingQueries: parsed.groundingQueries,
      },
    });
  }
}
