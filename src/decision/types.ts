/**
 * Provider-neutral decision primitives (change add-typesafe-decision-hooks,
 * task 1.2).
 *
 * A decision runner answers exactly three closed question primitives
 * (Choice / Score / Noul). It never generates text, so nothing here accepts a
 * free-form answer: every answer is a bounded option id, a permutation of the
 * options the caller submitted, or `yes`/`no`.
 */

/** The three closed System One question primitives. */
export type DecisionPrimitive = "choice" | "score" | "noul";

/** Closed answer vocabulary for a `noul` question. */
export const NOUL_ANSWERS = [
  "no",
  "yes",
] as const;

/**
 * One question. `options` is the closed answer space and doubles as the
 * budget: option ids never carry free text, only bounded identifiers.
 */
export interface DecisionQuestion {
  id: string;
  options: string[];
  primitive: DecisionPrimitive;
  prompt: string;
}

export interface DecisionRequest {
  questions: readonly DecisionQuestion[];
  /** Bounded shared state, screened before it leaves the process. */
  state: string;
}

export interface DecisionRunnerInput extends DecisionRequest {
  maxInputChars: number;
  signal?: AbortSignal;
}

/**
 * Provider-neutral runner. May be absent (feature unavailable) and may throw
 * or hang — the boundary converts both into bounded diagnostics.
 */
export type DecisionRunner = (input: DecisionRunnerInput) => Promise<unknown>;

/** One normalized, validated answer. */
export interface DecisionAnswer {
  /** Calibrated probability in [0, 1] that this answer is correct. */
  confidence: number;
  questionId: string;
  /**
   * `choice`/`noul`: one option id or `yes`/`no`.
   * `score`: a best-first permutation of the submitted options.
   */
  value: string | string[];
}

/** The only output shape the boundary accepts. */
export interface DecisionOutput {
  answers: DecisionAnswer[];
}

/** Every bounded way a decision call can end. */
export type DecisionStatus =
  | "aborted"
  | "completed"
  | "disabled"
  | "failed"
  | "invalid-output"
  | "refused"
  | "runner-unavailable"
  | "timed-out"
  | "unsafe-output";

/** Bounded budgets for one call (task 1.4). */
export const DECISION_BUDGETS = {
  maxInputChars: 8_000,
  maxOptionsPerQuestion: 64,
  maxOutputChars: 4_000,
  maxQuestions: 8,
  /** State/answer text longer than this is truncated, never forwarded whole. */
  maxStateChars: 6_000,
  timeoutMs: 5_000,
} as const;
