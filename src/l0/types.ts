/**
 * L0 event types and schemas.
 *
 * L0 is an append-only, implementation-independent session trace (see
 * docs/archive/2026-09/contracts/l0-contract.md). Events are never mutated or deleted once written.
 */

export const L0_EVENT_TYPES = [
  "user_message",
  "assistant_message",
  "tool_call",
  "tool_result",
  "file_change",
  "compaction",
  "memory_injected",
  "memory_deleted",
  "memory_delete_requested",
  "t1_memory_write",
  "candidate_auto_verified",
  "candidate_auto_admitted",
  "candidate_held",
  "candidate_refused",
  "candidate_created",
  "candidate_confirmed",
  "tool_verification_failed",
  "tool_verification_shadow",
  "candidate_rejected",
  "routing_rejected",
  "memory_failed",
  "routing_decision",
  // Mental-model lifecycle (change add-mental-model-projections, task 5.1):
  // freshness/refresh/skip/refusal/failure outcomes and delivery outcomes.
  // Body-free like every other event: codes, counts, and ids only.
  "mental_model_refresh",
  "mental_model_injected",
] as const;

export type L0EventType = (typeof L0_EVENT_TYPES)[number];

/** Payload for a memory injection trace event; content stays in the T1 bank. */
export interface L0MemoryInjectedPayload {
  blockedCount?: number;
  /** Optional bounded diagnostics added after the initial event schema. */
  injectedCount?: number;
  injectedMemoryIds: readonly string[];
  lifecycleStage?: "automatic-recall" | "explicit-recall" | "history-query";
  omissionReasons?: readonly string[];
  omittedCount?: number;
  policyVersion?: string;
  safetyReasons?: readonly string[];
}

/** Payload for a confirmed memory deletion; deleted content stays out of L0. */
export interface L0MemoryDeletedPayload {
  memoryId: string;
  operationId?: string;
}

/** Bounded request correlation shared by governed write and delete events. */
export interface L0MemoryLifecyclePayload {
  bank?: string;
  kind?: string;
  operationId: string;
  scope?: string;
}

/**
 * Bounded payload for one mental-model refresh attempt (task 5.1).
 *
 * Every field is a code, a count, or an identifier: the projection body, the
 * source bodies, the prompt, and the raw model output never reach L0.
 */
export interface L0MentalModelRefreshPayload {
  definitionId: string;
  /** First 12 hex chars of the current source digest; null when unreadable. */
  digestPrefix: string | null;
  durationMs: number;
  /** Bounded outcome code, e.g. `refreshed` / `no-refresh-needed` / `safety-refused`. */
  outcome: string;
  outputChars: number;
  ownerKey: string;
  scope: "global" | "project";
  sourceBoundary: number | null;
  sourceCount: number;
  /** Coarse grouping of `outcome`: refreshed / skipped / failed. */
  status: "failed" | "refreshed" | "skipped";
  trigger: "session_before_compact" | "session_shutdown";
}

/**
 * Bounded payload for one automatic-delivery decision (task 5.1).
 *
 * `definitionIds`/`ownerKeys` are capped by the delivery item budget, and
 * `omittedReasons` is a bounded list of closed reason codes.
 */
export interface L0MentalModelInjectedPayload {
  chars: number;
  definitionIds: readonly string[];
  injectedCount: number;
  lifecycleStage: "automatic-recall";
  omittedCount: number;
  ownerKeys: readonly string[];
  policyVersion: string;
  /** Closed omission/refusal reason codes; never free text. */
  reasons: readonly string[];
  /** Discriminator that separates a delivery record from a refresh record. */
  status: "injected" | "omitted";
}
/** Schema version for forward-compatible evolution. */
export const L0_SCHEMA_VERSION = 1;

export interface L0Event {
  /** type-specific data */
  payload: Record<string, unknown>;
  /** monotonically increasing within the session, starting at 1 */
  position: number;
  /** ISO 8601 timestamp */
  timestamp: string;
  type: L0EventType;
  /** schema version written on disk */
  version: number;
}

export function isL0EventType(value: unknown): value is L0EventType {
  return (
    typeof value === "string" && (L0_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function createL0Event(
  type: L0EventType,
  position: number,
  payload: Record<string, unknown>,
  timestamp = new Date().toISOString(),
): L0Event {
  return {
    payload,
    position,
    timestamp,
    type,
    version: L0_SCHEMA_VERSION,
  };
}
