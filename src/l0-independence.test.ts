import { describe, expect, it } from "vitest";

import { createMnemosyneAdapter, type MnemosyneRunner } from "./operations.js";
import { type RecallRunner, recall } from "./recall.js";
import { type MemoryStatus, renderStatus } from "./status.js";

const NO_L0_ENVIRONMENT = {
  CONTEXT_MODE: undefined,
  DEEPSEEK_HARNESS: undefined,
  L0_RUNTIME: undefined,
};

function recallPayload(): string {
  return JSON.stringify({
    explain: {
      stages: [],
      embedding: {
        available: true,
      },
    },
    results: [
      {
        content: "T1 memory remains available without L0.",
        id: "memory-1",
        scope: "global",
        score: 0.9,
        source:
          "kind=global_preference;ev=explicit-user-statement;prov=user;ts=2026-01-01T00%3A00%3A00.000Z;src=user",
      },
    ],
  });
}

describe("T1 independence from a concrete L0 runtime", () => {
  it("imports T1 modules without an L0 runtime or configuration", () => {
    expect(NO_L0_ENVIRONMENT).toEqual({
      CONTEXT_MODE: undefined,
      DEEPSEEK_HARNESS: undefined,
      L0_RUNTIME: undefined,
    });
    expect(createMnemosyneAdapter).toBeTypeOf("function");
    expect(recall).toBeTypeOf("function");
    expect(renderStatus).toBeTypeOf("function");
  });

  it("runs bounded T1 recall with a local runner and no L0 runtime", async () => {
    const run: RecallRunner = async () => recallPayload();

    const result = await recall(
      {
        query: "T1 memory",
        context: {
          dataDir: "/tmp/xpi-memo-no-l0",
          projectBank: null,
        },
      },
      run,
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.content).toContain("without L0");
  });

  it("runs T1 store through the adapter without an L0 runtime", async () => {
    const calls: string[][] = [];
    const run: MnemosyneRunner = async (args) => {
      calls.push(args);
      return "Stored: memory-1";
    };
    const adapter = createMnemosyneAdapter(run);

    const result = await adapter.store({
      confidence: 0.9,
      content: "T1 store remains available without L0.",
      dataDir: "/tmp/xpi-memo-no-l0",
      kind: "global_preference",
      provenance: "user:session-1",
      scope: "global",
      targetBank: "default",
      source: {
        evidenceType: "explicit-user-statement",
        source: "user message",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(result.id).toBe("memory-1");
    expect(calls).toHaveLength(1);
  });

  it("renders T1 status without requiring an L0 runtime", () => {
    const status: MemoryStatus = {
      currentProject: null,
      diskBytes: null,
      fallback: false,
      paused: false,
      pendingCandidates: 0,
      provenance: "evidence-linked",
      todayStored: 0,
      counts: {
        global: 0,
        project: 0,
        session: 0,
      },
      recall: {
        scope: "global-only",
        queriedBanks: [
          "default",
        ],
      },
      retrieval: {
        embeddingAvailable: true,
        mode: "hybrid",
      },
      sleep: {
        dedicatedModelSupported: false,
        enabled: false,
        mode: "none",
        sleepCommandSupported: true,
        state: "SLEEP_DISABLED",
      },
      tiers: {
        L0: "external-session-trace",
        T1: "xpi-memo",
        T2: "deferred-ai-memory",
        T3: "deferred-memvid",
      },
    };

    expect(renderStatus(status).tiers.L0).toBe("external-session-trace");
  });
});
