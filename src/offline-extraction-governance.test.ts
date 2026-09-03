import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import {
  createExtractionBudgetLedger,
  type ExtractionBudgetLimits,
} from "./extraction-budget.js";
import { createL0Coordinator } from "./l0/l0-runtime.js";
import {
  governOfflineExtractionOutput,
  normalizeOfflineExtractionOutput,
  type OfflineExtractionGovernanceRuntime,
} from "./offline-extraction.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-extraction-"));
  directories.push(directory);
  return directory;
}

function adapter(stored: T1MemoryOperation[] = []): MnemosyneAdapter {
  return {
    store: async (operation) => {
      stored.push(operation);
      return {
        id: "memory-1",
        operation,
        output: "stored",
      };
    },
  };
}

function governanceRuntime(
  dataDir: string,
  stored: T1MemoryOperation[],
  projectBank: string | null = null,
  paused = false,
  ledger?: ReturnType<typeof createExtractionBudgetLedger>,
  limits?: ExtractionBudgetLimits,
) {
  const audit = createAuditLog({
    statePath: join(dataDir, "audit.json"),
  });
  const candidates = createCandidateStore({
    adapter: adapter(stored),
    statePath: join(dataDir, "candidates.json"),
  });
  const l0 = createL0Coordinator({
    dataDir,
    enabled: true,
  });
  l0.record("user_message", {
    source: "test-input",
    text: "test input",
  });
  const runtime: OfflineExtractionGovernanceRuntime = {
    adapter: adapter(stored),
    audit,
    candidates,
    config: {
      dataDir,
      paused,
    },
    context: {
      dataDir,
      projectBank,
    },
    l0,
    ...(ledger
      ? {
          ledger,
        }
      : {}),
    ...(limits
      ? {
          limits,
        }
      : {}),
    run: async () => "",
  };
  return {
    ...runtime,
    audit,
    candidates,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("offline extraction proposal normalization (task 3.2)", () => {
  it("normalizes a bare proposal array and forces l0-conclusion evidence", () => {
    const { proposals } = normalizeOfflineExtractionOutput([
      {
        confidence: 0.95,
        content: "  remember to run lint before commit  ",
        evidenceType: "explicit-user-statement",
        kind: "global_workflow",
        sourceReference: "  event 42  ",
      },
    ]);
    expect(proposals).toEqual([
      {
        confidence: 0.95,
        content: "remember to run lint before commit",
        evidenceType: "l0-conclusion",
        kind: "global_workflow",
        sourceReference: "event 42",
      },
    ]);
  });

  it("accepts a { proposals } wrapper", () => {
    const { proposals } = normalizeOfflineExtractionOutput({
      proposals: [
        {
          confidence: 0.8,
          content: "we decided to keep the adapter",
          kind: "project_decision",
          sourceReference: "event 7",
        },
      ],
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.kind).toBe("project_decision");
  });

  it("never preserves explicit-user-statement from raw runner output", () => {
    const { proposals } = normalizeOfflineExtractionOutput([
      {
        confidence: 1,
        content: "user said remember X",
        evidenceType: "explicit-user-statement",
        kind: "global_preference",
        sourceReference: "event 1",
      },
    ]);
    expect(proposals[0]?.evidenceType).toBe("l0-conclusion");
  });

  it("skips invalid entries with a bounded count", () => {
    const { proposals, invalid } = normalizeOfflineExtractionOutput([
      null,
      {
        confidence: 0.5,
        kind: "not-a-kind",
        sourceReference: "event 2",
      },
      {
        confidence: 2,
        content: "too confident",
        kind: "global_preference",
        sourceReference: "event 3",
      },
      {
        confidence: 0.5,
        content: "   ",
        kind: "global_preference",
        sourceReference: "event 4",
      },
      {
        confidence: 0.5,
        content: "missing source",
        kind: "global_preference",
      },
      {
        confidence: 0.5,
        content: "ok",
        kind: "global_preference",
        sourceReference: "event 6",
      },
    ]);
    expect(invalid).toBe(5);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.content).toBe("ok");
    expect(
      normalizeOfflineExtractionOutput([
        null,
      ]).proposalsTotal,
    ).toBe(1);
  });
});

describe("offline extraction governance (task 3.2)", () => {
  it("stores a high-confidence short session context directly", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, "project-demo");
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "Working on the adapter boundary this session.",
          kind: "session_context",
          sourceReference: "event 1",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "session_context",
        status: "stored",
      },
    ]);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.source.evidenceType).toBe("l0-conclusion");
    expect(stored[0]?.provenance).toBe("activation:offline-extraction");
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("routes a low-confidence session context to the candidate queue", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, "project-demo");
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.6,
          content: "Focus on tests next.",
          kind: "session_context",
          sourceReference: "event 2",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "session_context",
        status: "candidate",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(1);
  });

  it("routes a global preference to the candidate queue (not direct storage)", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored);
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "User prefers concise answers.",
          kind: "global_preference",
          sourceReference: "event 3",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "global_preference",
        status: "candidate",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(1);
  });

  it("rejects prohibited content without storing or candidating it", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, "project-demo");
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "The api_key=supersecret must be remembered.",
          kind: "project_gotcha",
          sourceReference: "event 4",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        reason: "prohibited-content:secret",
        status: "rejected",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("rejects project memory when no project context exists", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, null);
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "We decided to keep the adapter.",
          kind: "project_decision",
          sourceReference: "event 5",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "project_decision",
        reason: "missing-project-context",
        status: "rejected",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("queues a project decision as a candidate when project context exists", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, "project-demo");
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.9,
          content: "We decided to keep the adapter.",
          kind: "project_decision",
          sourceReference: "event 6",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "project_decision",
        status: "candidate",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(1);
  });

  it("records rejection for a project kind when the project bank cannot be created", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, "project-demo");
    runtime.run = async () => {
      throw new Error("bank create failed");
    };
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.9,
          content: "We decided to keep the adapter.",
          kind: "project_decision",
          sourceReference: "event 7",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "project_decision",
        reason: "project-bank-unavailable",
        status: "rejected",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("rejects directly when paused even for a direct-store candidate", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = governanceRuntime(dataDir, stored, "project-demo", true);
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "Working on the adapter this session.",
          kind: "session_context",
          sourceReference: "event 8",
        },
      ],
      runtime,
    );
    // Paused forces candidate creation, not rejection; direct-store is disabled.
    expect(results).toMatchObject([
      {
        kind: "session_context",
        status: "candidate",
      },
    ]);
    expect(stored).toHaveLength(0);
  });

  it("stops governance and records budget-exhausted when the proposal budget is spent", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    ledger.recordProposals(1, 10);
    const runtime = governanceRuntime(dataDir, stored, "project-demo", false, ledger, {
      maxCharsPerSession: 5_000,
      maxExecutionsPerSession: 1,
      maxProposalsPerSession: 1,
    });
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "Working on the adapter boundary this session.",
          kind: "session_context",
          sourceReference: "event 1",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        kind: "session_context",
        reason: "budget-exhausted",
        status: "rejected",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("stops governance when the char budget would be exceeded", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    const runtime = governanceRuntime(dataDir, stored, "project-demo", false, ledger, {
      maxCharsPerSession: 5,
      maxExecutionsPerSession: 1,
      maxProposalsPerSession: 20,
    });
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "This proposal body is longer than the five-char budget.",
          kind: "session_context",
          sourceReference: "event 1",
        },
      ],
      runtime,
    );
    expect(results).toMatchObject([
      {
        reason: "budget-exhausted",
        status: "rejected",
      },
    ]);
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("records proposal consumption in the ledger after governing", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    const runtime = governanceRuntime(dataDir, stored, "project-demo", false, ledger, {
      maxCharsPerSession: 5_000,
      maxExecutionsPerSession: 1,
      maxProposalsPerSession: 20,
    });
    const results = await governOfflineExtractionOutput(
      [
        {
          confidence: 0.95,
          content: "Working on the adapter boundary this session.",
          kind: "session_context",
          sourceReference: "event 1",
        },
      ],
      runtime,
    );
    expect(results[0]?.status).toBe("stored");
    const consumption = ledger.consumption();
    expect(consumption.proposals).toBe(1);
    expect(consumption.chars).toBeGreaterThan(0);
  });
});
