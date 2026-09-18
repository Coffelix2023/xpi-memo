/**
 * Candidate archive acceptance (change admission-preferences-and-pending-rescan,
 * tasks 3.1-3.4): the record leaves the review queue but stays recoverable, and
 * only an expired archived record is ever deleted.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { archiveExpiry, isArchiveExpired, MS_PER_DAY } from "./candidate-archive.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import { DEFAULT_XPI_MEMO_CONFIG } from "./config.js";
import { createEvidenceRecord } from "./evidence.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import type { PendingCandidate } from "./pending-candidate.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-archive-"));
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

function createCandidate(overrides: Partial<PendingCandidate> = {}): PendingCandidate {
  const evidence = createEvidenceRecord({
    confidence: 0.9,
    provenance: "session:42",
    source: "reviewed conversation",
    type: "explicit-user-statement",
  });
  return {
    conflictState: "none",
    content: "Use pnpm for repository scripts.",
    createdAt: new Date().toISOString(),
    evidence,
    evidenceSummary: `${evidence.type} from ${evidence.source} (${evidence.provenance})`,
    id: "candidate-1",
    kind: "project_decision",
    rationale: "Needs explicit confirmation.",
    reason: "project-decision",
    status: "pending",
    targetBank: "project-p-0123456789ab",
    targetScope: "project",
    ...overrides,
  };
}

function createOperation(
  content = "Use pnpm for repository scripts.",
): T1MemoryOperation {
  return {
    confidence: 0.9,
    content,
    dataDir: "/tmp/xpi-memo-archive",
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

describe("candidate archive arithmetic", () => {
  it("stamps an expiry that many days out", () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    const expiry = archiveExpiry(now, 30);
    expect(Date.parse(expiry) - now.getTime()).toBe(30 * MS_PER_DAY);
  });

  it("only expires records that are archived and past their deadline", () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    const past = new Date(now.getTime() - MS_PER_DAY).toISOString();
    const future = new Date(now.getTime() + MS_PER_DAY).toISOString();

    expect(
      isArchiveExpired(
        createCandidate({
          expiresAt: past,
          status: "archived",
        }),
        now,
      ),
    ).toBe(true);
    expect(
      isArchiveExpired(
        createCandidate({
          expiresAt: future,
          status: "archived",
        }),
        now,
      ),
    ).toBe(false);
    // A pending record is never expired, whatever stamps it carries.
    expect(
      isArchiveExpired(
        createCandidate({
          expiresAt: past,
          status: "pending",
        }),
        now,
      ),
    ).toBe(false);
    // Missing or unreadable deadlines keep the record: expiry deletes data.
    expect(
      isArchiveExpired(
        createCandidate({
          status: "archived",
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isArchiveExpired(
        createCandidate({
          expiresAt: "not-a-date",
          status: "archived",
        }),
        now,
      ),
    ).toBe(false);
  });
});

describe("candidate archive lifecycle", () => {
  it("reads a record written before archiving existed as pending", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const candidate = createCandidate();
    // The shape a pre-archive version wrote: no status, no archive stamps.
    const { status: _status, ...legacyCandidate } = candidate;
    writeFileSync(
      statePath,
      JSON.stringify({
        audit: [],
        version: 1,
        candidates: {
          [candidate.id]: {
            candidate: legacyCandidate,
            operation: createOperation(),
          },
        },
      }),
    );
    const { adapter } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath,
    });

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.status).toBe("pending");
    expect(store.listArchived()).toHaveLength(0);
  });

  it("moves an archived record out of the review queue and back", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      config: {
        ...DEFAULT_XPI_MEMO_CONFIG,
        archiveRetentionDays: 30,
      },
      statePath,
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());

    const archived = store.archive(candidate.id);

    expect(archived).toEqual({
      reason: "candidate-archived",
      status: "skipped",
    });
    expect(store.list()).toEqual([]);
    const [held] = store.listArchived();
    expect(held?.status).toBe("archived");
    expect(held?.archivedAt).toBeDefined();
    // The retention deadline is stamped from the configured window.
    const stamped = Date.parse(held?.expiresAt ?? "");
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThan(Date.now());
    // Archiving never writes T1 and never drops the content.
    expect(operations).toHaveLength(0);
    expect(readFileSync(statePath, "utf8")).toContain(candidate.content);

    const restored = store.restore(candidate.id);

    expect(restored).toEqual({
      reason: "candidate-restored",
      status: "skipped",
    });
    expect(store.listArchived()).toEqual([]);
    const [back] = store.list();
    expect(back?.status).toBe("pending");
    // The retention window restarts, so a recovered record is not instantly
    // past its deadline if it is archived again.
    expect(back?.expiresAt).toBeUndefined();
    expect(back?.archivedAt).toBeUndefined();
  });

  it("purges only expired archived records, and audits each one", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const { adapter, operations } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath,
    });
    const expired = createCandidate({
      id: "candidate-expired",
    });
    const fresh = createCandidate({
      id: "candidate-fresh",
    });
    const queued = createCandidate({
      id: "candidate-queued",
    });
    store.add(expired, createOperation());
    store.add(fresh, createOperation());
    store.add(queued, createOperation());
    store.archive(expired.id);
    store.archive(fresh.id);

    const now = new Date();
    // The archive stamps a future deadline, so rewind only the expired record.
    const stored = JSON.parse(readFileSync(statePath, "utf8"));
    stored.candidates[expired.id].candidate.expiresAt = new Date(
      now.getTime() - MS_PER_DAY,
    ).toISOString();
    stored.candidates[fresh.id].candidate.expiresAt = new Date(
      now.getTime() + MS_PER_DAY,
    ).toISOString();
    writeFileSync(statePath, JSON.stringify(stored));
    const reloaded = createCandidateStore({
      adapter,
      statePath,
    });

    const removed = reloaded.purgeExpired(now);

    expect(removed).toEqual([
      "candidate-expired",
    ]);
    expect(reloaded.listArchived().map((item) => item.id)).toEqual([
      "candidate-fresh",
    ]);
    // A pending record is untouched by expiry.
    expect(reloaded.list().map((item) => item.id)).toEqual([
      "candidate-queued",
    ]);
    // Deleting a candidate is not deleting a memory.
    expect(operations).toHaveLength(0);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const purgeAudit = state.audit.find(
      (entry: { action: string }) => entry.action === "candidate-archive-purged",
    );
    expect(purgeAudit?.candidateId).toBe("candidate-expired");
    expect(Number.isNaN(Date.parse(purgeAudit?.timestamp ?? ""))).toBe(false);
  });

  it("is a no-op when nothing has expired", () => {
    const dataDir = createTemporaryDirectory();
    const statePath = join(dataDir, "candidates.json");
    const { adapter } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath,
    });
    const candidate = createCandidate();
    store.add(candidate, createOperation());
    store.archive(candidate.id);

    expect(store.purgeExpired()).toEqual([]);
    expect(store.listArchived()).toHaveLength(1);
  });

  it("reports a not-found result for an unknown id", () => {
    const dataDir = createTemporaryDirectory();
    const { adapter } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });

    expect(store.archive("missing")).toEqual({
      reason: "candidate-not-found",
      status: "rejected",
    });
    expect(store.restore("missing")).toEqual({
      reason: "candidate-not-found",
      status: "rejected",
    });
  });
});
