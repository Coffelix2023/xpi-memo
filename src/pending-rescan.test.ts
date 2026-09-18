/**
 * Pending-candidate rescan acceptance (change
 * admission-preferences-and-pending-rescan, tasks 4.1-4.4).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import { DEFAULT_XPI_MEMO_CONFIG } from "./config.js";
import { createEvidenceRecord } from "./evidence.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import type { PendingCandidate } from "./pending-candidate.js";
import { rescanPendingCandidates } from "./pending-rescan.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-rescan-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, {
      force: true,
      recursive: true,
    });
});

function createAdapter(): {
  adapter: MnemosyneAdapter;
  operations: T1MemoryOperation[];
} {
  const operations: T1MemoryOperation[] = [];
  return {
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
    operations,
  };
}

function createCandidate(overrides: Partial<PendingCandidate>): PendingCandidate {
  const id = overrides.id ?? "candidate-1";
  const evidence = createEvidenceRecord({
    confidence: 0.9,
    provenance: "activation:offline-extraction",
    source: `session:${id}`,
    type: "l0-conclusion",
  });
  return {
    conflictState: "none",
    content: `Body of ${id}`,
    createdAt: new Date().toISOString(),
    evidence,
    evidenceSummary: `${evidence.type} from ${evidence.source} (${evidence.provenance})`,
    id,
    kind: "project_decision",
    rationale: "Proposed by offline extraction.",
    reason: "project-decision",
    status: "pending",
    targetBank: "project-a",
    targetScope: "project",
    ...overrides,
  };
}

function createOperation(candidate: PendingCandidate): T1MemoryOperation {
  return {
    confidence: candidate.evidence.confidence,
    content: candidate.content,
    dataDir: "/tmp/xpi-memo-rescan",
    kind: candidate.kind,
    provenance: candidate.evidence.provenance,
    scope: candidate.targetScope,
    targetBank: candidate.targetBank,
    source: {
      evidenceType: candidate.evidence.type,
      source: candidate.evidence.source,
      timestamp: candidate.evidence.timestamp,
    },
  };
}

describe("pending candidate rescan", () => {
  it("admits what the preferences allow and archives what they hold back", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const auditPath = join(dataDir, "audit.json");
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      statePath,
    });
    const admitted = createCandidate({
      id: "candidate-admitted",
      targetBank: "project-a",
    });
    const stale = createCandidate({
      createdAt: "2020-01-01T00:00:00.000Z",
      id: "candidate-stale",
      targetBank: "project-b",
    });
    store.add(admitted, createOperation(admitted));
    store.add(stale, createOperation(stale));

    const outcome = await rescanPendingCandidates({
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      candidates: store,
    });

    expect(outcome).toEqual({
      archived: 1,
      stored: 1,
      total: 2,
    });
    // Each candidate was written to its own target bank, never to the caller's.
    expect(operations.map((operation) => operation.targetBank)).toEqual([
      "project-a",
    ]);
    expect(store.list()).toEqual([]);
    expect(store.listArchived().map((candidate) => candidate.id)).toEqual([
      "candidate-stale",
    ]);
  });

  it("is idempotent: a second run writes nothing", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const auditPath = join(dataDir, "audit.json");
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      statePath,
    });
    const candidate = createCandidate({
      id: "candidate-twice",
    });
    store.add(candidate, createOperation(candidate));

    const first = await rescanPendingCandidates({
      candidates: store,
    });
    const second = await rescanPendingCandidates({
      candidates: store,
    });

    expect(first).toEqual({
      archived: 0,
      stored: 1,
      total: 1,
    });
    expect(second).toEqual({
      archived: 0,
      stored: 0,
      total: 0,
    });
    // The candidate reached T1 exactly once.
    expect(operations).toHaveLength(1);
  });

  it("audits one bounded entry per processed candidate, never its body", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const auditPath = join(dataDir, "audit.json");
    const { adapter } = createAdapter();
    const audit = createAuditLog({
      statePath: auditPath,
    });
    const store = createCandidateStore({
      adapter,
      auditLog: audit,
      statePath,
    });
    const admitted = createCandidate({
      id: "candidate-kept",
    });
    const stale = createCandidate({
      createdAt: "2020-01-01T00:00:00.000Z",
      id: "candidate-dropped",
    });
    store.add(admitted, createOperation(admitted));
    store.add(stale, createOperation(stale));

    await rescanPendingCandidates({
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      candidates: store,
    });

    const entries = createAuditLog({
      statePath: auditPath,
    })
      .list()
      .filter((entry) => entry.action === "candidate-rescan");
    expect(entries).toHaveLength(2);
    expect(
      entries
        .map((entry) => entry.metadata)
        .sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId))),
    ).toEqual([
      {
        candidateId: "candidate-dropped",
        decision: "archived",
        kind: "project_decision",
        reason: "stale-candidate",
        scope: "project",
        status: "skipped",
      },
      {
        candidateId: "candidate-kept",
        decision: "stored",
        kind: "project_decision",
        reason: "admitted",
        scope: "project",
        status: "stored",
      },
    ]);
    // Bounded: the trace names candidates, it never quotes them.
    const text = readFileSync(auditPath, "utf8");
    expect(text).not.toContain(admitted.content);
    expect(text).not.toContain(stale.content);
  });

  it("archives nothing and writes nothing when the queue is empty", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      config: DEFAULT_XPI_MEMO_CONFIG,
      statePath: join(dataDir, "candidates.json"),
    });

    expect(
      await rescanPendingCandidates({
        candidates: store,
      }),
    ).toEqual({
      archived: 0,
      stored: 0,
      total: 0,
    });
    expect(operations).toHaveLength(0);
  });
  it("runs end to end across kinds, projects and states in one pass", async () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const auditPath = join(dataDir, "audit.json");
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      statePath,
    });
    const fixtures = [
      createCandidate({
        id: "candidate-gene",
        kind: "project_gene",
        targetBank: "project-a",
      }),
      createCandidate({
        id: "candidate-decision",
        kind: "project_decision",
        targetBank: "project-b",
      }),
      createCandidate({
        id: "candidate-gotcha",
        kind: "project_gotcha",
        targetBank: "project-a",
      }),
      createCandidate({
        createdAt: "2020-01-01T00:00:00.000Z",
        id: "candidate-stale",
        targetBank: "project-b",
      }),
    ];
    for (const candidate of fixtures) store.add(candidate, createOperation(candidate));
    // A record already archived before the rescan is not re-judged.
    store.archive("candidate-stale");
    store.restore("candidate-stale");

    const outcome = await rescanPendingCandidates({
      auditLog: createAuditLog({
        statePath: auditPath,
      }),
      candidates: store,
    });

    expect(outcome).toEqual({
      archived: 1,
      stored: 3,
      total: 4,
    });
    expect(operations.map((operation) => operation.kind).sort()).toEqual([
      "project_decision",
      "project_gene",
      "project_gotcha",
    ]);
    // Every write landed in its own candidate's bank, not the caller's.
    expect(operations.map((operation) => operation.targetBank).sort()).toEqual([
      "project-a",
      "project-a",
      "project-b",
    ]);
    expect(store.list()).toEqual([]);
    expect(store.listArchived().map((candidate) => candidate.id)).toEqual([
      "candidate-stale",
    ]);
  });
});
