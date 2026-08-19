/**
 * Provider registry and multi-engine execution.
 *
 * The rule that matters here: one provider failing must never fail the scan.
 * Each engine is isolated, its failure is recorded with a reason, and the UI is
 * told "4 of 5 engines completed" rather than being handed a silently
 * incomplete picture.
 */

import { ENGINE_IDS, ENGINES, type EngineId } from "@/lib/config/engines";
import { logger } from "@/lib/logger";
import { OpenAIVisibilityProvider } from "@/lib/ai-engines/openai";
import { GeminiVisibilityProvider } from "@/lib/ai-engines/gemini";
import { AnthropicVisibilityProvider } from "@/lib/ai-engines/anthropic";
import { PerplexityVisibilityProvider } from "@/lib/ai-engines/perplexity";
import { GrokVisibilityProvider } from "@/lib/ai-engines/grok";
import { CopilotVisibilityProvider } from "@/lib/ai-engines/copilot";
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type AIVisibilityPromptInput,
  type AIVisibilityProvider,
  type MultiEngineRunSummary,
  type ProviderRunOutcome,
  type ProviderStatus,
} from "@/lib/ai-engines/types";

const log = logger.child("ai-engines");

/**
 * Providers are constructed fresh rather than cached, because configuration is
 * read from the environment at call time and may change between deployments.
 */
export function getProvider(engineId: EngineId): AIVisibilityProvider {
  switch (engineId) {
    case "openai":
      return new OpenAIVisibilityProvider();
    case "gemini":
      return new GeminiVisibilityProvider();
    case "anthropic":
      return new AnthropicVisibilityProvider();
    case "perplexity":
      return new PerplexityVisibilityProvider();
    case "grok":
      return new GrokVisibilityProvider();
    case "copilot":
      return new CopilotVisibilityProvider();
    default: {
      const exhaustive: never = engineId;
      throw new Error(`Unknown engine: ${String(exhaustive)}`);
    }
  }
}

export function getAllProviders(): AIVisibilityProvider[] {
  return ENGINE_IDS.map((id) => getProvider(id));
}

export function getProviderStatuses(): ProviderStatus[] {
  return ENGINE_IDS.map((id) => getProvider(id).status());
}

export function getConfiguredEngineIds(): EngineId[] {
  return ENGINE_IDS.filter((id) => getProvider(id).isConfigured());
}

export interface RunAcrossEnginesInput extends AIVisibilityPromptInput {
  engineIds?: readonly EngineId[];
  /** Run engines in parallel. Kept low so a scan does not spike provider rate limits. */
  concurrency?: number;
}

export interface RunAcrossEnginesResult {
  outcomes: ProviderRunOutcome[];
  summary: MultiEngineRunSummary;
}

/**
 * Run one prompt across every requested engine.
 *
 * Unconfigured engines are skipped (not failed) so an account that has only
 * connected two providers sees "2 of 2 engines completed", not a wall of errors.
 */
export async function runPromptAcrossEngines(
  input: RunAcrossEnginesInput,
): Promise<RunAcrossEnginesResult> {
  const engineIds = input.engineIds ?? ENGINE_IDS;
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, engineIds.length || 1));

  const outcomes: ProviderRunOutcome[] = [];
  let skipped = 0;

  const queue = [...engineIds];
  async function worker(): Promise<void> {
    for (;;) {
      const engineId = queue.shift();
      if (!engineId) return;

      const provider = getProvider(engineId);
      const status = provider.status();

      if (!status.configured) {
        skipped += 1;
        outcomes.push({
          ok: false,
          engineId,
          reason: engineId === "copilot" ? "licensing_required" : "not_configured",
          message: status.message ?? `${ENGINES[engineId].name} is not configured.`,
        });
        continue;
      }

      try {
        const result = await provider.runVisibilityPrompt(input);
        outcomes.push({ ok: true, engineId, result });
      } catch (error) {
        // Never swallow a provider error: log it with context, record it against
        // the run so the user can see what happened, and continue.
        if (error instanceof ProviderNotConfiguredError) {
          skipped += 1;
          outcomes.push({ ok: false, engineId, reason: error.reason, message: error.message });
          log.warn("Provider not configured during scan", { engineId, message: error.message });
          continue;
        }
        if (error instanceof ProviderRequestError) {
          outcomes.push({ ok: false, engineId, reason: error.reason, message: error.message });
          log.error("Provider request failed", {
            engineId,
            reason: error.reason,
            status: error.status,
            message: error.message,
          });
          continue;
        }
        const message = error instanceof Error ? error.message : "Unexpected provider error";
        outcomes.push({ ok: false, engineId, reason: "provider_error", message });
        log.error("Unexpected provider failure", { engineId, error });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  // Preserve the caller's engine ordering for stable UI rendering.
  outcomes.sort((a, b) => engineIds.indexOf(a.engineId) - engineIds.indexOf(b.engineId));

  const succeeded = outcomes.filter((outcome) => outcome.ok).length;
  const attempted = engineIds.length - skipped;
  const failed = attempted - succeeded;

  return {
    outcomes,
    summary: {
      attempted,
      succeeded,
      failed,
      skipped,
      label:
        attempted === 0
          ? "No AI engines are connected"
          : `${succeeded} of ${attempted} engine${attempted === 1 ? "" : "s"} completed`,
    },
  };
}
