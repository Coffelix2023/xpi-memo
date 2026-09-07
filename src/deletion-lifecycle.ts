import { randomUUID } from "node:crypto";
import type { AuditLog } from "./audit.js";
import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { GetMemoryByIdResult, MnemosyneAdapter } from "./operations.js";
import { writeMemoryRecovery } from "./recovery.js";

export const EXACT_ID_READ_UNAVAILABLE = "upstream-exact-id-read-unavailable";

type DeleteRunner = (
  args: string[],
  options?: {
    bank?: string;
    dataDir?: string;
  },
) => Promise<string>;

export interface T1DeleteResult {
  bank?: string;
  id: string;
  operationId: string;
  reason?: string;
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
  if (!adapter.readMemoryById) {
    const result: T1DeleteResult = {
      id: memoryId,
      operationId,
      reason: EXACT_ID_READ_UNAVAILABLE,
      status: "failed",
    };
    audit.record("rejection", {
      operationId,
      outcome: "rejected",
      reason: EXACT_ID_READ_UNAVAILABLE,
      status: result.status,
    });
    return result;
  }

  const request = {
    memoryId,
    operationId,
  };
  l0.record("memory_delete_requested", request);
  let lastReason = "memory-not-found";

  for (const bank of banks) {
    let memory: GetMemoryByIdResult | null;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: bank probing must remain ordered.
      memory = await adapter.readMemoryById(memoryId, dataDir, bank);
    } catch (error) {
      lastReason = boundedReason(error);
      continue;
    }
    if (!memory) continue;

    let recoveryId: string;
    try {
      recoveryId = writeMemoryRecovery(dataDir, memory).recoveryId;
    } catch (error) {
      const reason = boundedReason(error);
      const recorded = recordFailure(l0, audit, request, bank, reason);
      return {
        bank,
        id: memoryId,
        operationId,
        reason,
        // Without the terminal memory_failed event L0 cannot express the
        // failure outcome, so the operation is unresolved, not failed.
        status: recorded ? "failed" : "unresolved",
      };
    }

    try {
      // Recovery must succeed before the destructive backend call.
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
      const reason = boundedReason(error);
      const recorded = recordFailure(l0, audit, request, bank, reason);
      return {
        bank,
        id: memoryId,
        operationId,
        reason,
        recoveryId,
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
        id: memoryId,
        operationId,
        reason: boundedReason(error),
        recoveryId,
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
      id: memoryId,
      operationId,
      reason: "memory-deleted-by-user",
      recoveryId,
      status: "deleted",
    };
  }

  const result: T1DeleteResult = {
    id: memoryId,
    operationId,
    reason: lastReason,
    status: "failed",
  };
  audit.record("rejection", {
    outcome: "rejected",
    reason: lastReason,
    status: result.status,
  });
  return result;
}

/** Record a terminal memory_failed event; false means only the request exists in L0. */
function recordFailure(
  l0: L0Coordinator,
  audit: AuditLog,
  request: {
    memoryId: string;
    operationId: string;
  },
  bank: string,
  reason: string,
): boolean {
  let recorded = false;
  try {
    l0.record("memory_failed", {
      ...request,
      bank,
      outcome: "failed",
      phase: "delete",
      reason,
    });
    recorded = true;
  } catch {
    // The unresolved state is represented by the request without a terminal event.
  }
  audit.record("rejection", {
    bank,
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
