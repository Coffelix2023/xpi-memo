/**
 * Mental-model lifecycle wiring (add-mental-model-projections, task 3.5):
 * `session_before_compact` and `session_shutdown` both trigger a best-effort
 * refresh through the real registered hooks, and the per-session refresh
 * ledger stops the second trigger from duplicating a successful synthesis.
 *
 * The mnemosyne CLI boundary is an in-memory mock that also serves `export`,
 * the L0/audit/candidate layers are the real file-backed implementations, and
 * the model registry is a fake client whose call count is observable.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import xpiMemo from "./index.ts";
import { mentalModelProjectionPath } from "./mental-model/owner.js";
import type { MnemosyneRunner } from "./operations.js";

const temporaryDirectories: string[] = [];

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-mental-model-lifecycle-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory)
      rmSync(directory, {
        force: true,
        recursive: true,
      });
  }
});

/** Materialize the global bank file so the bounded bank reader sees it. */
function seedGlobalBank(dir: string): void {
  writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
}

async function until(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(`condition not met within ${timeoutMs}ms`);
    // biome-ignore lint/performance/noAwaitInLoops: polling a real write is the point.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

interface StoredRow {
  content: string;
  id: string;
  source: string;
}

/** Mental-model audit records written so far; empty before the file exists. */
function refreshRecords(dataDir: string): Array<{
  action: string;
  metadata: Record<string, unknown>;
}> {
  const path = join(dataDir, "audit.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    entries: Array<{
      action: string;
      metadata: Record<string, unknown>;
    }>;
  };
  return parsed.entries.filter((entry) => entry.action === "mental-model");
}
/** In-memory mnemosyne CLI: `store`, `recall`, and the `export` the bank reader needs. */
function backend(): {
  run: MnemosyneRunner;
  storedByBank: Map<string, StoredRow[]>;
} {
  const storedByBank = new Map<string, StoredRow[]>();
  let counter = 0;
  const run: MnemosyneRunner = async (args, options) => {
    const bank = options?.bank ?? "default";
    if (args[0] === "store") {
      counter += 1;
      const id = `memory-${counter}`;
      const rows = storedByBank.get(bank) ?? [];
      rows.push({
        content: args[1] ?? "",
        id,
        source: args[2] ?? "",
      });
      storedByBank.set(bank, rows);
      return `Stored: ${id}`;
    }
    if (args[0] === "export") {
      const rows = storedByBank.get(bank) ?? [];
      writeFileSync(
        args[1] as string,
        JSON.stringify({
          episodic_memory: [],
          working_memory: rows.map((row) => ({
            content: row.content,
            id: row.id,
            source: row.source,
            superseded_by: null,
            timestamp: "2026-09-21T00:00:00.000Z",
          })),
        }),
      );
      return "";
    }
    return "";
  };
  return {
    run,
    storedByBank,
  };
}

interface RegisteredEvent {
  handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>;
  name: string;
}

function loadExtension(options: {
  dataDir: string;
  run: MnemosyneRunner;
  completeCalls: () => number;
}): {
  events: RegisteredEvent[];
} {
  const events: RegisteredEvent[] = [];
  const pi = {
    on(
      name: string,
      handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>,
    ) {
      events.push({
        name,
        handler,
      });
    },
    registerCommand() {},
    registerTool() {},
  } as unknown as ExtensionAPI;
  xpiMemo(pi, {
    run: options.run,
    env: {
      XDG_CONFIG_HOME: options.dataDir,
      XPI_MEMO_DATA_DIR: options.dataDir,
      XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "true",
      XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
    },
    resolveProjectIdentity: () => null,
  });
  return {
    events,
  };
}

function ctxWithModel(completeCalls: () => void): ExtensionContext {
  const client = {
    complete: async () => {
      completeCalls();
      return {
        content: [
          {
            text: JSON.stringify({
              content: "The user prefers one-line summaries.",
              sourceIds: [
                "memory-1",
              ],
            }),
            type: "text",
          },
        ],
      };
    },
    getAll: () => [
      {
        id: "test-model",
        provider: "test",
      },
    ],
  };
  return {
    cwd: "/tmp",
    mode: "rpc",
    modelRegistry: client,
    model: {
      id: "test-model",
      provider: "test",
    },
    ui: {
      confirm: async () => false,
      notify: () => undefined,
      select: async () => undefined,
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  } as unknown as ExtensionContext;
}

function fire(
  events: RegisteredEvent[],
  name: string,
  ctx: ExtensionContext,
): Promise<unknown> | unknown {
  const hook = events.find((entry) => entry.name === name);
  if (!hook) throw new Error(`${name} hook not registered`);
  return hook.handler({}, ctx);
}

describe("mental-model lifecycle wiring (task 3.5)", () => {
  it("refreshes at compact, skips a duplicate at shutdown, and never blocks", async () => {
    const dir = dataDir();
    seedGlobalBank(dir);
    const { run, storedByBank } = backend();
    storedByBank.set("default", [
      {
        content: "prefer one-line summaries",
        id: "memory-1",
        source:
          "kind=global_preference;ev=explicit-user-statement;prov=manual;ts=2026-09-21T00:00:00.000Z;src=session:s1#42",
      },
    ]);
    let completeCalls = 0;
    const { events } = loadExtension({
      dataDir: dir,
      run,
      completeCalls: () => completeCalls,
    });
    const ctx = ctxWithModel(() => {
      completeCalls += 1;
    });

    // Establish an L0 session so the lifecycle refresh has a session id.
    const input = events.find(({ name }) => name === "input");
    if (!input) throw new Error("input hook not registered");
    await input.handler(
      {
        source: "interactive",
        text: "hello",
        type: "input",
      },
      ctx,
    );

    // Compact triggers the refresh (fire-and-forget): wait for the projection.
    await fire(events, "session_before_compact", ctx);
    const target = mentalModelProjectionPath(
      dir,
      {
        key: "global",
        scope: "global",
      },
      "user-working-style",
    ) as string;
    await until(() => existsSync(target));
    const projection = JSON.parse(readFileSync(target, "utf8"));
    expect(projection.content).toBe("The user prefers one-line summaries.");
    expect(projection.sourceIds).toEqual([
      "memory-1",
    ]);
    expect(completeCalls).toBe(1);

    // Shutdown re-runs: the digest is fresh, so no second synthesis happens.
    await fire(events, "session_shutdown", ctx);
    await until(() => completeCalls >= 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(completeCalls).toBe(1);

    // The count-only ledger exists and the projection is unchanged.
    expect(existsSync(join(dir, "mental-models", "refresh-ledger.json"))).toBe(true);
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(projection);

    // Task 5.1: both triggers left bounded, body-free lifecycle records, and
    // the outcomes tell "refreshed" apart from "no refresh needed".
    await until(() => refreshRecords(dir).length >= 2);
    const records = refreshRecords(dir);
    expect(records[0]?.metadata).toMatchObject({
      definitionId: "user-working-style",
      outcome: "refreshed",
      status: "refreshed",
      trigger: "session_before_compact",
    });
    expect(records[1]?.metadata).toMatchObject({
      outcome: "no-refresh-needed",
      status: "skipped",
      trigger: "session_shutdown",
    });
    expect(JSON.stringify(records)).not.toContain("one-line summaries");
  });

  it("records a bounded failure when synthesis is unavailable, without blocking", async () => {
    const dir = dataDir();
    seedGlobalBank(dir);
    const { run, storedByBank } = backend();
    storedByBank.set("default", [
      {
        content: "prefer one-line summaries",
        id: "memory-1",
        source:
          "kind=global_preference;ev=explicit-user-statement;prov=manual;ts=2026-09-21T00:00:00.000Z;src=session:s1#42",
      },
    ]);
    const { events } = loadExtension({
      dataDir: dir,
      run,
      completeCalls: () => 0,
    });
    // No model registry at all: the runner resolves to `unavailable`.
    const ctx = {
      cwd: "/tmp",
      mode: "rpc",
      model: undefined,
      modelRegistry: undefined,
      ui: {
        confirm: async () => false,
        notify: () => undefined,
        select: async () => undefined,
        setStatus: () => undefined,
        setWidget: () => undefined,
      },
    } as unknown as ExtensionContext;

    const input = events.find(({ name }) => name === "input");
    await input?.handler(
      {
        source: "interactive",
        text: "hello",
        type: "input",
      },
      ctx,
    );
    await fire(events, "session_shutdown", ctx);

    const target = mentalModelProjectionPath(
      dir,
      {
        key: "global",
        scope: "global",
      },
      "user-working-style",
    ) as string;
    await until(() => existsSync(target));
    const projection = JSON.parse(readFileSync(target, "utf8"));
    // A bounded failure-only record: no authoritative payload, no bodies.
    expect(projection.content).toBe("");
    expect(projection.sourceDigest).toBe("");
    expect(projection.lastAttempt).toEqual({
      at: projection.lastAttempt.at,
      failure: "runner-unavailable",
      outcome: "failed",
    });
    expect(JSON.stringify(projection)).not.toContain("prefer one-line summaries");
  });
});
