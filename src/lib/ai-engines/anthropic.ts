/**
 * Anthropic adapter — the Messages API with the web search tool.
 *
 * Sources arrive in two shapes: `web_search_tool_result` blocks listing the
 * pages searched, and inline `citations` attached to text blocks marking what
 * the answer actually drew on. Both are collected; inline citations are the
 * stronger signal and are recorded first.
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

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const WEB_SEARCH_TOOL = "web_search_20250305";
const DEFAULT_MODEL = "claude-sonnet-5";

interface ParsedResponse {
  text: string;
  citations: Array<{ url?: string | null; title?: string | null }>;
  searchResultCount: number;
  usage: Record<string, unknown> | null;
}

export function parseAnthropicResponse(payload: unknown): ParsedResponse {
  const inlineCitations: Array<{ url?: string | null; title?: string | null }> = [];
  const searchResults: Array<{ url?: string | null; title?: string | null }> = [];
  const textParts: string[] = [];

  if (!isRecord(payload)) {
    return { text: "", citations: [], searchResultCount: 0, usage: null };
  }

  const content = payload["content"];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isRecord(block)) continue;

      if (block["type"] === "text") {
        if (typeof block["text"] === "string") textParts.push(block["text"]);
        const citations = block["citations"];
        if (Array.isArray(citations)) {
          for (const citation of citations) {
            if (!isRecord(citation)) continue;
            inlineCitations.push({
              url: typeof citation["url"] === "string" ? citation["url"] : null,
              title:
                typeof citation["title"] === "string"
                  ? citation["title"]
                  : typeof citation["cited_text"] === "string"
                    ? citation["cited_text"].slice(0, 120)
                    : null,
            });
          }
        }
        continue;
      }

      if (block["type"] === "web_search_tool_result") {
        const results = block["content"];
        if (!Array.isArray(results)) continue;
        for (const result of results) {
          if (!isRecord(result)) continue;
          searchResults.push({
            url: typeof result["url"] === "string" ? result["url"] : null,
            title: typeof result["title"] === "string" ? result["title"] : null,
          });
        }
      }
    }
  }

  return {
    text: textParts.join("").trim(),
    // Inline citations first: they represent sources the answer actually used.
    citations: [...inlineCitations, ...searchResults],
    searchResultCount: searchResults.length,
    usage: isRecord(payload["usage"]) ? payload["usage"] : null,
  };
}

export class AnthropicVisibilityProvider implements AIVisibilityProvider {
  readonly id = "anthropic";
  readonly name = ENGINES.anthropic.name;

  private get model(): string {
    return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return buildStatus("anthropic").configured;
  }

  status(): ProviderStatus {
    return buildStatus("anthropic");
  }

  async runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult> {
    const status = this.status();
    if (!status.configured) {
      throw new ProviderNotConfiguredError("anthropic", status.message ?? "Claude is not configured.");
    }

    const { system, user } = buildVisibilityRequest(input);

    const payload = await postJson({
      engineId: "anthropic",
      url: ENDPOINT,
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY?.trim() ?? "",
        "anthropic-version": API_VERSION,
      },
      body: {
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
        tools: [
          {
            type: WEB_SEARCH_TOOL,
            name: "web_search",
            max_uses: 5,
            ...(input.country ? { user_location: { type: "approximate", country: input.country } } : {}),
          },
        ],
      },
    });

    const parsed = parseAnthropicResponse(payload);
    if (!parsed.text) {
      throw new ProviderRequestError("anthropic", "Claude returned an empty answer.", "invalid_response");
    }

    return buildResult({
      engineId: "anthropic",
      model: this.model,
      request: input,
      answer: parsed.text,
      citations: normaliseCitations(parsed.citations),
      estimatedCost: ESTIMATED_COST_USD.anthropic,
      metadata: {
        usage: parsed.usage,
        webSearch: true,
        searchResultCount: parsed.searchResultCount,
      },
    });
  }
}
