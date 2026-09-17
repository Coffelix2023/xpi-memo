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

import { afterEach, describe, expect, it } from "vitest";
import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.ts";
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
    createdAt: "2026-01-01T00:00:00.000Z",
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

describe("candidate auto-admission (tasks 5.1-5.4)", () => {
  const VERIFIED: VerificationResult = {
    filePath: "AGENTS.md",
    matchedLine: "Pi 直接加载 src/index.ts TypeScript 源码。",
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
      createdAt: "2026-01-01T00:00:00.000Z",
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

  it("auto-stores a verified gene candidate with upgraded evidence (task 5.1)", async () => {
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

    const result = await store.autoConfirm(candidate.id);

    expect(result.status).toBe("stored");
    expect(operations).toHaveLength(1);
    expect(operations[0]?.source.evidenceType).toBe("verified-repository-fact");
    expect(operations[0]?.provenance).toBe("activation:offline-extraction");
    expect(operations[0]?.source.source).toBe("session:s1#12");
    expect(operations[0]?.source.timestamp).toBe(candidate.evidence.timestamp);
    expect(store.list()).toEqual([]);
  });

  it("keeps a failed candidate pending with its original evidence (task 5.2)", async () => {
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

    const result = await store.autoConfirm(candidate.id);

    expect(result).toEqual({
      reason: "no-match",
      status: "skipped",
    });
    expect(operations).toHaveLength(0);
    const pending = store.list();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.evidence.type).toBe("l0-conclusion");
  });

  it("records candidate_auto_verified and candidate_confirmed L0 events (task 5.3)", async () => {
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
          async () => VERIFIED,
        ],
      ]),
    });
    const candidate = createGeneCandidate();
    store.add(candidate, createGeneOperation());

    await store.autoConfirm(candidate.id);

    expect(events.map((event) => event.type)).toEqual([
      "candidate_auto_verified",
      "candidate_confirmed",
    ]);
    expect(events[0]?.payload.candidateId).toBe(candidate.id);
    expect(events[0]?.payload.filePath).toBe("AGENTS.md");
    expect(events[0]?.payload.evidenceType).toBe("verified-repository-fact");
    expect(events[1]?.payload.candidateId).toBe(candidate.id);
  });

  it("records tool_verification_failed when verification fails (task 5.2, spec)", async () => {
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

    await store.autoConfirm(candidate.id);

    expect(events.map((event) => event.type)).toEqual([
      "tool_verification_failed",
    ]);
    expect(events[0]?.payload.reason).toBe("no-match");
    expect(store.list()).toHaveLength(1);
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

    const result = await store.autoConfirm(candidate.id);

    expect(verifierCalls).toBe(1);
    expect(result.status).toBe("stored");
  });

  it("skips verification for manual-confirm kinds without calling a verifier (task 5.4)", async () => {
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

    const result = await store.autoConfirm(candidate.id);

    expect(result).toEqual({
      reason: "policy:manual-confirm",
      status: "skipped",
    });
    expect(operations).toHaveLength(0);
    expect(store.list()).toHaveLength(1);
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

    await store.autoConfirm(candidate.id);

    const entry = createAuditLog({
      statePath: auditPath,
    })
      .list()
      .find((item) => item.action === "tool-verified");
    expect(entry?.metadata.candidateId).toBe(candidate.id);
    expect(entry?.metadata.filePath).toBe("AGENTS.md");
    expect(entry?.metadata.matchedLine).toContain("src/index.ts");
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

    await store.autoConfirm(candidate.id);

    const entry = createAuditLog({
      statePath: auditPath,
    })
      .list()
      .find((item) => item.action === "tool-verification-failed");
    expect(entry?.metadata.candidateId).toBe(candidate.id);
    expect(entry?.metadata.reason).toBe("no-match");
    expect(operations).toHaveLength(0);
  });
});
