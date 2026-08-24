/**
 * Perplexity adapter, the Sonar web-grounded answer API.
 *
 * Perplexity is answer-first by design: every response is grounded in live
 * retrieval and returns the URLs it used, which makes it the cleanest citation
 * signal of the engines we monitor.
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

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const DEFAULT_MODEL = "sonar";

interface ParsedResponse {
  text: string;
  citations: Array<{ url?: string | null; title?: string | null }>;
  usage: Record<string, unknown> | null;
}

export function parsePerplexityResponse(payload: unknown): ParsedResponse {
  const citations: Array<{ url?: string | null; title?: string | null }> = [];
  let text = "";

  if (!isRecord(payload)) return { text, citations, usage: null };

  const choices = payload["choices"];
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (isRecord(first) && isRecord(first["message"])) {
      const content = first["message"]["content"];
      if (typeof content === "string") text = content.trim();
    }
  }

  // `search_results` carries titles; the legacy `citations` array is URLs only.
  const searchResults = payload["search_results"];
  if (Array.isArray(searchResults)) {
    for (const entry of searchResults) {
      if (!isRecord(entry)) continue;
      citations.push({
        url: typeof entry["url"] === "string" ? entry["url"] : null,
        title: typeof entry["title"] === "string" ? entry["title"] : null,
      });
    }
  }

  const legacy = payload["citations"];
  if (Array.isArray(legacy)) {
    for (const entry of legacy) {
      if (typeof entry === "string") citations.push({ url: entry, title: null });
      else if (isRecord(entry) && typeof entry["url"] === "string") {
        citations.push({
          url: entry["url"],
          title: typeof entry["title"] === "string" ? entry["title"] : null,
        });
      }
    }
  }

  return { text, citations, usage: isRecord(payload["usage"]) ? payload["usage"] : null };
}

export class PerplexityVisibilityProvider implements AIVisibilityProvider {
  readonly id = "perplexity";
  readonly name = ENGINES.perplexity.name;

  private get model(): string {
    return process.env.PERPLEXITY_MODEL?.trim() || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return buildStatus("perplexity").configured;
  }

  status(): ProviderStatus {
    return buildStatus("perplexity");
  }

  async runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult> {
    const status = this.status();
    if (!status.configured) {
      throw new ProviderNotConfiguredError(
        "perplexity",
        status.message ?? "Perplexity is not configured.",
      );
    }

    const { system, user } = buildVisibilityRequest(input);

    const payload = await postJson({
      engineId: "perplexity",
      url: ENDPOINT,
      headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY?.trim()}` },
      body: {
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        return_related_questions: false,
        ...(input.country ? { web_search_options: { user_location: { country: input.country } } } : {}),
      },
    });

    const parsed = parsePerplexityResponse(payload);
    if (!parsed.text) {
      throw new ProviderRequestError(
        "perplexity",
        "Perplexity returned an empty answer.",
        "invalid_response",
      );
    }

    return buildResult({
      engineId: "perplexity",
      model: this.model,
      request: input,
      answer: parsed.text,
      citations: normaliseCitations(parsed.citations),
      estimatedCost: ESTIMATED_COST_USD.perplexity,
      metadata: { usage: parsed.usage, webSearch: true },
    });
  }
}
