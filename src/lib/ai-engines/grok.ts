/**
 * xAI Grok adapter, the xAI chat completions API with live search.
 *
 * Search sources are restricted to the web here. X (Twitter) search is a
 * distinct source type with different visibility semantics, a post is not a
 * citable page, so it is deliberately left to a future adapter rather than
 * mixed into web citation counts.
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

const ENDPOINT = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = "grok-4";

interface ParsedResponse {
  text: string;
  citations: Array<{ url?: string | null; title?: string | null }>;
  usage: Record<string, unknown> | null;
}

export function parseGrokResponse(payload: unknown): ParsedResponse {
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

  const rawCitations = payload["citations"];
  if (Array.isArray(rawCitations)) {
    for (const entry of rawCitations) {
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

export class GrokVisibilityProvider implements AIVisibilityProvider {
  readonly id = "grok";
  readonly name = ENGINES.grok.name;

  private get model(): string {
    return process.env.XAI_MODEL?.trim() || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return buildStatus("grok").configured;
  }

  status(): ProviderStatus {
    return buildStatus("grok");
  }

  async runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult> {
    const status = this.status();
    if (!status.configured) {
      throw new ProviderNotConfiguredError("grok", status.message ?? "Grok is not configured.");
    }

    const { system, user } = buildVisibilityRequest(input);

    const payload = await postJson({
      engineId: "grok",
      url: ENDPOINT,
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY?.trim()}` },
      body: {
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        search_parameters: {
          mode: "on",
          return_citations: true,
          max_search_results: 10,
          sources: [{ type: "web" }],
        },
      },
    });

    const parsed = parseGrokResponse(payload);
    if (!parsed.text) {
      throw new ProviderRequestError("grok", "Grok returned an empty answer.", "invalid_response");
    }

    return buildResult({
      engineId: "grok",
      model: this.model,
      request: input,
      answer: parsed.text,
      citations: normaliseCitations(parsed.citations),
      estimatedCost: ESTIMATED_COST_USD.grok,
      metadata: { usage: parsed.usage, webSearch: true, xSearchEnabled: false },
    });
  }
}
