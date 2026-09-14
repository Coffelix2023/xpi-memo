import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAuditLog } from "./audit.js";
import { EXACT_ID_READ_UNAVAILABLE } from "./banks.js";
import { runT1Delete } from "./deletion-lifecycle.js";
import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { L0Event, L0EventType } from "./l0/types.js";
import type { GetMemoryByIdResult, MnemosyneAdapter } from "./operations.js";

const temporaryDirectories: string[] = [];

function dataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-delete-"));
  temporaryDirectories.push(directory);
  return directory;
}

function coordinator(throwsOn: L0EventType | null = null): {
  events: L0Event[];
  l0: L0Coordinator;
} {
  const events: L0Event[] = [];
  return {
    events,
    l0: {
      enabled: true,
      currentPosition: () => events.length,
      record(type, payload) {
        if (type === throwsOn) throw new Error(`${type}-failed`);
        const event: L0Event = {
          payload,
          position: events.length + 1,
          timestamp: "2026-01-01T00:00:00.000Z",
          type,
          version: 1,
        };
        events.push(event);
        return event;
      },
      recordSafe: () => null,
      sessionId: () => "session-1",
    },
  };
}

function memory(bank: string): GetMemoryByIdResult {
  return {
    bank,
    content: "Keep the existing adapter boundary.",
    id: "memory-1",
    kind: "project_decision",
    scope: "project",
    source: "test",
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

function adapter(
  reader: (
    id: string,
    dataDir: string,
    bank?: string,
  ) => Promise<GetMemoryByIdResult | null>,
): MnemosyneAdapter {
  return {
    readMemoryById: reader,
    async store() {
      throw new Error("not-used");
    },
  };
}

/** Adapter without exact-ID read: forget must delete directly (task 2.3). */
function blindAdapter(): MnemosyneAdapter {
  return {
    exactIdReadCapability: async () => ({
      available: false,
      reason: EXACT_ID_READ_UNAVAILABLE,
    }),
    async store() {
      throw new Error("not-used");
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("T1 deletion lifecycle", () => {
  it("probes project before default and deletes only after recovery", async () => {
    const dataDir = dataDirectory();
    const calls: string[] = [];
    const { events, l0 } = coordinator();
    const result = await runT1Delete({
      adapter: adapter(async (_id, _dataDir, bank) => {
        calls.push(`read:${bank}`);
        return bank === "project-test" ? memory(bank) : null;
      }),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "project-test",
        "default",
      ],
      dataDir,
      deleteMemory: async (_args, options) => {
        calls.push(`delete:${options?.bank ?? "default"}`);
        const recoveryFiles = readdirSync(join(dataDir, "recovery"));
        expect(recoveryFiles).toHaveLength(1);
        expect(
          readFileSync(join(dataDir, "recovery", recoveryFiles[0] as string), "utf8"),
        ).toContain("memory-1");
        return "deleted";
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-1",
    });

    expect(result).toMatchObject({
      bank: "project-test",
      id: "memory-1",
      operationId: "delete-1",
      status: "deleted",
    });
    expect(calls).toEqual([
      "read:project-test",
      "delete:project-test",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
      "memory_deleted",
    ]);
    expect(events[0]?.payload.operationId).toBe("delete-1");
    expect(events[1]?.payload.operationId).toBe("delete-1");
  });

  it("does not delete when recovery fails", async () => {
    const dataDir = dataDirectory();
    const recoveryPath = join(dataDir, "recovery");
    writeFileSync(recoveryPath, "not-a-directory");
    const { events, l0 } = coordinator();
    const deleteCalls: string[] = [];
    const result = await runT1Delete({
      adapter: adapter(async () => memory("default")),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "default",
      ],
      dataDir,
      deleteMemory: async () => {
        deleteCalls.push("delete");
        return "deleted";
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-recovery-failure",
    });

    expect(result.status).toBe("failed");
    expect(result.recovery).toBe("none");
    expect(deleteCalls).toEqual([]);
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
      "memory_failed",
    ]);
  });

  it("keeps the memory undeclared as deleted when backend deletion fails", async () => {
    const dataDir = dataDirectory();
    const { events, l0 } = coordinator();
    const result = await runT1Delete({
      adapter: adapter(async () => memory("default")),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "default",
      ],
      dataDir,
      deleteMemory: async () => {
        throw new Error("delete-failed");
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-backend-failure",
    });

    expect(result).toMatchObject({
      operationId: "delete-backend-failure",
      reason: "delete-failed",
      status: "failed",
    });
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
      "memory_failed",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).not.toContain(
      "memory-deleted-by-user",
    );
  });
  it("reports unresolved when recovery fails and memory_failed cannot be recorded", async () => {
    const dataDir = dataDirectory();
    const recoveryPath = join(dataDir, "recovery");
    writeFileSync(recoveryPath, "not-a-directory");
    const { events, l0 } = coordinator("memory_failed");
    const result = await runT1Delete({
      adapter: adapter(async () => memory("default")),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "default",
      ],
      dataDir,
      deleteMemory: async () => "deleted",
      l0,
      memoryId: "memory-1",
      operationId: "delete-recovery-failure-event-failure",
    });

    expect(result.status).toBe("unresolved");
    // Only the request event exists; no terminal event and no success marker.
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).not.toContain(
      "memory-deleted-by-user",
    );
  });

  it("reports unresolved when backend deletion fails and memory_failed cannot be recorded", async () => {
    const dataDir = dataDirectory();
    const { events, l0 } = coordinator("memory_failed");
    const result = await runT1Delete({
      adapter: adapter(async () => memory("default")),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "default",
      ],
      dataDir,
      deleteMemory: async () => {
        throw new Error("delete-failed");
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-backend-failure-event-failure",
    });

    expect(result.status).toBe("unresolved");
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).not.toContain(
      "memory-deleted-by-user",
    );
  });

  it("deletes directly without recovery when the capability is unavailable", async () => {
    const dataDir = dataDirectory();
    const { events, l0 } = coordinator();
    const calls: string[] = [];
    const result = await runT1Delete({
      adapter: blindAdapter(),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "project-test",
        "default",
      ],
      dataDir,
      deleteMemory: async (_args, options) => {
        const bank = options?.bank ?? "default";
        calls.push(`delete:${bank}`);
        if (bank === "project-test") throw new Error("Memory not found: memory-1");
        return "Deleted: memory-1";
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-no-reader",
    });

    expect(result).toEqual({
      bank: "default",
      id: "memory-1",
      operationId: "delete-no-reader",
      reason: "memory-deleted-by-user",
      recovery: "none",
      status: "deleted",
      capability: {
        available: false,
        reason: EXACT_ID_READ_UNAVAILABLE,
      },
    });
    // project bank first, then default; nothing is read and no snapshot exists.
    expect(calls).toEqual([
      "delete:project-test",
      "delete:default",
    ]);
    expect(existsSync(join(dataDir, "recovery"))).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
      "memory_deleted",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).toContain(
      "memory-deleted-by-user",
    );
  });

  it("stops after the first successful bank when the capability is unavailable", async () => {
    const dataDir = dataDirectory();
    const { l0 } = coordinator();
    const calls: string[] = [];
    const result = await runT1Delete({
      adapter: blindAdapter(),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "project-test",
        "default",
      ],
      dataDir,
      deleteMemory: async (_args, options) => {
        calls.push(`delete:${options?.bank ?? "default"}`);
        return "Deleted: memory-1";
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-project-hit",
    });

    expect(result).toMatchObject({
      bank: "project-test",
      recovery: "none",
      status: "deleted",
    });
    expect(calls).toEqual([
      "delete:project-test",
    ]);
  });

  it("reports failure without a success record when no bank holds the target", async () => {
    const dataDir = dataDirectory();
    const { events, l0 } = coordinator();
    const result = await runT1Delete({
      adapter: blindAdapter(),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "project-test",
        "default",
      ],
      dataDir,
      deleteMemory: async () => {
        throw new Error("Memory not found: memory-1");
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-absent",
    });

    expect(result).toMatchObject({
      id: "memory-1",
      reason: "memory-not-found",
      recovery: "none",
      status: "failed",
    });
    expect(events.map((event) => event.type)).toEqual([
      "memory_delete_requested",
      "memory_failed",
    ]);
    const auditState = readFileSync(join(dataDir, "audit.json"), "utf8");
    expect(auditState).not.toContain("memory-deleted-by-user");
    expect(auditState).toContain("upstream-exact-id-read-unavailable");
  });

  it("treats a non-not-found backend failure as terminal", async () => {
    const dataDir = dataDirectory();
    const { l0 } = coordinator();
    const calls: string[] = [];
    const result = await runT1Delete({
      adapter: blindAdapter(),
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "project-test",
        "default",
      ],
      dataDir,
      deleteMemory: async (_args, options) => {
        calls.push(`delete:${options?.bank ?? "default"}`);
        throw new Error("database is locked");
      },
      l0,
      memoryId: "memory-1",
      operationId: "delete-backend-locked",
    });

    expect(result).toMatchObject({
      bank: "project-test",
      reason: "database is locked",
      recovery: "none",
      status: "failed",
    });
    expect(calls).toEqual([
      "delete:project-test",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).not.toContain(
      "memory-deleted-by-user",
    );
  });
});
