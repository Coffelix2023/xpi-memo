import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import { createEventLogReader } from "./l0/event-log-reader.js";
import { createL0Coordinator } from "./l0/l0-runtime.js";
import { activateExplicitMemoryIntent } from "./memory-activation.js";
import { createMemoryIdempotencyStore } from "./memory-idempotency.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-activation-"));
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

function activationRuntime(
  dataDir: string,
  stored: T1MemoryOperation[],
  projectBank: string | null = null,
) {
  const audit = createAuditLog({
    statePath: join(dataDir, "audit.json"),
  });
  const candidates = createCandidateStore({
    adapter: adapter(stored),
    statePath: join(dataDir, "candidates.json"),
  });
  const idempotency = createMemoryIdempotencyStore({
    statePath: join(dataDir, "idempotency.json"),
  });
  const l0 = createL0Coordinator({
    dataDir,
    enabled: true,
  });
  const userEvent = l0.record("user_message", {
    source: "test-input",
    text: "test input",
  });
  const sessionId = l0.sessionId();
  if (!sessionId) throw new Error("test L0 session was not created");
  return {
    adapter: adapter(stored),
    audit,
    candidates,
    config: {
      dataDir,
      paused: false,
    },
    context: {
      dataDir,
      projectBank,
    },
    idempotency,
    l0,
    provenance: {
      eventPosition: userEvent.position,
      sessionId,
      source: "input:test-input",
    },
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

describe("explicit memory activation", () => {
  it("stores an explicit global preference directly", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored);
    const { audit, candidates } = runtime;

    const result = await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      runtime,
    );

    expect(result).toMatchObject({
      kind: "global_preference",
      scope: "global",
      status: "stored",
    });
    expect(stored).toHaveLength(1);
    expect(candidates.list()).toHaveLength(0);
    expect(audit.list().map((entry) => entry.action)).toEqual([
      "write",
    ]);
  });

  it("queues a project decision for review without storing it", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored, "project-demo");
    const { audit, candidates } = runtime;

    const result = await activateExplicitMemoryIntent(
      "We decided to keep the existing adapter.",
      runtime,
    );

    expect(result).toMatchObject({
      bank: "project-demo",
      kind: "project_decision",
      scope: "global",
      status: "candidate",
    });
    expect(stored).toHaveLength(0);
    expect(candidates.list()).toHaveLength(1);
    expect(audit.list().map((entry) => entry.action)).toEqual([
      "candidate",
    ]);
  });

  it("rejects prohibited content before storage or candidate creation", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored);
    const { audit, candidates } = runtime;

    const result = await activateExplicitMemoryIntent(
      "Please remember: prefer api_key=must-not-appear.",
      runtime,
    );

    expect(result).toMatchObject({
      kind: "global_preference",
      status: "rejected",
    });
    expect(stored).toHaveLength(0);
    expect(candidates.list()).toHaveLength(0);
    expect(audit.list()[0]?.action).toBe("rejection");
  });

  it("does not fall back to the global bank without project context", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored);
    const { audit, candidates } = runtime;

    const result = await activateExplicitMemoryIntent(
      "We decided to keep the adapter.",
      runtime,
    );

    expect(result).toEqual({
      reason: "missing-project-context",
      status: "skipped",
    });
    expect(stored).toHaveLength(0);
    expect(candidates.list()).toHaveLength(0);
    expect(audit.list()).toHaveLength(0);
  });
  it("skips repeated input within one session (idempotent capture)", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored);

    const first = await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      runtime,
    );
    const second = await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      runtime,
    );

    expect(first).toMatchObject({
      kind: "global_preference",
      status: "stored",
    });
    expect(second).toEqual({
      reason: "duplicate-content",
      status: "skipped",
    });
    expect(stored).toHaveLength(1);
    expect(runtime.candidates.list()).toHaveLength(0);
  });

  it("keeps event position in the idempotency key while coalescing duplicate content", () => {
    const dataDir = temporaryDirectory();
    const store = createMemoryIdempotencyStore({
      statePath: join(dataDir, "idempotency.json"),
    });
    const first = store.claim({
      content: "prefer concise answers",
      eventPosition: 3,
      kind: "global_preference",
      sessionId: "session-1",
      source: "test",
    });
    const sameEvent = store.claim({
      content: "prefer concise answers",
      eventPosition: 3,
      kind: "global_preference",
      sessionId: "session-1",
      source: "test",
    });
    const nextEvent = store.claim({
      content: "prefer concise answers",
      eventPosition: 4,
      kind: "global_preference",
      sessionId: "session-1",
      source: "test",
    });
    const otherKind = store.claim({
      content: "prefer concise answers",
      eventPosition: 4,
      kind: "global_workflow",
      sessionId: "session-1",
      source: "test",
    });

    expect(first.claimed).toBe(true);
    expect(sameEvent.claimed).toBe(false);
    expect(nextEvent.claimed).toBe(false);
    expect(nextEvent.key).not.toBe(first.key);
    expect(otherKind.claimed).toBe(true);
    expect(store.list()).toHaveLength(2);
  });

  it("does not duplicate a governed project candidate on event replay", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored, "project-demo");
    const text = "We decided to keep the existing adapter.";

    const first = await activateExplicitMemoryIntent(text, runtime);
    const second = await activateExplicitMemoryIntent(text, runtime);

    expect(first).toMatchObject({
      kind: "project_decision",
      status: "candidate",
    });
    expect(second).toEqual({
      reason: "duplicate-content",
      status: "skipped",
    });
    expect(runtime.candidates.list()).toHaveLength(1);
    expect(stored).toHaveLength(0);
    const [sessionId] = readdirSync(join(dataDir, "sessions"));
    const events = await createEventLogReader({
      sessionDir: join(dataDir, "sessions", String(sessionId)),
    }).readAll();
    const candidateEvent = events.find((event) => event.type === "candidate_created");
    expect(candidateEvent).toBeDefined();
    expect(candidateEvent?.payload).toMatchObject({
      fingerprint: expect.any(String),
      source: "input:test-input",
      sourceEventPosition: 1,
      sourceSessionId: sessionId,
    });
  });

  it("records L0 provenance with fingerprints on the store path", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored);

    await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      runtime,
    );

    const [sessionId] = readdirSync(join(dataDir, "sessions"));
    const events = await createEventLogReader({
      sessionDir: join(dataDir, "sessions", String(sessionId)),
    }).readAll();
    const types = events.map((event) => event.type);
    expect(types).toContain("t1_memory_write");
    const write = events.find((event) => event.type === "t1_memory_write");
    expect(write?.payload).toMatchObject({
      bank: "default",
      evidenceType: "explicit-user-statement",
      fingerprint: expect.any(String),
      kind: "global_preference",
      scope: "global",
      source: "input:test-input",
      sourceEventPosition: 1,
      sourceSessionId: sessionId,
    });
    expect(runtime.audit.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "write",
          metadata: expect.objectContaining({
            evidenceType: "explicit-user-statement",
          }),
        }),
      ]),
    );
  });
  it("skips durable activation when L0 provenance is unavailable", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const runtime = activationRuntime(dataDir, stored);
    const withoutProvenance = {
      ...runtime,
      provenance: undefined,
    };

    const result = await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      withoutProvenance,
    );

    expect(result).toEqual({
      reason: "missing-l0-provenance",
      status: "skipped",
    });
    expect(stored).toHaveLength(0);
    expect(runtime.candidates.list()).toHaveLength(0);
    expect(runtime.audit.list()).toHaveLength(0);
  });
});
