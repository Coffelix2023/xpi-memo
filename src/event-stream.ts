/**
 * Body-free memory event stream (evolve-memory-runtime tasks 1.1–1.3).
 *
 * The audit log is the durable provenance record; this module is a
 * presentation-only projection of it. Events carry a finite kind and bounded
 * metadata — never memory bodies, queries, tool output, or credentials.
 */

import type { AuditAction, AuditEntry } from "./audit.js";

/** Finite lifecycle event kinds (design decision 2, task 1.3). */
export const MEMORY_EVENT_KINDS = [
  "capture",
  "rejected",
  "candidate-created",
  "confirmed",
  "stored",
  "recalled",
  "injected",
  "deleted",
  "degraded",
] as const;

export type MemoryEventKind = (typeof MEMORY_EVENT_KINDS)[number];

/**
 * Kinds that close an operation. Every operation that emits a start event
 * (capture) must reach one of these; capture itself is the only start kind.
 */
export const TERMINAL_EVENT_KINDS: readonly MemoryEventKind[] =
  MEMORY_EVENT_KINDS.filter((kind) => kind !== "capture");

export interface MemoryEvent {
  /** Distinguishes backend-not-run from backend-queried-no-hits (task 2.2). */
  backend?: string;
  bank?: string;
  injectedCount?: number;
  kind: MemoryEventKind;
  /** Bounded memory kind code (e.g. global_preference), never a label body. */
  memoryKind?: string;
  /** Operation correlation; bounded short id, full ids stay in diagnostics. */
  operationId?: string;
  reasonCode?: string;
  resultCount?: number;
  scope?: string;
  /** Source event reference: audit action + timestamp. */
  sourceRef: string;
  status?: string;
  timestamp: string;
}

const MAX_TEXT = 80;
const MAX_ID = 64;
const FORBIDDEN_KEYS = new Set([
  "content",
  "body",
  "query",
  "text",
  "proposal",
  "secret",
  "token",
  "key",
  "password",
  "credential",
  "reasoning",
]);

function bounded(value: unknown, limit = MAX_TEXT): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const singleLine = value.replace(/[\r\n\t]+/g, " ").trim();
  return singleLine ? singleLine.slice(0, limit) : undefined;
}

function boundedCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return undefined;
  return Math.min(9_999, Math.trunc(value));
}

/** Map an audit action to its lifecycle event kind. */
export function eventKindForAction(action: AuditAction): MemoryEventKind | null {
  switch (action) {
    case "extraction":
      return "capture";
    case "rejection":
      return "rejected";
    case "candidate":
      return "candidate-created";
    case "confirmation":
      return "confirmed";
    case "write":
      return "stored";
    case "recall":
      return "recalled";
    case "fallback":
      return "degraded";
    case "deletion":
      return "deleted";
    default:
      return null;
  }
}

/**
 * Project one audit entry onto a bounded, body-free event. Returns null for
 * actions outside the memory lifecycle (sleep-authorization etc.).
 */
export function toMemoryEvent(entry: AuditEntry): MemoryEvent | null {
  const kind = eventKindForAction(entry.action);
  if (!kind) return null;
  const metadata = entry.metadata;
  // A recall with injections is an injection event; plain recall stays recall.
  const eventKind: MemoryEventKind =
    kind === "recalled" && boundedCount(metadata.injectedCount) ? "injected" : kind;
  return {
    kind: eventKind,
    ...(bounded(metadata.backend, 32)
      ? {
          backend: bounded(metadata.backend, 32),
        }
      : {}),
    ...(boundedCount(metadata.injectedCount)
      ? {
          injectedCount: boundedCount(metadata.injectedCount),
        }
      : {}),
    ...(bounded(metadata.kind, 40)
      ? {
          memoryKind: bounded(metadata.kind, 40),
        }
      : {}),
    ...(bounded(metadata.operationId, MAX_ID)
      ? {
          operationId: bounded(metadata.operationId, MAX_ID),
        }
      : {}),
    ...(bounded(metadata.reason)
      ? {
          reasonCode: bounded(metadata.reason),
        }
      : {}),
    ...(boundedCount(metadata.resultCount)
      ? {
          resultCount: boundedCount(metadata.resultCount),
        }
      : {}),
    ...(bounded(metadata.scope, 16)
      ? {
          scope: bounded(metadata.scope, 16),
        }
      : {}),
    ...(bounded(metadata.status, 32)
      ? {
          status: bounded(metadata.status, 32),
        }
      : {}),
    sourceRef: `${entry.action}@${entry.timestamp}`,
    timestamp: entry.timestamp,
  };
}

/**
 * Serialize an event after asserting body-free-ness. Throws on forbidden
 * fields so a contract violation cannot silently leak a body (task 1.1).
 */
export function serializeMemoryEvent(event: MemoryEvent): string {
  for (const key of Object.keys(event)) {
    if (FORBIDDEN_KEYS.has(key))
      throw new Error(`memory event must not carry field: ${key}`);
  }
  return JSON.stringify(event);
}

/** Short display identifier for status lines: first 8 chars or a stable stub. */
export function shortOperationId(event: MemoryEvent): string {
  const id = event.operationId;
  if (!id) return "—";
  return `#${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "op"}`;
}

// ---------------------------------------------------------------------------
// In-process observer bus (task 1.2). Presentation path only: subscriber
// failures never propagate, the buffer is bounded, and nothing here is on the
// T1 write or recall commit path.
// ---------------------------------------------------------------------------

export type MemoryEventListener = (event: MemoryEvent) => void;

export interface MemoryEventBus {
  emit(event: MemoryEvent): void;
  /** Recently emitted events, oldest first, bounded ring. */
  recent(): MemoryEvent[];
  subscribe(listener: MemoryEventListener): () => void;
}

export function createMemoryEventBus(maxRecent = 20): MemoryEventBus {
  const listeners = new Set<MemoryEventListener>();
  const buffer: MemoryEvent[] = [];
  const limit = Number.isInteger(maxRecent) && maxRecent > 0 ? maxRecent : 20;
  return {
    emit(event) {
      buffer.push(event);
      if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Observers are presentation-only; they must never break the
          // operation that produced the event (task 1.2 contract).
        }
      }
    },
    recent() {
      return [
        ...buffer,
      ];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Per-process bus shared by audit observation and footer/status consumers. */
const defaultBus = createMemoryEventBus();

export function defaultMemoryEventBus(): MemoryEventBus {
  return defaultBus;
}
