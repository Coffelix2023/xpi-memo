import { randomUUID } from "node:crypto";
import type { AuditLog } from "./audit.js";
import {
  EXACT_ID_READ_UNAVAILABLE,
  type ExactIdReadCapability,
  isMemoryNotFoundError,
} from "./banks.js";
import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { GetMemoryByIdResult, MnemosyneAdapter } from "./operations.js";
import { writeMemoryRecovery } from "./recovery.js";

type DeleteRunner = (
  args: string[],
  options?: {
    bank?: string;
    dataDir?: string;
  },
) => Promise<string>;

export interface T1DeleteResult {
  bank?: string;
  /** Capability verdict that routed this request (diagnostics; no bodies). */
  capability?: ExactIdReadCapability;
  id: string;
  operationId: string;
  reason?: string;
  /** Whether a recovery snapshot was written before the destructive call. */
  recovery: "none" | "written";
  recoveryId?: string;
  status: "deleted" | "failed" | "unresolved";
}

export async function runT1Delete({
  adapter,
  audit,
  banks,
  dataDir,
  deleteMemory,
  l0,
  memoryId,
  operationId = randomUUID(),
}: {
  adapter: MnemosyneAdapter;
  audit: AuditLog;
  banks: readonly string[];
  dataDir: string;
  deleteMemory: DeleteRunner;
  l0: L0Coordinator;
  memoryId: string;
  operationId?: string;
}): Promise<T1DeleteResult> {
  const capability = await resolveExactIdReadCapability(adapter, dataDir);
  const request = {
    memoryId,
    operationId,
  };
  l0.record("memory_delete_requested", request);
  // Only a capability verdict may gate the recovery snapshot: without a
  // stable exact-ID read there is nothing to snapshot, and refusing to
  // delete is not an acceptable fallback (design D1/D3).
  const reader = capability.available ? adapter.readMemoryById : undefined;
  let lastReason = "memory-not-found";

  for (const bank of banks) {
    let recoveryId: string | undefined;
    if (reader) {
      let memory: GetMemoryByIdResult | null;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: bank probing must remain ordered.
        memory = await reader(memoryId, dataDir, bank);
      } catch (error) {
        lastReason = boundedReason(error);
        continue;
      }
      if (!memory) continue;

      try {
        recoveryId = writeMemoryRecovery(dataDir, memory).recoveryId;
      } catch (error) {
        const reason = boundedReason(error);
        const recorded = recordFailure(l0, audit, request, bank, reason, capability);
        return {
          bank,
          capability,
          id: memoryId,
          operationId,
          reason,
          recovery: "none",
          // Without the terminal memory_failed event L0 cannot express the
          // failure outcome, so the operation is unresolved, not failed.
          status: recorded ? "failed" : "unresolved",
        };
      }
    }

    try {
      // Recovery (when the capability allowed one) must succeed before the
      // destructive backend call.
      await deleteMemory(
        [
          "delete",
          memoryId,
        ],
        {
          bank: bank === "default" ? undefined : bank,
          dataDir,
        },
      );
    } catch (error) {
      // Without a reader, the backend's not-found result IS the "target does
      // not exist in this bank" verdict, so keep probing later banks.
      if (!reader && isMemoryNotFoundError(error)) {
        lastReason = "memory-not-found";
        continue;
      }
      const reason = boundedReason(error);
      const recorded = recordFailure(l0, audit, request, bank, reason, capability);
      return {
        bank,
        capability,
        id: memoryId,
        operationId,
        reason,
        recovery: recoveryId ? "written" : "none",
        ...(recoveryId
          ? {
              recoveryId,
            }
          : {}),
        // Without the terminal memory_failed event L0 cannot express the
        // failure outcome, so the operation is unresolved, not failed.
        status: recorded ? "failed" : "unresolved",
      };
    }

    try {
      l0.record("memory_deleted", {
        ...request,
        bank,
      });
    } catch (error) {
      return {
        bank,
        capability,
        id: memoryId,
        operationId,
        reason: boundedReason(error),
        recovery: recoveryId ? "written" : "none",
        ...(recoveryId
          ? {
              recoveryId,
            }
          : {}),
        status: "unresolved",
      };
    }
    audit.record("deletion", {
      bank,
      operationId,
      reason: "memory-deleted-by-user",
      status: "deleted",
    });
    return {
      bank,
      capability,
      id: memoryId,
      operationId,
      reason: "memory-deleted-by-user",
      recovery: recoveryId ? "written" : "none",
      ...(recoveryId
        ? {
            recoveryId,
          }
        : {}),
      status: "deleted",
    };
  }

  // No bank held the target: the request gets its terminal L0 event and the
  // audit records a bounded reason plus the capability verdict, never a
  // success deletion record.
  const recorded = recordFailure(l0, audit, request, undefined, lastReason, capability);
  return {
    capability,
    id: memoryId,
    operationId,
    reason: lastReason,
    recovery: "none",
    status: recorded ? "failed" : "unresolved",
  };
}

/**
 * Capability verdict for this delete. Hand-built adapters that do not expose a
 * probe fall back to "it has an exact reader", so being available never
 * implies an unimplemented read path.
 */
async function resolveExactIdReadCapability(
  adapter: MnemosyneAdapter,
  dataDir: string,
): Promise<ExactIdReadCapability> {
  const verdict = adapter.exactIdReadCapability
    ? await adapter.exactIdReadCapability(dataDir)
    : {
        available: Boolean(adapter.readMemoryById),
      };
  if (verdict.available && !adapter.readMemoryById)
    return {
      available: false,
      reason: EXACT_ID_READ_UNAVAILABLE,
    };
  return verdict;
}

/** Record a terminal memory_failed event; false means only the request exists in L0. */
function recordFailure(
  l0: L0Coordinator,
  audit: AuditLog,
  request: {
    memoryId: string;
    operationId: string;
  },
  bank: string | undefined,
  reason: string,
  capability?: ExactIdReadCapability,
): boolean {
  let recorded = false;
  try {
    l0.record("memory_failed", {
      ...request,
      ...(bank
        ? {
            bank,
          }
        : {}),
      outcome: "failed",
      phase: "delete",
      reason,
    });
    recorded = true;
  } catch {
    // The unresolved state is represented by the request without a terminal event.
  }
  audit.record("rejection", {
    ...(bank
      ? {
          bank,
        }
      : {}),
    ...(capability?.reason
      ? {
          capability: capability.reason,
        }
      : {}),
    operationId: request.operationId,
    outcome: "rejected",
    reason,
    status: "failed",
  });
  return recorded;
}

function boundedReason(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown-error")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 200);
}
