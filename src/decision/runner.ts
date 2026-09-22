/**
 * Gated, bounded decision boundary (change add-typesafe-decision-hooks,
 * tasks 1.3/1.4).
 *
 * Deliberately provider-neutral, mirroring the mental-model synthesis
 * boundary: an injected runner may be the default bare-HTTP client or a host
 * replacement, and the boundary never touches T1 governance because an answer
 * is not a memory proposal. Everything that can go wrong is a bounded
 * diagnostic result instead of a throw, so a slow, hanging, or unavailable
 * provider can never block a lifecycle point.
 *
 * Two safety gates run here, both reused from the existing boundary:
 * - the outbound payload is screened by `prepareExternalContent` before any
 *   external call (credential redaction, refusal when redaction cannot be
 *   confirmed);
 * - the inbound answer is validated into a closed shape and screened by
 *   `isPromptInjection` / `isPersistableContent` before any consumer sees it.
 */

import { isPersistableContent } from "../content-policy.js";
import {
  isPromptInjection,
  MEMORY_SAFETY_POLICY_VERSION,
  prepareExternalContent,
} from "../memory-safety.js";
import { OFFLINE_EXTRACTION_TIMEOUT_MESSAGE } from "../offline-extraction.js";
import {
  DECISION_BUDGETS,
  type DecisionOutput,
  type DecisionQuestion,
  type DecisionRunner,
  type DecisionStatus,
  NOUL_ANSWERS,
} from "./types.js";

export interface DecisionDiagnostics {
  durationMs: number;
  inputChars: number;
  outputChars: number;
  policyVersion: string;
  status: DecisionStatus;
  timeoutMs?: number;
}

export type DecisionResult =
  | {
      diagnostics: DecisionDiagnostics;
      output: DecisionOutput;
      status: "completed";
    }
  | {
      diagnostics: DecisionDiagnostics;
      status: Exclude<DecisionStatus, "completed">;
    };

export interface RunDecisionOptions {
  enabled: boolean;
  questions: readonly DecisionQuestion[];
  runner?: DecisionRunner;
  signal?: AbortSignal;
  state: string;
  timeoutMs?: number;
}

/**
 * Validate the closed output shape.
 *
 * Rejections: not a record, unknown keys, an answer for an unknown question,
 * a duplicated answer, an option id outside the submitted set, a `score`
 * permutation that is not a permutation, a `noul` value outside `yes`/`no`,
 * and any answer whose text trips the shared content policy.
 */
export function validateDecisionOutput(
  value: unknown,
  questions: readonly DecisionQuestion[],
):
  | {
      ok: false;
      reason: "invalid-output" | "unsafe-output";
    }
  | {
      ok: true;
      output: DecisionOutput;
    } {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {
      ok: false,
      reason: "invalid-output",
    };
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || !("answers" in record))
    return {
      ok: false,
      reason: "invalid-output",
    };
  const rawAnswers = record.answers;
  if (!Array.isArray(rawAnswers) || rawAnswers.length !== questions.length)
    return {
      ok: false,
      reason: "invalid-output",
    };

  const byId = new Map(
    questions.map((question) => [
      question.id,
      question,
    ]),
  );
  const answers: DecisionOutput["answers"] = [];
  const seen = new Set<string>();

  for (const raw of rawAnswers) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return {
        ok: false,
        reason: "invalid-output",
      };
    const answer = raw as Record<string, unknown>;
    const answerKeys = Object.keys(answer);
    if (
      answerKeys.length !== 3 ||
      !("confidence" in answer) ||
      !("questionId" in answer) ||
      !("value" in answer)
    )
      return {
        ok: false,
        reason: "invalid-output",
      };
    const questionId = answer.questionId;
    if (typeof questionId !== "string" || seen.has(questionId))
      return {
        ok: false,
        reason: "invalid-output",
      };
    const question = byId.get(questionId);
    if (!question)
      return {
        ok: false,
        reason: "invalid-output",
      };
    const confidence = answer.confidence;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    )
      return {
        ok: false,
        reason: "invalid-output",
      };

    let normalized: string | string[];
    const rawValue = answer.value;
    if (question.primitive === "score") {
      if (
        !Array.isArray(rawValue) ||
        rawValue.length !== question.options.length ||
        rawValue.some((entry) => typeof entry !== "string")
      )
        return {
          ok: false,
          reason: "invalid-output",
        };
      const order = rawValue as string[];
      const expected = new Set(question.options);
      if (new Set(order).size !== order.length || order.some((id) => !expected.has(id)))
        return {
          ok: false,
          reason: "invalid-output",
        };
      normalized = [
        ...order,
      ];
    } else if (question.primitive === "noul") {
      if (
        typeof rawValue !== "string" ||
        !(NOUL_ANSWERS as readonly string[]).includes(rawValue)
      )
        return {
          ok: false,
          reason: "invalid-output",
        };
      normalized = rawValue;
    } else {
      if (typeof rawValue !== "string" || !question.options.includes(rawValue))
        return {
          ok: false,
          reason: "invalid-output",
        };
      normalized = rawValue;
    }

    // Inbound re-screen: an answer is never trusted just because the shape is
    // closed. A model that ignored its instructions and echoed an injected
    // instruction or a credential must not reach any consumer.
    const text = Array.isArray(normalized) ? normalized.join(" ") : normalized;
    if (
      isPromptInjection(text) ||
      !isPersistableContent({
        content: text,
      })
    )
      return {
        ok: false,
        reason: "unsafe-output",
      };

    seen.add(questionId);
    answers.push({
      confidence,
      questionId,
      value: normalized,
    });
  }

  return {
    ok: true,
    output: {
      answers,
    },
  };
}

function diagnosticsFor(
  status: DecisionStatus,
  fields: {
    durationMs?: number;
    inputChars?: number;
    outputChars?: number;
    timeoutMs?: number;
  } = {},
): DecisionDiagnostics {
  return {
    durationMs: fields.durationMs ?? 0,
    inputChars: fields.inputChars ?? 0,
    outputChars: fields.outputChars ?? 0,
    policyVersion: MEMORY_SAFETY_POLICY_VERSION,
    status,
    ...(fields.timeoutMs
      ? {
          timeoutMs: fields.timeoutMs,
        }
      : {}),
  };
}

/** Bounded question set: extra questions are dropped, never truncated mid-shape. */
function boundedQuestions(questions: readonly DecisionQuestion[]): DecisionQuestion[] {
  return questions
    .filter(
      (question) =>
        question.options.length > 0 &&
        question.options.length <= DECISION_BUDGETS.maxOptionsPerQuestion,
    )
    .slice(0, DECISION_BUDGETS.maxQuestions);
}

/**
 * Run the decision boundary. Never throws: every outcome, including a provider
 * hang or abort, is a bounded diagnostic result.
 */
export async function runDecision(
  options: RunDecisionOptions,
): Promise<DecisionResult> {
  const timeoutMs = options.timeoutMs ?? DECISION_BUDGETS.timeoutMs;
  if (!options.enabled)
    return {
      diagnostics: diagnosticsFor("disabled"),
      status: "disabled",
    };
  if (options.signal?.aborted === true)
    return {
      diagnostics: diagnosticsFor("aborted"),
      status: "aborted",
    };

  const questions = boundedQuestions(options.questions);
  if (questions.length === 0)
    return {
      diagnostics: diagnosticsFor("invalid-output"),
      status: "invalid-output",
    };

  const state = options.state.slice(0, DECISION_BUDGETS.maxStateChars);
  // Screen each text field on its own raw value rather than the serialized
  // envelope: a redaction inside escaped JSON can break the envelope, and a
  // broken payload would have to be refused instead of sent redacted.
  // Option ids are opaque identifiers and are not screened — the inbound
  // re-screen still covers anything an answer echoes back.
  const screenedState = prepareExternalContent(state);
  if (screenedState.status === "refused")
    return {
      diagnostics: diagnosticsFor("refused", {
        inputChars: state.length,
      }),
      status: "refused",
    };
  const screenedQuestions: DecisionQuestion[] = [];
  for (const question of questions) {
    const screenedPrompt = prepareExternalContent(question.prompt);
    if (screenedPrompt.status === "refused")
      return {
        diagnostics: diagnosticsFor("refused", {
          inputChars: state.length,
        }),
        status: "refused",
      };
    screenedQuestions.push({
      ...question,
      prompt: screenedPrompt.content,
    });
  }
  // A redacted credential is forwarded redacted, so the provider never sees
  // the raw value; an unterminated private key refused the call above.
  const payload: {
    questions: DecisionQuestion[];
    state: string;
  } = {
    questions: screenedQuestions,
    state: screenedState.content,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > DECISION_BUDGETS.maxInputChars)
    return {
      diagnostics: diagnosticsFor("invalid-output", {
        inputChars: serialized.length,
      }),
      status: "invalid-output",
    };

  if (!options.runner)
    return {
      diagnostics: diagnosticsFor("runner-unavailable", {
        inputChars: serialized.length,
      }),
      status: "runner-unavailable",
    };

  const startedAt = Date.now();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, {
    once: true,
  });
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(OFFLINE_EXTRACTION_TIMEOUT_MESSAGE));
    }, timeoutMs);
  });

  try {
    const raw = await Promise.race([
      options.runner({
        maxInputChars: DECISION_BUDGETS.maxInputChars,
        questions: payload.questions,
        signal: controller.signal,
        state: payload.state,
      }),
      expired,
    ]);
    if (typeof raw === "object" && raw !== null) {
      const record = raw as Record<string, unknown>;
      if (typeof record.unavailable === "string")
        return {
          diagnostics: diagnosticsFor("runner-unavailable", {
            durationMs: Date.now() - startedAt,
            inputChars: serialized.length,
          }),
          status: "runner-unavailable",
        };
    }
    const validated = validateDecisionOutput(raw, payload.questions);
    if (!validated.ok)
      return {
        diagnostics: diagnosticsFor(validated.reason, {
          durationMs: Date.now() - startedAt,
          inputChars: serialized.length,
        }),
        status: validated.reason,
      };
    const outputChars = JSON.stringify(validated.output).length;
    if (outputChars > DECISION_BUDGETS.maxOutputChars)
      return {
        diagnostics: diagnosticsFor("invalid-output", {
          durationMs: Date.now() - startedAt,
          inputChars: serialized.length,
          outputChars,
        }),
        status: "invalid-output",
      };
    return {
      diagnostics: diagnosticsFor("completed", {
        durationMs: Date.now() - startedAt,
        inputChars: serialized.length,
        outputChars,
      }),
      output: validated.output,
      status: "completed",
    };
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === OFFLINE_EXTRACTION_TIMEOUT_MESSAGE;
    let status: DecisionStatus = "failed";
    if (timedOut) status = "timed-out";
    else if (
      (
        error as
          | {
              name?: string;
            }
          | undefined
      )?.name === "AbortError" ||
      controller.signal.aborted
    )
      status = "aborted";
    return {
      diagnostics: diagnosticsFor(status, {
        durationMs: Date.now() - startedAt,
        inputChars: serialized.length,
        timeoutMs,
      }),
      status: status as Exclude<DecisionStatus, "completed">,
    };
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
