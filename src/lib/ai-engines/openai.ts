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
/**
 * Output budget for this provider.
 *
 * Deliberately larger than the shared `MAX_OUTPUT_TOKENS`: on the Responses
 * API a reasoning model spends part of this allowance thinking before it
 * writes anything, so a budget sized only for the answer produces a
 * successful call containing no answer.
 */
const OPENAI_MAX_OUTPUT_TOKENS = Math.max(MAX_OUTPUT_TOKENS, 2_500);

/** Why a response arrived with no text, when the payload says so. */
function describeEmptyResponse(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const status = typeof payload["status"] === "string" ? payload["status"] : null;
  const incomplete = payload["incomplete_details"];
  const reason =
    isRecord(incomplete) && typeof incomplete["reason"] === "string" ? incomplete["reason"] : null;

  if (reason === "max_output_tokens") {
    return "ran out of output budget before writing an answer";
  }
  if (reason) return reason;
  if (status && status !== "completed") return `status ${status}`;
  return null;
}

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
        /**
         * Reasoning tokens are charged against `max_output_tokens` on this
         * endpoint, so the answer and the model's private reasoning share one
         * budget. At the shared 900 the reasoning alone could consume the lot
         * and the call returned successfully with no visible text at all.
         * The budget is raised to leave room for both, and reasoning effort is
         * kept low because this prompt wants a short factual answer rather
         * than deliberation.
         */
        max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
        reasoning: { effort: "low" },
        store: false,
      },
    });

    const parsed = parseOpenAiResponse(payload);
    if (!parsed.text) {
      // Name the cause rather than reporting a bare empty answer: running out
      // of budget mid-reasoning and a genuine refusal need different fixes,
      // and the response says which happened.
      const detail = describeEmptyResponse(payload);
      throw new ProviderRequestError(
        "openai",
        `OpenAI returned an empty answer${detail ? ` (${detail})` : ""}.`,
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
