import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Every state write goes through `writeFileSync(<state>.tmp)` before the
 * rename, so counting those paths counts whole-file snapshots. The mock keeps
 * the real implementation and only observes it.
 */
const fileWrites = vi.hoisted(() => ({
  paths: [] as string[],
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync(
      path: Parameters<typeof actual.writeFileSync>[0],
      data: Parameters<typeof actual.writeFileSync>[1],
      options?: Parameters<typeof actual.writeFileSync>[2],
    ) {
      fileWrites.paths.push(String(path));
      return actual.writeFileSync(path, data, options);
    },
  };
});

import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.ts";
import { DEFAULT_XPI_MEMO_CONFIG, type XpiMemoConfig } from "./config.ts";
import { createEvidenceRecord } from "./evidence.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import { createL0Coordinator } from "./l0/l0-runtime.js";
import type { L0Event, L0EventType } from "./l0/types.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import type { PendingCandidate } from "./pending-candidate.js";
import { runT1Write } from "./t1-lifecycle.js";
import type { VerificationResult } from "./types.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-candidate-lifecycle-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createCandidate(overrides: Partial<PendingCandidate> = {}): PendingCandidate {
  return {
    conflictState: "none",
    content: "Use pnpm for repository scripts.",
    // Fresh enough to pass the admission age window; the window itself is
    // covered by its own case.
    createdAt: new Date().toISOString(),
    evidence: createEvidenceRecord({
      confidence: 0.9,
      provenance: "session:42",
      source: "reviewed conversation",
      type: "explicit-user-statement",
    }),
    evidenceSummary: "explicit-user-statement from reviewed conversation (session:42)",
    id: "candidate-1",
    kind: "project_decision",
    rationale: "This decision needs explicit confirmation.",
    reason: "project-decision",
    status: "pending",
    targetBank: "project-p-0123456789ab",
    targetScope: "global",
    ...overrides,
  };
}

function createOperation(
  content = "Use pnpm for repository scripts.",
): T1MemoryOperation {
  return {
    confidence: 0.9,
    content,
    dataDir: "/tmp/xpi-memo-candidate-lifecycle",
    kind: "project_decision",
    provenance: "session:42",
    scope: "global",
    targetBank: "project-p-0123456789ab",
    source: {
      evidenceType: "explicit-user-statement",
      source: "reviewed conversation",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
  };
}

function createAdapter(): {
  adapter: MnemosyneAdapter;
  operations: T1MemoryOperation[];
} {
  const operations: T1MemoryOperation[] = [];
  return {
    operations,
    adapter: {
      async store(operation) {
        operations.push(operation);
        return {
          id: `memory-${operations.length}`,
          operation,
          output: `Stored: memory-${operations.length}`,
        };
      },
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

describe("T1 candidate lifecycle", () => {
  it("recovers from a malformed candidate state without exposing invalid candidates", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const malformed = {
      audit: [],
      version: 1,
      candidates: {
        broken: {
          candidate: null,
          operation: null,
        },
      },
    };
    mkdirSync(dataDir, {
      recursive: true,
    });
    writeFileSync(statePath, JSON.stringify(malformed));

    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      statePath,
    });

    expect(store.list()).toEqual([]);
  });

  it("persists and lists pending candidates", () => {
    const dataDir = createTemporaryDirectory();
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate();

    store.add(candidate, createOperation());

    expect(store.list()).toEqual([
      candidate,
    ]);
    expect(readFileSync(join(dataDir, "candidates.json"), "utf8")).toContain(
      candidate.id,
    );
  });

  it("confirms a candidate only after adapter persistence succeeds", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    const result = await store.confirm(candidate.id);

    expect(result.status).toBe("stored");
    expect(operations).toHaveLength(1);
    expect(store.list()).toEqual([]);
  });
  it("runs the L0 hook before adapter persistence", async () => {
    const dataDir = createTemporaryDirectory();
    const order: string[] = [];
    const adapter: MnemosyneAdapter = {
      async store() {
        order.push("adapter");
        return {
          id: "memory-1",
          operation: createOperation(),
          output: "stored",
        };
      },
    };
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
      beforeStore(operation) {
        order.push(`l0:${operation.content}`);
      },
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    await expect(store.confirm(candidate.id)).resolves.toMatchObject({
      status: "stored",
    });
    expect(order).toEqual([
      "l0:Use pnpm for repository scripts.",
      "adapter",
    ]);
  });

  it("rejects a candidate without retaining its content in the event log", async () => {
    const dataDir = createTemporaryDirectory();
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate({
      content: "candidate content to remove",
    });
    store.add(candidate, createOperation(candidate.content));

    const result = await store.reject(candidate.id);

    expect(result.status).toBe("rejected");
    expect(store.list()).toEqual([]);
    const state = readFileSync(join(dataDir, "candidates.json"), "utf8");
    expect(state).not.toContain(candidate.content);
    expect(state).toContain("candidate-rejected");
  });

  it.each([
    "api_key=do-not-store",
    "-----BEGIN PRIVATE KEY-----",
    "role: user\nrole: assistant\nraw transcript",
    "Tool output:\nraw stdout",
    "event_type: tool_result\nraw event",
    "chain of thought: hidden reasoning",
    "This probably uses an unknown provider.",
  ])("does not create persistent state for rejected content", (content) => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      statePath,
    });
    const candidate = createCandidate({
      content,
    });

    expect(store.add(candidate, createOperation(content)).status).toBe("rejected");
    expect(existsSync(statePath)).toBe(false);
  });

  it("leaves existing candidate state unchanged when rejecting new content", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      statePath,
    });
    const existing = createCandidate({
      id: "existing-candidate",
    });
    store.add(existing, createOperation());
    const before = readFileSync(statePath, "utf8");
    const rejected = createCandidate({
      content: "api_key=do-not-store",
    });

    expect(store.add(rejected, createOperation(rejected.content)).status).toBe(
      "rejected",
    );
    expect(readFileSync(statePath, "utf8")).toBe(before);
    expect(store.list()).toEqual([
      existing,
    ]);
  });

  it("rejects prohibited content before adding a candidate to persistent state", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      statePath,
    });
    const candidate = createCandidate({
      content: "api_key=do-not-store",
    });
    const result = store.add(candidate, createOperation(candidate.content));

    expect(result.status).toBe("rejected");
    expect(store.list()).toEqual([]);
  });

  it("rejects prohibited correction without invoking the adapter", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    const result = await store.correct(
      candidate.id,
      createOperation("cookie:do-not-store"),
    );

    expect(result.status).toBe("rejected");
    expect(operations).toHaveLength(0);
    expect(store.list()).toEqual([
      candidate,
    ]);
  });

  it("preserves the pending candidate when confirmation persistence fails", async () => {
    const dataDir = createTemporaryDirectory();
    const adapter: MnemosyneAdapter = {
      async store() {
        throw new Error("adapter failed");
      },
    };
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    await expect(store.confirm(candidate.id)).rejects.toThrow("adapter failed");
    expect(store.list()).toEqual([
      candidate,
    ]);
  });

  it("maps a failed lifecycle to rejected while keeping the candidate", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      async commit() {
        return {
          reason: "failed-lifecycle",
          status: "failed",
        };
      },
      statePath,
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    await expect(store.confirm(candidate.id)).resolves.toEqual({
      reason: "failed-lifecycle",
      status: "rejected",
    });
    expect(store.list()).toEqual([
      candidate,
    ]);
    expect(readFileSync(statePath, "utf8")).toContain(candidate.id);
  });

  it("propagates an unresolved lifecycle and keeps the candidate", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const store = createCandidateStore({
      adapter: createAdapter().adapter,
      async commit() {
        return {
          reason: "unresolved-lifecycle",
          status: "unresolved",
        };
      },
      statePath,
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    await expect(store.confirm(candidate.id)).resolves.toEqual({
      reason: "unresolved-lifecycle",
      status: "unresolved",
    });
    expect(store.list()).toEqual([
      candidate,
    ]);
    expect(readFileSync(statePath, "utf8")).toContain(candidate.id);
  });
  it("keeps candidates.json entry when a committed backend write lacks its L0 commit event", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const { adapter } = createAdapter();
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });
    const originalRecord = l0.record.bind(l0);
    l0.record = (type, payload) => {
      if (type === "t1_memory_write") throw new Error("commit-event-failed");
      return originalRecord(type, payload);
    };
    const store = createCandidateStore({
      adapter,
      async commit(operation) {
        return runT1Write({
          adapter,
          l0,
          operation,
        });
      },
      statePath,
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    await expect(store.confirm(candidate.id)).resolves.toEqual({
      reason: "commit-event-failed",
      status: "unresolved",
    });
    expect(JSON.parse(readFileSync(statePath, "utf8")).candidates).toHaveProperty(
      candidate.id,
    );
    const sessionId = l0.sessionId();
    if (!sessionId) throw new Error("test L0 session was not created");
    const events = await createEventLogReader({
      sessionDir: join(dataDir, "sessions", sessionId),
    }).readAll();
    expect(events.map((event) => event.type)).toEqual([
      "routing_decision",
    ]);
  });

  it("stores a correction before removing the old candidate", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    const result = await store.correct(
      candidate.id,
      createOperation("Use pnpm only for scripts."),
    );

    expect(result.status).toBe("stored");
    expect(operations[0]?.content).toBe("Use pnpm only for scripts.");
    expect(store.list()).toEqual([]);
  });

  it("reports a conflict without deleting the candidate or changing durable metadata", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    const result = store.reportConflict(candidate.id);

    expect(result.status).toBe("conflict");
    expect(operations).toHaveLength(0);
    expect(store.list()[0]).toMatchObject({
      conflictState: "reported",
      id: candidate.id,
    });
  });
});

describe("candidate auto-admission (stabilize tasks 2.1-2.4)", () => {
  const VERIFIED: VerificationResult = {
    excerpt: "Pi 直接加载 src/index.ts TypeScript 源码。",
    filePath: "AGENTS.md",
    line: 12,
    status: "verified",
    timestamp: "2026-01-02T00:00:00.000Z",
  };

  const GENE_CONTENT = "The extension loads src/index.ts directly.";

  function createL0Recorder(): {
    events: Array<{
      payload: Record<string, unknown>;
      type: L0EventType;
    }>;
    l0: {
      recordSafe(type: L0EventType, payload: Record<string, unknown>): L0Event | null;
    };
  } {
    const events: Array<{
      payload: Record<string, unknown>;
      type: L0EventType;
    }> = [];
    return {
      events,
      l0: {
        recordSafe(type, payload) {
          events.push({
            payload,
            type,
          });
          return null;
        },
      },
    };
  }

  function createGeneCandidate(): PendingCandidate {
    const evidence = createEvidenceRecord({
      confidence: 0.7,
      provenance: "activation:offline-extraction",
      source: "session:s1#12",
      type: "l0-conclusion",
    });
    return {
      conflictState: "none",
      content: GENE_CONTENT,
      createdAt: new Date().toISOString(),
      evidence,
      evidenceSummary: `${evidence.type} from ${evidence.source} (${evidence.provenance})`,
      id: "candidate-gene",
      kind: "project_gene",
      rationale: "Proposed by offline extraction.",
      reason: "high-impact-durable",
      status: "pending",
      targetBank: "project-p-0123456789ab",
      targetScope: "project",
    };
  }

  function createGeneOperation(): T1MemoryOperation {
    return {
      ...createOperation(GENE_CONTENT),
      kind: "project_gene",
      provenance: "activation:offline-extraction",
      source: {
        evidenceType: "l0-conclusion",
        source: "session:s1#12",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    };
  }

  it("holds a gene candidate when the config file disables auto-admit", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
      config: {
        ...DEFAULT_XPI_MEMO_CONFIG,
        autoAdmit: false,
      },
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    expect(result).toEqual({
      reason: "auto-admit-disabled",
      status: "skipped",
    });
    expect(operations).toHaveLength(0);
    const pending = store.list();
    expect(pending).toHaveLength(1);
    // Held before verification ran, so the evidence is untouched.
    expect(pending[0]?.evidence.type).toBe("l0-conclusion");
  });

  it("auto-stores a verified gene candidate with upgraded evidence by default", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    expect(result.status).toBe("stored");
    expect(operations).toHaveLength(1);
    expect(operations[0]?.source.evidenceType).toBe("verified-repository-fact");
    expect(operations[0]?.provenance).toBe("activation:offline-extraction");
    expect(operations[0]?.source.source).toBe("session:s1#12");
    expect(operations[0]?.source.timestamp).toBe(candidate.evidence.timestamp);
    expect(store.list()).toEqual([]);
  });

  it("admits a candidate whose verification failed, with its original evidence", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async (): Promise<VerificationResult> => ({
            reason: "no-match",
            status: "failed",
          }),
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    // Verification is enrichment, not a gate: the write still happens and the
    // evidence keeps its original type.
    expect(result.status).toBe("stored");
    expect(operations).toHaveLength(1);
    expect(operations[0]?.source.evidenceType).toBe("l0-conclusion");
    expect(store.list()).toEqual([]);
  });

  it("records candidate_auto_admitted and candidate_confirmed L0 events (task 2.5)", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter } = createAdapter();
    const { events, l0 } = createL0Recorder();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
      l0,
      env: {},
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    await store.admit(candidate.id);

    expect(events.map((event) => event.type)).toEqual([
      "candidate_auto_admitted",
      "candidate_confirmed",
    ]);
    expect(events[0]?.payload.candidateId).toBe(candidate.id);
    expect(events[0]?.payload.evidenceType).toBe("verified-repository-fact");
    expect(events[1]?.payload.candidateId).toBe(candidate.id);
  });

  it("records tool_verification_failed and still admits the candidate (task 5.2, spec)", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter } = createAdapter();
    const { events, l0 } = createL0Recorder();
    const store = createCandidateStore({
      adapter,
      env: {},
      l0,
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async (): Promise<VerificationResult> => ({
            reason: "no-match",
            status: "failed",
          }),
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    await store.admit(candidate.id);

    expect(events.map((event) => event.type)).toEqual([
      "tool_verification_failed",
      "candidate_auto_admitted",
      "candidate_confirmed",
    ]);
    expect(events[0]?.payload.reason).toBe("no-match");
    // A failed verification no longer strands the candidate in the queue.
    expect(store.list()).toHaveLength(0);
  });

  it("routes gene candidates to the registered verifier (task 5.4)", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter } = createAdapter();
    let verifierCalls = 0;
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async (candidate) => {
            verifierCalls += 1;
            expect(candidate.content).toBe(GENE_CONTENT);
            return VERIFIED;
          },
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    expect(verifierCalls).toBe(1);
    expect(result.status).toBe("stored");
    expect(store.list()).toHaveLength(0);
  });

  it("admits a manual-confirm kind without calling a verifier (task 5.4)", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_decision",
          async () => {
            throw new Error("verifier must not run for decision kind");
          },
        ],
      ]),
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    const result = await store.admit(candidate.id);

    // The kind default no longer gates admission, and its verifier is still
    // not consulted.
    expect(result.status).toBe("stored");
    expect(operations).toHaveLength(1);
    expect(store.list()).toHaveLength(0);
  });

  it("writes a tool-verified audit entry with verification evidence (task 7.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const auditPath = join(dataDir, "audit.json");
    const { adapter } = createAdapter();
    const store = createCandidateStore({
      adapter,
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    await store.admit(candidate.id);

    const entry = createAuditLog({
      statePath: auditPath,
    })
      .list()
      .find((item) => item.action === "tool-verified");
    expect(entry?.metadata.candidateId).toBe(candidate.id);
    expect(entry?.metadata.filePath).toBe("AGENTS.md");
    expect(entry?.metadata.excerpt).toContain("src/index.ts");
    expect(entry?.metadata.decision).toBe("auto-stored");
    expect(entry?.metadata.status).toBe("stored");
    expect(entry?.metadata.line).toBe(12);
    expect(Number.isNaN(Date.parse(entry?.timestamp ?? ""))).toBe(false);
  });

  it("writes a tool-verification-failed audit entry with the reason (task 7.4)", async () => {
    const dataDir = createTemporaryDirectory();
    const auditPath = join(dataDir, "audit.json");
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      env: {},
      statePath: join(dataDir, "candidates.json"),
      verifiers: new Map([
        [
          "project_gene",
          async (): Promise<VerificationResult> => ({
            reason: "no-match",
            status: "failed",
          }),
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    await store.admit(candidate.id);

    const entry = createAuditLog({
      statePath: auditPath,
    })
      .list()
      .find((item) => item.action === "tool-verification-failed");
    expect(entry?.metadata.candidateId).toBe(candidate.id);
    expect(entry?.metadata.reason).toBe("no-match");
    expect(entry?.metadata.decision).toBe("auto-admitted");
    expect(operations).toHaveLength(1);
  });
  it("refuses empty content before it can ever be admitted", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = {
      ...createGeneCandidate(),
      content: "   ",
    };

    // The content policy is the hard rail for empty content: it never reaches
    // the queue, so no preference setting can admit it either.
    expect(store.add(candidate, createGeneOperation())).toEqual({
      reason: "prohibited-content:empty-content",
      status: "rejected",
    });
    expect(store.list()).toEqual([]);
    expect(operations).toHaveLength(0);
  });

  it("refuses a candidate with an unresolved conflict", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = {
      ...createGeneCandidate(),
      conflictState: "reported" as const,
    };
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    expect(result).toEqual({
      reason: "unresolved-conflict",
      status: "rejected",
    });
    expect(operations).toHaveLength(0);
  });

  // Every preference that can hold a candidate, one case each.
  it.each<
    [
      string,
      Partial<XpiMemoConfig>,
      string,
    ]
  >([
    [
      "below the confidence floor",
      {
        admissionMinConfidence: 0.9,
      },
      "below-min-confidence",
    ],
    [
      "outside the source scope",
      {
        admissionSourceScope: "current-project",
      },
      "outside-source-scope",
    ],
    [
      "below the evidence floor",
      {
        admissionEvidenceFloor: "repository-fact",
      },
      "below-evidence-floor",
    ],
    [
      "with its kind disabled",
      {
        admissionAllowProjectGene: false,
      },
      "auto-admit-disabled",
    ],
    [
      "while memory is paused",
      {
        paused: true,
      },
      "paused",
    ],
  ])("holds a gene candidate %s", async (_label, overrides, reason) => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      // The candidate targets another project bank, so the narrowed scope
      // rejects it.
      currentProjectBank: "project-p-other",
      env: {},
      statePath: join(dataDir, "candidates.json"),
      config: {
        ...DEFAULT_XPI_MEMO_CONFIG,
        ...overrides,
      },
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    expect(result).toEqual({
      reason,
      status: "skipped",
    });
    expect(operations).toHaveLength(0);
    expect(store.list()).toHaveLength(1);
  });

  it("holds a candidate older than the admission age window", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      env: {},
      statePath: join(dataDir, "candidates.json"),
    });
    const candidate = {
      ...createGeneCandidate(),
      createdAt: "2020-01-01T00:00:00.000Z",
    };
    store.add(candidate, createGeneOperation());

    const result = await store.admit(candidate.id);

    expect(result).toEqual({
      reason: "stale-candidate",
      status: "skipped",
    });
    expect(operations).toHaveLength(0);
  });
});

describe("candidate store batch writes (rescan tasks 3.1)", () => {
  function seededStore(dataDir: string) {
    const { adapter } = createAdapter();
    const statePath = join(dataDir, "candidates.json");
    const store = createCandidateStore({
      adapter,
      statePath,
    });
    const first = createCandidate({
      id: "candidate-batch-1",
    });
    const second = createCandidate({
      id: "candidate-batch-2",
    });
    store.add(first, createOperation());
    store.add(second, createOperation());
    return {
      first,
      second,
      statePath,
      store,
    };
  }

  it("collapses a whole walk into one state write", async () => {
    const dataDir = createTemporaryDirectory();
    const { first, second, statePath, store } = seededStore(dataDir);
    fileWrites.paths.length = 0;

    await store.batch(async () => {
      store.archive(first.id);
      store.archive(second.id);
    });

    // Two mutations, one snapshot instead of two.
    expect(fileWrites.paths).toEqual([
      `${statePath}.tmp`,
    ]);
    expect(store.listArchived().map((candidate) => candidate.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("still writes what happened when the batched work throws", async () => {
    const dataDir = createTemporaryDirectory();
    const { first, statePath, store } = seededStore(dataDir);
    fileWrites.paths.length = 0;

    await expect(
      store.batch(async () => {
        store.archive(first.id);
        throw new Error("walk failed halfway");
      }),
    ).rejects.toThrow("walk failed halfway");

    // A failure half way through must not undo the archive that succeeded.
    expect(fileWrites.paths).toEqual([
      `${statePath}.tmp`,
    ]);
    const persisted = JSON.parse(readFileSync(statePath, "utf8"));
    expect(persisted.candidates[first.id].candidate.status).toBe("archived");
  });

  it("keeps ordinary writes immediate outside a batch", () => {
    const dataDir = createTemporaryDirectory();
    const { first, statePath, store } = seededStore(dataDir);
    fileWrites.paths.length = 0;

    store.archive(first.id);

    expect(fileWrites.paths).toEqual([
      `${statePath}.tmp`,
    ]);
    const persisted = JSON.parse(readFileSync(statePath, "utf8"));
    expect(persisted.candidates[first.id].candidate.status).toBe("archived");
  });
});
