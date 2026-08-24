/**
 * OpenAI adapter, the Responses API with web search enabled.
 *
 * Important framing, enforced everywhere this data surfaces: this is an
 * observation of the OpenAI API, not a reading of the consumer ChatGPT product.
 * The two can differ, and presenting an API result as a guaranteed consumer
 * ChatGPT ranking would be a false claim.
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

const ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5";

interface ParsedResponse {
  text: string;
  citations: Array<{ url?: string | null; title?: string | null }>;
  usage: Record<string, unknown> | null;
}

/**
 * Walk the Responses payload.
 *
 * `output_text` is a convenience field that is not always present, so the
 * output array is traversed regardless; `url_citation` annotations carry the
 * sources the model actually used.
 */
export function parseOpenAiResponse(payload: unknown): ParsedResponse {
  const citations: Array<{ url?: string | null; title?: string | null }> = [];
  const textParts: string[] = [];

  if (!isRecord(payload)) return { text: "", citations, usage: null };

  const convenience = payload["output_text"];
  if (typeof convenience === "string" && convenience.trim()) textParts.push(convenience.trim());

  const output = payload["output"];
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!isRecord(item)) continue;
      if (item["type"] !== "message") continue;
      const content = item["content"];
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (!isRecord(block)) continue;
        const blockText = block["text"];
        if (typeof blockText === "string" && blockText.trim() && textParts.length === 0) {
          textParts.push(blockText.trim());
        }
        const annotations = block["annotations"];
        if (!Array.isArray(annotations)) continue;
        for (const annotation of annotations) {
          if (!isRecord(annotation)) continue;
          if (annotation["type"] !== "url_citation") continue;
          citations.push({
            url: typeof annotation["url"] === "string" ? annotation["url"] : null,
            title: typeof annotation["title"] === "string" ? annotation["title"] : null,
          });
        }
      }
    }
  }

  return {
    text: textParts.join("\n\n").trim(),
    citations,
    usage: isRecord(payload["usage"]) ? payload["usage"] : null,
  };
}

export class OpenAIVisibilityProvider implements AIVisibilityProvider {
  readonly id = "openai";
  readonly name = ENGINES.openai.name;

  private get model(): string {
    return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return buildStatus("openai").configured;
  }

  status(): ProviderStatus {
    return buildStatus("openai");
  }

  async runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult> {
    const status = this.status();
    if (!status.configured) {
      throw new ProviderNotConfiguredError("openai", status.message ?? "OpenAI is not configured.");
    }

    const { system, user } = buildVisibilityRequest(input);

    const payload = await postJson({
      engineId: "openai",
      url: ENDPOINT,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim()}` },
      body: {
        model: this.model,
        instructions: system,
        input: user,
        tools: [{ type: "web_search" }],
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
      },
    });

    const parsed = parseOpenAiResponse(payload);
    if (!parsed.text) {
      throw new ProviderRequestError(
        "openai",
        "OpenAI returned an empty answer.",
        "invalid_response",
      );
    }

    return buildResult({
      engineId: "openai",
      model: this.model,
      request: input,
      answer: parsed.text,
      citations: normaliseCitations(parsed.citations),
      estimatedCost: ESTIMATED_COST_USD.openai,
      metadata: { usage: parsed.usage, webSearch: true },
    });
  }
}
