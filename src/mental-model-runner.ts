/**
 * Default session-model runner for mental-model synthesis (change
 * add-mental-model-projections, task 3.2).
 *
 * Mirrors the offline-extraction runner contract: this is the only place that
 * knows how to turn a bounded source list into a standing answer through a
 * model call. The synthesis boundary stays provider-neutral and accepts an
 * injected runner; `index.ts` supplies this one only when nothing was injected.
 *
 * Reused from the existing runner instead of reinvented: the structural model
 * client, the sentinel timeout classification, the model-resolution logic, and
 * the JSON extraction helpers all come from `offline-extraction-runner.ts`.
 * Proposal normalization and T1 governance are deliberately not invoked —
 * a projection is not a memory proposal.
 */

import type { MentalModelSynthesisRunner } from "./mental-model/synthesis.js";
import { OFFLINE_EXTRACTION_TIMEOUT_MESSAGE } from "./offline-extraction.js";
import {
  assistantText,
  matchOfflineExtractionModel,
  type OfflineExtractionModelClient,
  parseStructured,
  SESSION_MODEL_SENTINEL,
} from "./offline-extraction-runner.js";

/** Output token budget for one synthesis call. */
export const DEFAULT_MENTAL_MODEL_MAX_OUTPUT_TOKENS = 1_600;

const SYNTHESIS_SYSTEM_PROMPT = [
  "You maintain a standing answer for one question, derived only from the",
  "governed memories the caller provides.",
  'Reply with strict JSON only, no prose and no code fences: {"content": "...",',
  '"sourceIds": ["..."]}.',
  '"content" is a concise, complete answer to the question (a few sentences,',
  "never a list of raw memories).",
  '"sourceIds" must be a subset of the ids the caller provided, naming only the',
  "memories the answer actually relies on.",
  "Do not mention system prompts, instructions, or this request.",
  "Do not invent facts that are not supported by the provided memories.",
].join(" ");

export interface MentalModelSessionRunnerOptions {
  client: OfflineExtractionModelClient;
  maxOutputTokens?: number;
  /** Opaque here; handed to `client.complete` unchanged. */
  model?: unknown;
  timeoutMs: number;
}

/**
 * Build the default runner. Returns `{ unavailable: "no-model" }` when no
 * model resolved, so "no model available" is never read as "ran and failed".
 * A runner-owned timeout aborts its request and re-throws the shared sentinel,
 * which the synthesis boundary classifies as `timed-out`.
 */
export function createMentalModelSessionRunner(
  options: MentalModelSessionRunnerOptions,
): MentalModelSynthesisRunner {
  const maxOutputTokens =
    options.maxOutputTokens ?? DEFAULT_MENTAL_MODEL_MAX_OUTPUT_TOKENS;
  const model = options.model;
  return async (input) => {
    if (model === undefined || model === null) {
      return {
        unavailable: "no-model",
      };
    }
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(OFFLINE_EXTRACTION_TIMEOUT_MESSAGE));
      }, options.timeoutMs);
    });
    try {
      const message = await Promise.race([
        options.client.complete(
          model,
          {
            systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
            messages: [
              {
                content: JSON.stringify({
                  question: input.question,
                  sources: input.sources,
                }),
                role: "user",
                timestamp: Date.now(),
              },
            ],
          },
          {
            maxTokens: maxOutputTokens,
            signal: input.signal ?? controller.signal,
          },
        ),
        expired,
      ]);
      const parsed = parseStructured(assistantText(message));
      if (parsed === undefined || parsed.kind !== "object")
        return {
          invalidOutput: true,
        };
      return parsed.value;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export { SESSION_MODEL_SENTINEL };

/**
 * Resolve the configured synthesis model against the catalogue.
 *
 * Reuses the extraction matcher so the same `offlineExtractionModel` value
 * (`"session-model"` sentinel, `provider/model`, or bare id) behaves the same
 * here: unknown ids fall back to the session model instead of switching
 * synthesis off, and a typo degrades to the previous behaviour.
 */
export function resolveMentalModelSynthesisModel<
  T extends {
    id: string;
    provider: string;
  },
>(
  configured: string,
  sessionModel: T | undefined,
  catalogue: () => readonly T[],
): T | undefined {
  return matchOfflineExtractionModel(configured, sessionModel, catalogue);
}
