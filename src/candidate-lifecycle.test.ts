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
import { createCandidateStore } from "./candidate-lifecycle.ts";
import { createEvidenceRecord } from "./evidence.ts";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import type { PendingCandidate } from "./pending-candidate.js";

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
