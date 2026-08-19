/**
 * The contract every AI engine adapter implements.
 *
 * Providers differ wildly in shape — OpenAI returns a Responses payload with
 * annotations, Gemini returns grounding metadata, Perplexity returns a chat
 * completion with a citations array. Everything is normalised into
 * `AIVisibilityResult` so metrics, storage and the UI never branch on provider.
 */

import type { EngineId, ObservationMode } from "@/lib/config/engines";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed" | "unknown";

export interface AICitation {
  url: string;
  domain: string;
  title?: string;
}

export interface AICompetitorMention {
  brand: string;
  mentioned: boolean;
  recommended: boolean;
}

export interface AIVisibilityResult {
  provider: string;
  model: string;
  prompt: string;
  answer: string;
  brandMentioned: boolean;
  domainCited: boolean;
  recommended: boolean;
  sentiment: Sentiment;
  citations: AICitation[];
  competitorMentions: AICompetitorMention[];
  executedAt: string;
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
}

export interface AIVisibilityPromptInput {
  prompt: string;
  brand: string;
  domain: string;
  competitors?: string[];
  country?: string;
  language?: string;
  /** Aliases the brand is also known by, used to widen mention detection. */
  brandAliases?: string[];
}

/** Why a provider could not run, when it could not. */
export type ProviderUnavailableReason =
  | "not_configured"
  | "feature_disabled"
  | "licensing_required"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "invalid_response";

export interface ProviderStatus {
  id: EngineId;
  name: string;
  configured: boolean;
  /** Human-readable reason shown in the UI when `configured` is false. */
  message?: string;
  missingEnvKeys: string[];
  observationMode: ObservationMode;
}

export class ProviderNotConfiguredError extends Error {
  readonly reason: ProviderUnavailableReason;
  readonly providerId: string;
  constructor(providerId: string, message: string, reason: ProviderUnavailableReason = "not_configured") {
    super(message);
    this.name = "ProviderNotConfiguredError";
    this.providerId = providerId;
    this.reason = reason;
  }
}

export class ProviderRequestError extends Error {
  readonly reason: ProviderUnavailableReason;
  readonly providerId: string;
  readonly status?: number;
  constructor(
    providerId: string,
    message: string,
    reason: ProviderUnavailableReason = "provider_error",
    status?: number,
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.providerId = providerId;
    this.reason = reason;
    if (status !== undefined) this.status = status;
  }
}

export interface AIVisibilityProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  status(): ProviderStatus;
  runVisibilityPrompt(input: AIVisibilityPromptInput): Promise<AIVisibilityResult>;
}

/** Outcome of running one prompt on one engine, including failures. */
export type ProviderRunOutcome =
  | { ok: true; engineId: EngineId; result: AIVisibilityResult }
  | {
      ok: false;
      engineId: EngineId;
      reason: ProviderUnavailableReason;
      message: string;
    };

export interface MultiEngineRunSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Rendered as "4 of 5 engines completed". */
  label: string;
}
