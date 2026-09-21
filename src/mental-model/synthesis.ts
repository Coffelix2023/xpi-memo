/**
 * Gated, bounded mental-model synthesis boundary (change
 * add-mental-model-projections, tasks 3.2/3.3).
 *
 * This boundary is deliberately provider-neutral: an injected runner may be a
 * session-model runner or a host-provided replacement, and the boundary never
 * calls proposal normalization or T1 governance because a projection is not a
 * memory proposal. Everything that can go wrong is expressed as a bounded
 * diagnostic result instead of a throw, so a slow, hanging, or unavailable
 * provider can never block a lifecycle point.
 *
 * Two safety gates run here, both reused from the existing boundary:
 * - the source payload is screened by `prepareExternalContent` before any
 *   external call (credential redaction / refusal);
 * - the generated output is validated into a closed shape and screened by
 *   `isPersistableContent` before anything is persisted.
 */

import { isPersistableContent } from "../content-policy.js";
import type { MemoryKind } from "../kinds.js";
import {
  isPromptInjection,
  MEMORY_SAFETY_POLICY_VERSION,
  prepareExternalContent,
} from "../memory-safety.js";
import { OFFLINE_EXTRACTION_TIMEOUT_MESSAGE } from "../offline-extraction.js";
import type { MentalModelDefinition, MentalModelSourceRow } from "./types.js";
import { MENTAL_MODEL_BUDGETS } from "./types.js";

/** One bounded source the runner is allowed to see. */
export interface MentalModelSynthesisSource {
  content: string;
  id: string;
  kind: MemoryKind;
}

export interface MentalModelSynthesisRunnerInput {
  maxInputChars: number;
  question: string;
  signal?: AbortSignal;
  sources: readonly MentalModelSynthesisSource[];
}

/**
 * Provider-neutral runner. May be absent (feature unavailable) and may throw
 * or hang — the boundary converts both into diagnostics, mirroring the
 * offline-extraction contract.
 */
export type MentalModelSynthesisRunner = (
  input: MentalModelSynthesisRunnerInput,
) => Promise<unknown>;

export type MentalModelSynthesisStatus =
  | "aborted"
  | "completed"
  | "disabled"
  | "failed"
  | "invalid-output"
  | "refused"
  | "runner-unavailable"
  | "source-empty"
  | "timed-out"
  | "unsafe-output";

export interface MentalModelSynthesisDiagnostics {
  definitionId: string;
  inputChars: number;
  outputChars: number;
  sourceCount: number;
  status: MentalModelSynthesisStatus;
  timeoutMs?: number;
}

export type MentalModelSynthesisResult =
  | {
      diagnostics: MentalModelSynthesisDiagnostics;
      /** The validated output; persisted only by the caller. */
      output: MentalModelSynthesisOutput;
      status: "completed";
    }
  | {
      diagnostics: MentalModelSynthesisDiagnostics;
      status: Exclude<MentalModelSynthesisStatus, "completed">;
    };

/** The only output shape the boundary accepts. */
export interface MentalModelSynthesisOutput {
  content: string;
  sourceIds: string[];
}

/**
 * Validate the closed output shape (task 3.3).
 *
 * Rejections:
 * - not a record, or any unknown field — the shape is closed;
 * - empty, non-string, or over-budget content;
 * - source IDs that are not a non-empty subset of the submitted set, or exceed
 *   the bounded ID budget;
 * - content that trips the persistability policy (prompt injection and
 *   credential patterns are classified by the shared content policy).
 */
export function validateMentalModelOutput(
  value: unknown,
  submittedIds: readonly string[],
  maxOutputChars: number,
):
  | {
      ok: false;
      reason: "invalid-output" | "unsafe-output";
    }
  | {
      ok: true;
      output: MentalModelSynthesisOutput;
    } {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {
      ok: false,
      reason: "invalid-output",
    };
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !("content" in record) || !("sourceIds" in record))
    return {
      ok: false,
      reason: "invalid-output",
    };

  const content = typeof record.content === "string" ? record.content.trim() : "";
  if (content.length === 0 || content.length > maxOutputChars)
    return {
      ok: false,
      reason: "invalid-output",
    };
  // Both halves of the shared safety boundary: high-confidence injection and
  // the persistability policy (credentials, raw transcripts, speculation).
  if (
    isPromptInjection(content) ||
    !isPersistableContent({
      content,
    })
  )
    return {
      ok: false,
      reason: "unsafe-output",
    };

  const rawIds = record.sourceIds;
  if (!Array.isArray(rawIds) || rawIds.length > MENTAL_MODEL_BUDGETS.maxSourceIds)
    return {
      ok: false,
      reason: "invalid-output",
    };
  const submitted = new Set(submittedIds);
  const sourceIds: string[] = [];
  for (const entry of rawIds) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 128)
      return {
        ok: false,
        reason: "invalid-output",
      };
    if (!submitted.has(entry))
      return {
        ok: false,
        reason: "invalid-output",
      };
    if (!sourceIds.includes(entry)) sourceIds.push(entry);
  }
  return {
    ok: true,
    output: {
      content,
      sourceIds,
    },
  };
}

interface RunMentalModelSynthesisOptions {
  definition: MentalModelDefinition;
  enabled: boolean;
  maxInputChars: number;
  maxOutputChars: number;
  runner?: MentalModelSynthesisRunner;
  signal?: AbortSignal;
  sources: readonly MentalModelSourceRow[];
  timeoutMs: number;
}

function diagnosticsFor(
  options: RunMentalModelSynthesisOptions,
  status: MentalModelSynthesisStatus,
  outputChars = 0,
  inputChars = 0,
  timeoutMs = 0,
): MentalModelSynthesisDiagnostics {
  return {
    definitionId: options.definition.id,
    inputChars,
    outputChars,
    sourceCount: options.sources.length,
    status,
    ...(timeoutMs > 0
      ? {
          timeoutMs,
        }
      : {}),
  };
}

/**
 * Run the synthesis boundary. Never throws: every outcome, including a
 * provider hang or abort, is a bounded diagnostic result.
 */
export async function runMentalModelSynthesis(
  options: RunMentalModelSynthesisOptions,
): Promise<MentalModelSynthesisResult> {
  const signal = options.signal;
  if (!options.enabled)
    return {
      diagnostics: diagnosticsFor(options, "disabled"),
      status: "disabled",
    };
  if (options.sources.length === 0)
    return {
      diagnostics: diagnosticsFor(options, "source-empty"),
      status: "source-empty",
    };
  if (signal?.aborted === true)
    return {
      diagnostics: diagnosticsFor(options, "aborted"),
      status: "aborted",
    };

  // Assemble the bounded payload: sources are dropped from the end until the
  // payload fits `maxInputChars`, so an oversized set degrades deterministically
  // instead of failing the whole run.
  const inputChars = options.maxInputChars;
  const submitted: MentalModelSynthesisSource[] = [];
  let budget = inputChars;
  budget -= JSON.stringify({
    question: options.definition.question,
  }).length;
  if (budget <= 0)
    return {
      diagnostics: diagnosticsFor(options, "source-empty"),
      status: "source-empty",
    };
  for (const source of options.sources) {
    const entry = {
      content: source.content,
      id: source.id,
      kind: source.kind,
    };
    const size = JSON.stringify(entry).length;
    if (size > budget) break;
    submitted.push(entry);
    budget -= size;
  }
  if (submitted.length === 0)
    return {
      diagnostics: diagnosticsFor(options, "source-empty"),
      status: "source-empty",
    };

  // Per-entry external-content screening: an unterminated private key refuses
  // the whole call (bounded reason, policy version, nothing else); a redacted
  // entry is forwarded redacted so the provider never sees the raw credential.
  const safeSources: MentalModelSynthesisSource[] = [];
  for (const entry of submitted) {
    const serialized = JSON.stringify(entry);
    const screened = prepareExternalContent(serialized);
    if (screened.status === "refused")
      return {
        diagnostics: diagnosticsFor(options, "refused", 0, serialized.length),
        status: "refused",
      };
    try {
      safeSources.push(JSON.parse(screened.content) as MentalModelSynthesisSource);
    } catch {
      // A redaction that broke the JSON is as unsafe as a refusal.
      return {
        diagnostics: diagnosticsFor(options, "refused", 0, serialized.length),
        status: "refused",
      };
    }
  }
  const payload = JSON.stringify({
    question: options.definition.question,
    sources: safeSources,
  });

  if (!options.runner)
    return {
      diagnostics: diagnosticsFor(options, "runner-unavailable", 0, payload.length),
      status: "runner-unavailable",
    };

  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error(OFFLINE_EXTRACTION_TIMEOUT_MESSAGE)),
      options.timeoutMs,
    );
  });

  try {
    const raw = await Promise.race([
      options.runner({
        maxInputChars: options.maxInputChars,
        question: options.definition.question,
        ...(signal
          ? {
              signal,
            }
          : {}),
        sources: safeSources,
      }),
      timeout,
    ]);
    if (typeof raw === "object" && raw !== null) {
      const record = raw as Record<string, unknown>;
      if (record.unavailable === "no-model")
        return {
          diagnostics: diagnosticsFor(options, "runner-unavailable", 0, payload.length),
          status: "runner-unavailable",
        };
      if (record.invalidOutput === true)
        return {
          diagnostics: diagnosticsFor(options, "invalid-output", 0, payload.length),
          status: "invalid-output",
        };
    }
    const validated = validateMentalModelOutput(
      raw,
      submitted.map((source) => source.id),
      options.maxOutputChars,
    );
    if (!validated.ok)
      return {
        diagnostics: diagnosticsFor(options, validated.reason, 0, payload.length),
        status: validated.reason,
      };
    return {
      diagnostics: diagnosticsFor(
        options,
        "completed",
        validated.output.content.length,
        payload.length,
      ),
      output: validated.output,
      status: "completed",
    };
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === OFFLINE_EXTRACTION_TIMEOUT_MESSAGE;
    let status: MentalModelSynthesisStatus = "failed";
    if (timedOut) status = "timed-out";
    else if (
      (
        error as {
          name?: string;
        }
      )?.name === "AbortError"
    )
      status = "aborted";
    return {
      diagnostics: diagnosticsFor(
        options,
        status,
        0,
        payload.length,
        options.timeoutMs,
      ),
      status,
    };
  }
}

export { MEMORY_SAFETY_POLICY_VERSION };
