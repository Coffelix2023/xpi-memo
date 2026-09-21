/**
 * Mental-model projection domain types (change add-mental-model-projections,
 * tasks 1.1/2.x/3.x).
 *
 * A projection is **replaceable derived state**. L0 stays authoritative for
 * event history and provenance, confirmed T1 rows stay authoritative for
 * current governed long-term memory, and a projection is a disposable cache of
 * a standing answer computed from those rows. Nothing in this module creates a
 * T1 memory: `mental_model` is deliberately absent from `MEMORY_KINDS`, so a
 * generated answer can never enter routing, admission, recall, or export as if
 * it were a governed fact.
 */

import type { MemoryKind, MemoryScope } from "../kinds.js";

/**
 * The six states a projection can be reported in (design Decision 4).
 *
 * `pending` is transient: it exists only while a refresh is executing in the
 * current process and is never persisted.
 */
export const MENTAL_MODEL_STATES = [
  "absent",
  "fresh",
  "stale",
  "pending",
  "failed",
  "disabled",
] as const;

export type MentalModelState = (typeof MENTAL_MODEL_STATES)[number];

/** Semantic scope a definition projects. A projection is never session-scoped. */
export const MENTAL_MODEL_SCOPES = [
  "global",
  "project",
] as const;

export type MentalModelScope = (typeof MENTAL_MODEL_SCOPES)[number];

/**
 * Bounded failure categories. A category is a closed code, never a message:
 * diagnostics must stay free of memory bodies, prompts, and model output.
 */
export const MENTAL_MODEL_FAILURE_CATEGORIES = [
  "aborted",
  "budget-exhausted",
  "failed",
  "invalid-output",
  "persist-failed",
  "refused",
  "runner-unavailable",
  "source-read-failed",
  "timed-out",
  "unsafe-output",
] as const;

export type MentalModelFailureCategory =
  (typeof MENTAL_MODEL_FAILURE_CATEGORIES)[number];

/**
 * Bounded body-free refresh outcomes (design Decision 8). Every one of these is
 * distinguishable in status output, so "no model call happened" is never read
 * as "ran and found nothing".
 */
export const MENTAL_MODEL_REFRESH_OUTCOMES = [
  "aborted",
  "already-attempted",
  "budget-exhausted",
  "definition-disabled",
  "failed",
  "invalid-output",
  "no-refresh-needed",
  "persist-failed",
  "refreshed",
  "runner-unavailable",
  "safety-refused",
  "source-empty",
  "source-read-failed",
  "synthesis-disabled",
  "timed-out",
  "unsafe-output",
] as const;

export type MentalModelRefreshOutcome = (typeof MENTAL_MODEL_REFRESH_OUTCOMES)[number];

/**
 * A code-owned standing question. Definitions are versioned and frozen in code:
 * there is no runtime registration API, so a conversation can never invent a
 * new durable attention target (spec: questions MUST be explicit and bounded).
 */
export interface MentalModelDefinition {
  /** Stable identifier; also the projection file name. */
  id: string;
  /** Permitted T1 source kinds, exactly (never a superset). */
  kinds: readonly MemoryKind[];
  /** The stable question this model answers. */
  question: string;
  /** Semantic scope the definition reads from and writes to. */
  scope: MentalModelScope;
  /**
   * Bumping this invalidates every persisted projection of this definition,
   * because the digest mixes it in.
   */
  version: number;
}

/**
 * Who a projection belongs to. `key` is derived only from existing routing
 * identity: `global`, or the canonical project bank name. A definition whose
 * scope has no resolvable owner is skipped rather than falling back to the
 * global bank (spec: project identity is unavailable).
 */
export interface MentalModelOwner {
  key: string;
  scope: MentalModelScope;
}

/** One selected governed source row, already filtered, sorted, and bounded. */
export interface MentalModelSourceRow {
  bank: string;
  content: string;
  id: string;
  kind: MemoryKind;
  scope: MemoryScope;
  timestamp?: string;
}

/**
 * The bounded, deterministic result of reading a definition's eligible sources.
 * `digest` is the freshness authority; `boundary` is only a provenance pointer.
 */
export interface MentalModelSourceEvaluation {
  boundary: number | null;
  digest: string;
  rows: MentalModelSourceRow[];
}

/**
 * The one persisted record per `(definitionId, ownerKey)`.
 *
 * `content` and `sourceDigest` are the **last successful** payload: a failed
 * refresh rewrites this record with new failure metadata but keeps both intact,
 * so a failure can never make stale content look fresh.
 *
 * `sourceDigest === ""` means no successful payload has ever been committed.
 */
export interface MentalModelProjection {
  content: string;
  definitionId: string;
  definitionVersion: number;
  generatedAt: string;
  /** Diagnosis-only metadata; never a prompt or a raw model reply. */
  generator: {
    model?: string;
    policyVersion?: string;
    provider?: string;
  };
  lastAttempt: {
    at: string;
    failure?: MentalModelFailureCategory;
    outcome: "refreshed" | "failed";
  };
  ownerKey: string;
  refreshedAt: string | null;
  scope: MentalModelScope;
  sourceBoundary: number | null;
  sourceDigest: string;
  sourceIds: string[];
  version: 1;
}

/** Deterministic freshness verdict for one definition and owner. */
export interface MentalModelFreshness {
  definitionId: string;
  /** First 12 hex chars of the current source digest; null when unreadable. */
  digestPrefix: string | null;
  ownerKey: string;
  persistedAt: string | null;
  reason?: MentalModelFailureCategory | "no-successful-projection";
  scope: MentalModelScope;
  sourceCount: number;
  state: MentalModelState;
}

/** Bounded, body-free result of one refresh attempt. */
export interface MentalModelRefreshResult {
  definitionId: string;
  digestPrefix: string | null;
  durationMs: number;
  outcome: MentalModelRefreshOutcome;
  outputChars: number;
  ownerKey: string;
  scope: MentalModelScope;
  sourceBoundary: number | null;
  sourceCount: number;
  state: MentalModelState;
}

/**
 * Fixed budgets (design Decision 3). Deliberately small constants rather than a
 * tuning surface: a projection is a bounded cache, not a second bank.
 */
export const MENTAL_MODEL_BUDGETS = {
  /** Generated content cap, independent of the source cap. */
  maxGeneratedChars: 4_000,
  /** Selected source characters per projection. */
  maxSourceChars: 12_000,
  /** Bounded source references kept on a projection. */
  maxSourceIds: 32,
  /** Selected source rows per projection. */
  maxSourceRows: 32,
} as const;

/** Fixed per-attempt timeout; mirrors the offline-extraction bound. */
export const DEFAULT_MENTAL_MODEL_TIMEOUT_MS = 15_000;

/** First 12 hex chars of a digest, or null. */
export function digestPrefix(digest: string | null): string | null {
  return digest && digest.length > 0 ? digest.slice(0, 12) : null;
}

/** Guard used by status/diagnostics when reading an outcome code from a record. */
export function isMentalModelRefreshOutcome(
  value: string,
): value is MentalModelRefreshOutcome {
  return (MENTAL_MODEL_REFRESH_OUTCOMES as readonly string[]).includes(value);
}

export function isMentalModelState(value: string): value is MentalModelState {
  return (MENTAL_MODEL_STATES as readonly string[]).includes(value);
}

export function isMentalModelFailureCategory(
  value: string,
): value is MentalModelFailureCategory {
  return (MENTAL_MODEL_FAILURE_CATEGORIES as readonly string[]).includes(value);
}
