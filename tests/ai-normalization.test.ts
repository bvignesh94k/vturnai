import { afterEach, describe, expect, it } from "vitest";
import { buildResult, buildStatus, dedupeKey, normaliseCitations } from "@/lib/ai-engines/base";
import { parseOpenAiResponse } from "@/lib/ai-engines/openai";
import { parseGeminiResponse } from "@/lib/ai-engines/gemini";
import { parseAnthropicResponse } from "@/lib/ai-engines/anthropic";
import { parsePerplexityResponse } from "@/lib/ai-engines/perplexity";
import { parseGrokResponse } from "@/lib/ai-engines/grok";
import { parseCopilotResponse, COPILOT_UNAVAILABLE_MESSAGE } from "@/lib/ai-engines/copilot";

/**
 * Provider response normalisation.
 *
 * Every engine returns a different shape. These tests pin that each parser
 * extracts the answer and its citations correctly, and that a malformed or
 * empty payload degrades to "nothing observed" rather than to invented data.
 */

const PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "PERPLEXITY_API_KEY",
  "XAI_API_KEY",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "COPILOT_PROVIDER_ENABLED",
] as const;

afterEach(() => {
  for (const key of PROVIDER_KEYS) delete process.env[key];
});

describe("normaliseCitations", () => {
  it("extracts the domain and de-duplicates", () => {
    const citations = normaliseCitations([
      { url: "https://acme.com/a", title: "A" },
      { url: "https://acme.com/a", title: "A duplicate" },
      { url: "https://www.other.com/b" },
    ]);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({ url: "https://acme.com/a", domain: "acme.com", title: "A" });
    expect(citations[1]?.domain).toBe("other.com");
  });

  it("drops entries that are not usable http URLs", () => {
    expect(
      normaliseCitations([
        { url: null },
        { url: "" },
        { url: "not-a-url" },
        { url: "javascript:alert(1)" },
      ]),
    ).toHaveLength(0);
  });

  it("strips the fragment so two references to one page collapse", () => {
    const citations = normaliseCitations([
      { url: "https://acme.com/guide#intro" },
      { url: "https://acme.com/guide#pricing" },
    ]);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe("https://acme.com/guide");
  });

  it("omits the title key when no title is available", () => {
    const [citation] = normaliseCitations([{ url: "https://acme.com/a" }]);
    expect(citation).toEqual({ url: "https://acme.com/a", domain: "acme.com" });
  });
});

describe("parseOpenAiResponse", () => {
  it("reads the message text and url_citation annotations", () => {
    const parsed = parseOpenAiResponse({
      output: [
        {
          type: "message",
          content: [
            {
              text: "Acme is a strong option for Indian SMEs.",
              annotations: [
                { type: "url_citation", url: "https://acme.com/pricing", title: "Pricing" },
                { type: "file_citation", url: "https://ignored.com" },
              ],
            },
          ],
        },
      ],
      usage: { total_tokens: 400 },
    });

    expect(parsed.text).toBe("Acme is a strong option for Indian SMEs.");
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.citations[0]?.url).toBe("https://acme.com/pricing");
    expect(parsed.usage).toEqual({ total_tokens: 400 });
  });

  it("prefers the output_text convenience field when present", () => {
    expect(parseOpenAiResponse({ output_text: "Short answer." }).text).toBe("Short answer.");
  });

  it("returns empty output for a malformed payload", () => {
    expect(parseOpenAiResponse(null).text).toBe("");
    expect(parseOpenAiResponse({ output: "not an array" }).citations).toHaveLength(0);
  });
});

describe("parseGeminiResponse", () => {
  it("joins the parts and reads grounding chunks", () => {
    const parsed = parseGeminiResponse({
      candidates: [
        {
          content: { parts: [{ text: "Acme " }, { text: "is worth considering." }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://acme.com/", title: "Acme" } },
              { web: { url: "https://review.com/", domain: "review.com" } },
            ],
            webSearchQueries: ["best crm india"],
          },
        },
      ],
      usageMetadata: { totalTokenCount: 300 },
    });

    expect(parsed.text).toBe("Acme is worth considering.");
    expect(parsed.citations).toHaveLength(2);
    expect(parsed.groundingQueries).toEqual(["best crm india"]);
  });

  it("handles a response with no grounding metadata", () => {
    const parsed = parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "Plain answer." }] } }],
    });
    expect(parsed.text).toBe("Plain answer.");
    expect(parsed.citations).toHaveLength(0);
  });
});

describe("parseAnthropicResponse", () => {
  it("puts inline citations before search results", () => {
    const parsed = parseAnthropicResponse({
      content: [
        {
          type: "web_search_tool_result",
          content: [{ url: "https://searched.com/", title: "Searched" }],
        },
        {
          type: "text",
          text: "Acme is a reasonable choice.",
          citations: [{ url: "https://acme.com/docs", title: "Docs" }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 200 },
    });

    expect(parsed.text).toBe("Acme is a reasonable choice.");
    // Inline citations are the stronger signal, so they come first.
    expect(parsed.citations[0]?.url).toBe("https://acme.com/docs");
    expect(parsed.searchResultCount).toBe(1);
  });

  it("returns empty output for a malformed payload", () => {
    expect(parseAnthropicResponse({ content: null }).text).toBe("");
  });
});

describe("parsePerplexityResponse", () => {
  it("reads the message content and both citation shapes", () => {
    const parsed = parsePerplexityResponse({
      choices: [{ message: { content: "Acme and Beta are the main options." } }],
      search_results: [{ url: "https://acme.com/", title: "Acme" }],
      citations: ["https://beta.com/"],
      usage: { total_tokens: 250 },
    });

    expect(parsed.text).toBe("Acme and Beta are the main options.");
    expect(parsed.citations.map((entry) => entry.url)).toEqual([
      "https://acme.com/",
      "https://beta.com/",
    ]);
  });

  it("survives an empty choices array", () => {
    expect(parsePerplexityResponse({ choices: [] }).text).toBe("");
  });
});

describe("parseGrokResponse", () => {
  it("reads content and citations", () => {
    const parsed = parseGrokResponse({
      choices: [{ message: { content: "Acme leads in this category." } }],
      citations: [{ url: "https://acme.com/", title: "Acme" }, "https://news.com/"],
    });

    expect(parsed.text).toBe("Acme leads in this category.");
    expect(parsed.citations).toHaveLength(2);
  });
});

describe("parseCopilotResponse", () => {
  it("reads messages and attributions", () => {
    const parsed = parseCopilotResponse({
      messages: [
        {
          text: "Acme is used widely.",
          attributions: [{ url: "https://acme.com/", providerDisplayName: "Acme" }],
        },
      ],
    });

    expect(parsed.text).toBe("Acme is used widely.");
    expect(parsed.citations).toHaveLength(1);
  });

  it("returns nothing for an empty payload", () => {
    expect(parseCopilotResponse({}).text).toBe("");
  });
});

describe("buildStatus", () => {
  it("reports a provider as unconfigured when its key is missing", () => {
    const status = buildStatus("openai");
    expect(status.configured).toBe(false);
    expect(status.missingEnvKeys).toContain("OPENAI_API_KEY");
    expect(status.observationMode).toBe("unavailable");
  });

  it("reports a provider as configured once its key is present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const status = buildStatus("openai");
    expect(status.configured).toBe(true);
    expect(status.observationMode).toBe("api_observation");
  });

  it("keeps Copilot unavailable until its feature flag is enabled", () => {
    process.env.MICROSOFT_CLIENT_ID = "id";
    process.env.MICROSOFT_CLIENT_SECRET = "secret";
    process.env.MICROSOFT_TENANT_ID = "tenant";

    const disabled = buildStatus("copilot");
    expect(disabled.configured).toBe(false);
    expect(disabled.message).toContain(COPILOT_UNAVAILABLE_MESSAGE);

    process.env.COPILOT_PROVIDER_ENABLED = "true";
    expect(buildStatus("copilot").configured).toBe(true);
  });
});

describe("buildResult", () => {
  it("normalises a provider answer into the shared result shape", () => {
    const result = buildResult({
      engineId: "openai",
      model: "test-model",
      request: {
        prompt: "Best CRM for SMEs in India?",
        brand: "Acme CRM",
        domain: "acme.com",
        competitors: ["Zoho"],
      },
      answer: "I would recommend Acme CRM. Zoho is also popular.",
      citations: normaliseCitations([{ url: "https://acme.com/pricing" }]),
      estimatedCost: 0.02,
    });

    expect(result.provider).toBe("openai");
    expect(result.model).toBe("test-model");
    expect(result.brandMentioned).toBe(true);
    expect(result.domainCited).toBe(true);
    expect(result.recommended).toBe(true);
    expect(result.competitorMentions[0]).toEqual({
      brand: "Zoho",
      mentioned: true,
      recommended: false,
    });
    expect(result.estimatedCost).toBe(0.02);
    expect(new Date(result.executedAt).getTime()).toBeGreaterThan(0);
    expect(result.metadata?.["observationMode"]).toBe("api_observation");
  });

  it("records an omission without inventing a mention", () => {
    const result = buildResult({
      engineId: "gemini",
      model: "test-model",
      request: { prompt: "Best CRM?", brand: "Acme CRM", domain: "acme.com" },
      answer: "Zoho and Freshworks are the leaders.",
      citations: [],
    });

    expect(result.brandMentioned).toBe(false);
    expect(result.domainCited).toBe(false);
    expect(result.recommended).toBe(false);
    expect(result.sentiment).toBe("unknown");
  });
});

describe("dedupeKey", () => {
  it("is stable regardless of competitor ordering or casing", () => {
    const a = dedupeKey({
      engineId: "openai",
      prompt: "Best CRM?",
      brand: "Acme",
      competitors: ["Zoho", "Beta"],
      country: "IN",
    });
    const b = dedupeKey({
      engineId: "openai",
      prompt: "  best crm?  ",
      brand: "acme",
      competitors: ["beta", "ZOHO"],
      country: "in",
    });
    expect(a).toBe(b);
  });

  it("differs per engine so one engine's run does not suppress another", () => {
    const base = { prompt: "Best CRM?", brand: "Acme", competitors: [], country: "IN" };
    expect(dedupeKey({ ...base, engineId: "openai" })).not.toBe(
      dedupeKey({ ...base, engineId: "gemini" }),
    );
  });
});
