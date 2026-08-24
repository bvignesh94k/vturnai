/**
 * The AI answer engines V Turn AI monitors.
 *
 * `envKeys` names the server-side environment variables that make a provider
 * usable. Nothing here implies any partnership with, or endorsement by, the
 * companies that operate these engines, we call their public developer APIs.
 */

export const ENGINE_IDS = [
  "openai",
  "gemini",
  "anthropic",
  "perplexity",
  "grok",
  "copilot",
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

export interface EngineDefinition {
  id: EngineId;
  /** Consumer-facing name of the engine users recognise. */
  name: string;
  /** Company operating the engine, shown as fine print. */
  vendor: string;
  /** Two-letter monogram used by the text/icon logo treatment. */
  monogram: string;
  /** CSS colour used for charts and status chips. */
  accent: string;
  /** Short description of what the adapter actually observes. */
  observationNote: string;
  /** Environment variables required before the adapter can run. */
  envKeys: readonly string[];
  /** Whether the adapter is gated behind an explicit feature flag. */
  featureFlag?: string;
  /** True when the underlying API can return source citations. */
  supportsCitations: boolean;
  /** True when the API performs live web retrieval for the answer. */
  supportsWebSearch: boolean;
}

export const ENGINES: Record<EngineId, EngineDefinition> = {
  openai: {
    id: "openai",
    name: "ChatGPT",
    vendor: "OpenAI",
    monogram: "GP",
    accent: "var(--chart-3)",
    observationNote:
      "Observed through the OpenAI API with web search enabled. This is an API observation, not a reading of the consumer ChatGPT product.",
    envKeys: ["OPENAI_API_KEY"],
    supportsCitations: true,
    supportsWebSearch: true,
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    vendor: "Google",
    monogram: "GE",
    accent: "var(--chart-2)",
    observationNote:
      "Observed through the Gemini API with Google Search grounding. Grounding sources are recorded as citations.",
    envKeys: ["GOOGLE_GEMINI_API_KEY"],
    supportsCitations: true,
    supportsWebSearch: true,
  },
  anthropic: {
    id: "anthropic",
    name: "Claude",
    vendor: "Anthropic",
    monogram: "CL",
    accent: "var(--chart-4)",
    observationNote:
      "Observed through the Anthropic API with the web search tool enabled. Web citations returned by the tool are recorded.",
    envKeys: ["ANTHROPIC_API_KEY"],
    supportsCitations: true,
    supportsWebSearch: true,
  },
  perplexity: {
    id: "perplexity",
    name: "Perplexity",
    vendor: "Perplexity AI",
    monogram: "PX",
    accent: "var(--chart-1)",
    observationNote:
      "Observed through the Perplexity Sonar API, which answers from live web retrieval and returns the URLs it used.",
    envKeys: ["PERPLEXITY_API_KEY"],
    supportsCitations: true,
    supportsWebSearch: true,
  },
  grok: {
    id: "grok",
    name: "Grok",
    vendor: "xAI",
    monogram: "GR",
    accent: "var(--chart-5)",
    observationNote:
      "Observed through the xAI API with live search enabled. Citations are recorded when the API returns them.",
    envKeys: ["XAI_API_KEY"],
    supportsCitations: true,
    supportsWebSearch: true,
  },
  copilot: {
    id: "copilot",
    name: "Copilot",
    vendor: "Microsoft",
    monogram: "CP",
    accent: "var(--chart-6)",
    observationNote:
      "Requires a Microsoft 365 Copilot Chat API connection and eligible licensing. V Turn AI never scrapes the consumer Copilot website, and shows no data unless a real connection returns it.",
    envKeys: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"],
    featureFlag: "COPILOT_PROVIDER_ENABLED",
    supportsCitations: true,
    supportsWebSearch: true,
  },
};

export const ENGINE_LIST: readonly EngineDefinition[] = ENGINE_IDS.map((id) => ENGINES[id]);

/** How a measurement was obtained. Displayed next to every AI number. */
export const OBSERVATION_MODES = {
  direct_observation: {
    key: "direct_observation",
    label: "Directly observed",
    description: "Read directly from the engine's own consumer surface.",
  },
  api_observation: {
    key: "api_observation",
    label: "API observed",
    description:
      "Produced by calling the engine's official developer API. Results reflect the API, which can differ from the consumer product.",
  },
  estimated: {
    key: "estimated",
    label: "Estimated",
    description: "Derived from other signals rather than measured directly. Treat as indicative.",
  },
  unavailable: {
    key: "unavailable",
    label: "Unavailable",
    description: "No authorised data source is connected, so no measurement exists.",
  },
} as const;

export type ObservationMode = keyof typeof OBSERVATION_MODES;

/** Classic search engines we report on through webmaster integrations. */
export const SEARCH_ENGINES = [
  { id: "google", name: "Google", monogram: "GO", integration: "Google Search Console" },
  { id: "bing", name: "Bing", monogram: "BI", integration: "Bing Webmaster Tools" },
] as const;
