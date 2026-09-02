/**
 * Cross-session integration test (task 8.2).
 *
 * Three sequential sessions share one isolated XPI_MEMO_DATA_DIR and walk the
 * real memory chain: explicit activation → governed candidates → candidate
 * confirmation → scoped recall. The Mnemosyne backend is mocked at the CLI
 * boundary; every persistence layer (audit, candidates, idempotency, L0 logs)
 * is the real file-backed implementation, so state genuinely survives across
 * session instances.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAuditLog } from "./audit.js";
import type { RoutingContext } from "./banks.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import { createL0Coordinator } from "./l0/l0-runtime.js";
import { activateExplicitMemoryIntent } from "./memory-activation.js";
import { createMemoryIdempotencyStore } from "./memory-idempotency.js";
import type {
  MnemosyneAdapter,
  MnemosyneRunner,
  T1MemoryOperation,
} from "./operations.js";
import { recall } from "./recall.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-chain-"));
  directories.push(directory);
  return directory;
}

/**
 * In-memory Mnemosyne backend, sharded by target bank. The real CLI backend
 * writes project banks under <dataDir>/banks/<bank>, so the mock mirrors that
 * by materializing the bank directory on the first project write — this keeps
 * `bankExists` semantics identical to production.
 */
function backend(dataDir: string): {
  adapter: MnemosyneAdapter;
  run: MnemosyneRunner;
  storedByBank: Map<string, T1MemoryOperation[]>;
} {
  const storedByBank = new Map<string, T1MemoryOperation[]>();
  const adapter: MnemosyneAdapter = {
    store: async (operation) => {
      const list = storedByBank.get(operation.targetBank) ?? [];
      list.push(operation);
      storedByBank.set(operation.targetBank, list);
      if (operation.targetBank !== "default") {
        mkdirSync(join(dataDir, "banks", operation.targetBank), {
          recursive: true,
        });
      }
      return {
        id: `${operation.targetBank}:memory-${list.length}`,
        operation,
        output: `Stored: memory-${list.length}`,
      };
    },
  };
  const run: MnemosyneRunner = async (args, options) => {
    if (args[0] === "recall") {
      const bank = options?.bank ?? "default";
      const rows = (storedByBank.get(bank) ?? []).map((operation, index) => ({
        content: operation.content,
        id: `${operation.targetBank}:memory-${index + 1}`,
        scope: operation.scope,
        score: 0.9,
        source: `kind=${operation.kind};ev=${operation.source.evidenceType};prov=activation:explicit-user-intent;ts=${operation.source.timestamp};src=${operation.source.source}`,
      }));
      return JSON.stringify({
        results: rows,
        explain: {
          stages: [],
          embedding: {
            available: true,
          },
        },
      });
    }
    return "";
  };
  return {
    adapter,
    run,
    storedByBank,
  };
}

/** Rebuild a fresh extension-like runtime over the same dataDir (a new Pi session). */
function sessionRuntime(
  dataDir: string,
  projectBank: string | null,
  adapter: MnemosyneAdapter,
) {
  const audit = createAuditLog({
    statePath: join(dataDir, "audit.json"),
  });
  const candidates = createCandidateStore({
    adapter,
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
  const context: RoutingContext = {
    dataDir,
    projectBank,
  };
  return {
    adapter,
    audit,
    candidates,
    config: {
      dataDir,
      paused: false,
    },
    context,
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

describe("cross-session memory chain (task 8.2)", () => {
  it("captures useful T1 memory, keeps decisions governed, and recalls only eligible memory across three isolated sessions", async () => {
    const dataDir = temporaryDirectory();
    const { adapter, run, storedByBank } = backend(dataDir);

    // ── Session 1 (project A): explicit capture ──────────────────────────
    const session1 = sessionRuntime(dataDir, "project-demo-a", adapter);

    const preference = await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      session1,
    );
    expect(preference).toMatchObject({
      bank: "default",
      kind: "global_preference",
      scope: "global",
      status: "stored",
    });
    // The explicit user statement is backed by L0 provenance.
    expect(session1.audit.list().map((entry) => entry.action)).toContain("write");
    expect(
      session1.audit.list().filter((entry) => entry.action === "write")[0]?.metadata
        .evidenceType,
    ).toBe("explicit-user-statement");

    const decision = await activateExplicitMemoryIntent(
      "We decided to keep the existing adapter.",
      session1,
    );
    // A project decision is a governed candidate, never an unconfirmed write.
    expect(decision).toMatchObject({
      bank: "project-demo-a",
      kind: "project_decision",
      status: "candidate",
    });
    expect(storedByBank.get("default")?.map((operation) => operation.kind)).toEqual([
      "global_preference",
    ]);
    expect(storedByBank.get("project-demo-a")).toBeUndefined();
    expect(session1.candidates.list()).toHaveLength(1);

    // ── Session 2 (project A, same dataDir): state survives ──────────────
    const session2 = sessionRuntime(dataDir, "project-demo-a", adapter);

    // The pending candidate persists across sessions and still needs review.
    expect(session2.candidates.list()).toHaveLength(1);
    const [pending] = session2.candidates.list();
    expect(pending.kind).toBe("project_decision");
    expect(pending.targetBank).toBe("project-demo-a");

    // Confirming routes through the real candidate lifecycle into the bank.
    const confirmed = await session2.candidates.confirm(pending.id);
    expect(confirmed.status).toBe("stored");
    expect(session2.candidates.list()).toHaveLength(0);
    expect(
      storedByBank.get("project-demo-a")?.map((operation) => operation.kind),
    ).toEqual([
      "project_decision",
    ]);

    // ── Session 3 (project B): separation and eligibility ────────────────
    const session3 = sessionRuntime(dataDir, "project-demo-b", adapter);

    // project-demo-b never materialized, so recall queries only the global
    // bank — the confirmed project-A decision cannot leak into project B.
    const response = await recall(
      {
        context: session3.context,
        limit: 10,
        query: "what should we remember?",
      },
      run,
    );
    expect(response.queriedBanks).toEqual([
      "default",
    ]);
    expect(response.results.map((item) => item.kind)).toEqual([
      "global_preference",
    ]);
    expect(response.results.some((item) => item.content.includes("adapter"))).toBe(
      false,
    );

    // L0 keeps one session directory per session instance.
    expect(readdirSync(join(dataDir, "sessions"))).toHaveLength(3);
  });

  it("later sessions recall only eligible memory without re-running activation (task 8.2 recall path)", async () => {
    const dataDir = temporaryDirectory();
    const { adapter, run, storedByBank } = backend(dataDir);

    // Seed one global preference in session 1, then open a fresh session.
    const session1 = sessionRuntime(dataDir, "project-demo-a", adapter);
    await activateExplicitMemoryIntent(
      "Please remember: prefer concise answers.",
      session1,
    );
    expect(storedByBank.get("default")).toHaveLength(1);

    const session2 = sessionRuntime(dataDir, "project-demo-a", adapter);
    const response = await recall(
      {
        context: session2.context,
        limit: 5,
        query: "how should I answer?",
      },
      run,
    );
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      kind: "global_preference",
      scope: "global",
    });
  });
});
