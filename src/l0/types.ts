/**
 * L0 event types and schemas.
 *
 * L0 is an append-only, implementation-independent session trace (see
 * docs/l0-contract.md). Events are never mutated or deleted once written.
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
  "t1_memory_write",
  "candidate_created",
  "candidate_confirmed",
  "candidate_rejected",
  "routing_rejected",
  "memory_failed",
  "routing_decision",
] as const;

export type L0EventType = (typeof L0_EVENT_TYPES)[number];

/** Payload for a memory injection trace event; content stays in the T1 bank. */
export interface L0MemoryInjectedPayload {
  injectedMemoryIds: readonly string[];
}

/** Payload for a memory deletion trace event; deleted content stays out of L0. */
export interface L0MemoryDeletedPayload {
  memoryId: string;
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
