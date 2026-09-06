import { randomUUID } from "node:crypto";

import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { L0Event } from "./l0/types.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";

export type T1LifecycleStatus = "committed" | "failed" | "unresolved";

export interface T1Lifecycle {
  bank?: string;
  kind?: string;
  operationId: string;
  scope?: string;
  status: T1LifecycleStatus;
}

export interface T1WriteResult {
  memoryId?: string;
  operationId: string;
  reason?: string;
  status: "failed" | "stored" | "unresolved";
}

export interface T1LifecyclePayload extends Record<string, unknown> {
  bank: string;
  kind: string;
  operationId: string;
  scope: string;
}

function boundedReason(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "unknown-error";
}

function lifecycleFor(event: L0Event): T1Lifecycle | null {
  const operationId = event.payload.operationId;
  if (typeof operationId !== "string" || !operationId) return null;
  if (event.type === "routing_decision" || event.type === "memory_delete_requested") {
    return {
      bank: typeof event.payload.bank === "string" ? event.payload.bank : undefined,
      kind: typeof event.payload.kind === "string" ? event.payload.kind : undefined,
      operationId,
      scope: typeof event.payload.scope === "string" ? event.payload.scope : undefined,
      status: "unresolved",
    };
  }
  if (event.type === "t1_memory_write" || event.type === "memory_deleted") {
    return {
      operationId,
      status: "committed",
    };
  }
  if (event.type === "memory_failed")
    return {
      operationId,
      status: "failed",
    };
  return null;
}

/** Fold append-only L0 lifecycle events without querying a T1 backend. */
export function foldT1Lifecycles(events: readonly L0Event[]): T1Lifecycle[] {
  const lifecycles = new Map<string, T1Lifecycle>();
  for (const event of events) {
    const lifecycle = lifecycleFor(event);
    if (lifecycle) {
      const existing = lifecycles.get(lifecycle.operationId);
      lifecycles.set(lifecycle.operationId, {
        ...existing,
        ...lifecycle,
      });
      continue;
    }
    if (event.type === "t1_memory_write" || event.type === "memory_deleted") {
      lifecycles.set(`legacy:${event.position}`, {
        operationId: `legacy:${event.position}`,
        status: "committed",
      });
    }
  }
  return [
    ...lifecycles.values(),
  ];
}

/**
 * Coordinate the L0-first write lifecycle. A missing terminal event is
 * explicitly unresolved because T1 and L0 do not share a transaction.
 */
export async function runT1Write({
  adapter,
  l0,
  operation,
  operationId = randomUUID(),
  requestPayload = {},
}: {
  adapter: MnemosyneAdapter;
  l0: L0Coordinator;
  operation: T1MemoryOperation;
  operationId?: string;
  requestPayload?: Record<string, unknown>;
}): Promise<T1WriteResult> {
  const request: T1LifecyclePayload = {
    ...requestPayload,
    bank: operation.targetBank,
    kind: operation.kind,
    operationId,
    scope: operation.scope,
  };
  l0.record("routing_decision", request);
  try {
    const stored = await adapter.store(operation);
    try {
      l0.record("t1_memory_write", {
        ...request,
        confidence: operation.confidence,
        content: operation.content,
        evidenceType: operation.source.evidenceType,
        ...(stored.id
          ? {
              memoryId: stored.id,
            }
          : {}),
      });
    } catch (error) {
      return {
        operationId,
        reason: boundedReason(error),
        status: "unresolved",
      };
    }
    return {
      ...(stored.id
        ? {
            memoryId: stored.id,
          }
        : {}),
      operationId,
      status: "stored",
    };
  } catch (error) {
    const reason = boundedReason(error);
    try {
      l0.record("memory_failed", {
        ...request,
        outcome: request.outcome ?? "failed",
        phase: request.phase ?? "backend",
        reason,
      });
      return {
        operationId,
        reason,
        status: "failed",
      };
    } catch (failureError) {
      return {
        operationId,
        reason: boundedReason(failureError),
        status: "unresolved",
      };
    }
  }
}
