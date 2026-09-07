import { describe, expect, it } from "vitest";

import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { L0Event, L0EventType } from "./l0/types.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import { foldT1Lifecycles, lifecycleDiagnostics, runT1Write } from "./t1-lifecycle.js";

function operation(): T1MemoryOperation {
  return {
    confidence: 1,
    content: "Prefer concise answers.",
    dataDir: "/tmp/xpi-memo",
    kind: "global_preference",
    provenance: "test",
    scope: "global",
    targetBank: "default",
    source: {
      evidenceType: "explicit-user-statement",
      source: "test",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
  };
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

function adapter(throws = false): MnemosyneAdapter {
  return {
    async store(stored) {
      if (throws) throw new Error("backend-failed");
      return {
        id: "memory-1",
        operation: stored,
        output: "stored",
      };
    },
  };
}

describe("T1 lifecycle coordinator", () => {
  it("records correlated request and commit before reporting stored", async () => {
    const { events, l0 } = coordinator();

    const result = await runT1Write({
      adapter: adapter(),
      l0,
      operation: operation(),
    });

    expect(result).toMatchObject({
      memoryId: "memory-1",
      status: "stored",
    });
    expect(events.map((event) => event.type)).toEqual([
      "routing_decision",
      "t1_memory_write",
    ]);
    expect(events[0]?.payload.operationId).toBe(result.operationId);
    expect(events[1]?.payload.operationId).toBe(result.operationId);
  });

  it("records failure and never reports a failed backend write as stored", async () => {
    const { events, l0 } = coordinator();

    const result = await runT1Write({
      adapter: adapter(true),
      l0,
      operation: operation(),
    });

    expect(result).toMatchObject({
      reason: "backend-failed",
      status: "failed",
    });
    expect(events.map((event) => event.type)).toEqual([
      "routing_decision",
      "memory_failed",
    ]);
  });

  it("returns unresolved when the backend succeeds but commit recording fails", async () => {
    const { events, l0 } = coordinator("t1_memory_write");

    const result = await runT1Write({
      adapter: adapter(),
      l0,
      operation: operation(),
    });

    expect(result).toMatchObject({
      reason: "t1_memory_write-failed",
      status: "unresolved",
    });
    expect(events).toHaveLength(1);
  });
});

describe("T1 lifecycle folding", () => {
  it("keeps request-only operations unresolved and supports legacy committed writes", () => {
    const lifecycles = foldT1Lifecycles([
      {
        position: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "routing_decision",
        version: 1,
        payload: {
          bank: "default",
          kind: "global_preference",
          operationId: "op-1",
          scope: "global",
        },
      },
      {
        position: 2,
        timestamp: "2026-01-01T00:00:01.000Z",
        type: "t1_memory_write",
        version: 1,
        payload: {
          bank: "default",
          kind: "global_preference",
          scope: "global",
        },
      },
    ]);

    expect(lifecycles).toEqual([
      expect.objectContaining({
        operationId: "op-1",
        status: "unresolved",
      }),
      expect.objectContaining({
        operationId: "legacy:2",
        status: "committed",
      }),
    ]);
  });

  it("exposes bounded body-free diagnostics for unresolved operations", () => {
    const diagnostics = lifecycleDiagnostics([
      {
        position: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "routing_decision",
        version: 1,
        payload: {
          bank: "default",
          content: "secret memory body must not leak",
          operationId: "op-unresolved",
          scope: "global",
        },
      },
    ]);

    expect(diagnostics).toEqual({
      total: 1,
      entries: [
        {
          bank: "default",
          operationId: "op-unresolved",
          reason: "no-terminal-event",
          scope: "global",
          status: "unresolved",
        },
      ],
    });
    expect(JSON.stringify(diagnostics)).not.toContain("secret memory body");
  });
  it("replays legacy events without inventing lifecycle correlation", () => {
    const lifecycles = foldT1Lifecycles([
      {
        position: 1,
        timestamp: "2025-01-01T00:00:00.000Z",
        type: "t1_memory_write",
        version: 1,
        payload: {
          content: "legacy body",
          kind: "global_preference",
        },
      },
      {
        position: 2,
        timestamp: "2025-01-01T00:00:01.000Z",
        type: "memory_deleted",
        version: 1,
        payload: {
          memoryId: "not-correlated-to-legacy",
        },
      },
    ]);

    expect(lifecycles).toEqual([
      {
        operationId: "legacy:1",
        status: "committed",
      },
      {
        operationId: "legacy:2",
        status: "committed",
      },
    ]);
  });

  it.each([
    [
      "t1_memory_write",
      "committed",
    ],
    [
      "memory_failed",
      "failed",
    ],
  ] as const)("folds a correlated %s event into %s", (type, status) => {
    const lifecycles = foldT1Lifecycles([
      {
        position: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "routing_decision",
        version: 1,
        payload: {
          bank: "default",
          kind: "global_preference",
          operationId: "op-1",
          scope: "global",
        },
      },
      {
        position: 2,
        timestamp: "2026-01-01T00:00:01.000Z",
        payload: {
          operationId: "op-1",
        },
        type,
        version: 1,
      },
    ]);

    expect(lifecycles).toEqual([
      expect.objectContaining({
        operationId: "op-1",
        status,
      }),
    ]);
  });
});
