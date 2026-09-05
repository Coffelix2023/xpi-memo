/**
 * Activation-loop acceptance (tasks 4.1-4.4): non-TUI integration coverage
 * driven through the real registered hooks (input + before_agent_start +
 * session_shutdown), with no manual `xpi_memo_remember` call. The mnemosyne
 * CLI boundary is a shared in-memory mock; every persistence layer (audit,
 * candidates, idempotency, L0 logs) is the real file-backed implementation.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { createCandidateStore } from "./candidate-lifecycle.js";
import type { CliOptions } from "./cli.js";
import xpiMemo from "./index.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import type { OfflineExtractionRunner } from "./offline-extraction.js";
import { createMnemosyneAdapter, type MnemosyneRunner } from "./operations.js";
import { recall } from "./recall.js";

const temporaryDirectories: string[] = [];
const SOURCE_SID_PATTERN = /sid=([^;]+)/;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-activation-loop-"));
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

interface StoredRow {
  content: string;
  id: string;
  source: string;
}

/**
 * In-memory mnemosyne CLI boundary, sharded by bank. Materializes the project
 * bank directory on the first project write so `bankExists` semantics match
 * production; recall serves rows from the same map with encoded source
 * metadata so kind/scope/session decode exactly like the real CLI.
 */
function backend(dataDir: string): {
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
      if (bank !== "default")
        mkdirSync(join(dataDir, "banks", bank), {
          recursive: true,
        });
      return `Stored: ${id}`;
    }
    if (args[0] === "recall") {
      return JSON.stringify({
        results: (storedByBank.get(bank) ?? []).map((row) => ({
          content: row.content,
          id: row.id,
          scope: "global",
          score: 0.9,
          source: row.source,
        })),
      });
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
interface TestDependencies {
  env?: NodeJS.ProcessEnv;
  offlineExtractionRunner?: OfflineExtractionRunner;
  resolveProjectIdentity?: (cwd: string) => {
    id: string;
    label: string;
  } | null;
  run?: (args: string[], options?: CliOptions) => Promise<string>;
}

function loadExtension(dependencies: TestDependencies = {}): {
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
  xpiMemo(pi, dependencies);
  return {
    events,
  };
}

function createToolContext(
  options: { cwd?: string; mode?: string } = {},
): ExtensionContext {
  const { cwd = "/tmp", mode = "rpc" } = options;
  return {
    cwd,
    mode,
    ui: {
      confirm: async () => false,
      notify: () => undefined,
      select: async () => undefined,
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  } as unknown as ExtensionContext;
}

/** Drive the real `input` + `before_agent_start` hooks with one shared ctx. */
async function captureThroughHooks(
  prompt: string,
  ctx: ExtensionContext,
  events: RegisteredEvent[],
): Promise<void> {
  const input = events.find(({ name }) => name === "input");
  const beforeAgentStart = events.find(({ name }) => name === "before_agent_start");
  if (!input || !beforeAgentStart) throw new Error("activation hooks not registered");
  await input.handler(
    {
      source: "interactive",
      text: prompt,
      type: "input",
    },
    ctx,
  );
  await beforeAgentStart.handler(
    {
      prompt,
      type: "before_agent_start",
    },
    ctx,
  );
}

async function l0Events(dataDir: string): Promise<
  Array<{
    payload: Record<string, unknown>;
    type: string;
  }>
> {
  const [sessionId] = readdirSync(join(dataDir, "sessions"));
  if (!sessionId) throw new Error("no L0 session directory found");
  return createEventLogReader({
    sessionDir: join(dataDir, "sessions", sessionId),
  }).readAll();
}

describe("activation-loop non-TUI acceptance (tasks 4.1-4.2)", () => {
  it("captures an explicit global preference via hooks, idempotently, with next-session recall (task 4.1)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const ctx = createToolContext();
    const prompt = "Please remember: prefer concise answers.";

    await captureThroughHooks(prompt, ctx, events);

    // Direct store into the global bank, no candidate.
    expect(storedByBank.get("default")).toHaveLength(1);
    expect(storedByBank.get("default")?.[0]?.source).toContain(
      "kind=global_preference",
    );

    // Replaying the same input in the same session must not duplicate.
    await captureThroughHooks(prompt, ctx, events);
    expect(storedByBank.get("default")).toHaveLength(1);
    expect(existsSync(join(dataDir, "candidates.json"))).toBe(false);

    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    expect(audit.map((entry: { action: string }) => entry.action)).toEqual([
      "write",
      "recall",
      "recall",
    ]);

    const eventsLog = await l0Events(dataDir);
    const writes = eventsLog.filter((event) => event.type === "t1_memory_write");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.payload).toMatchObject({
      bank: "default",
      evidenceType: "explicit-user-statement",
      fingerprint: expect.any(String),
      kind: "global_preference",
      scope: "global",
      source: "input:interactive",
      sourceEventPosition: 1,
      sourceSessionId: expect.any(String),
    });

    const injections = eventsLog.filter((event) => event.type === "memory_injected");
    expect(injections).toHaveLength(2);
    for (const injection of injections) {
      expect(injection.payload).toMatchObject({
        injectedMemoryIds: [
          "memory-1",
        ],
      });
    }

    // A later session recalls the stored preference from the shared bank.
    const response = await recall(
      {
        limit: 5,
        query: "prefer concise",
        context: {
          dataDir,
          projectBank: null,
        },
      },
      run,
    );
    expect(response.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "Please remember: prefer concise answers.",
          kind: "global_preference",
          scope: "global",
        }),
      ]),
    );
  });

  it("captures an explicit global workflow via hooks as a direct store (task 4.1)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const ctx = createToolContext();
    const prompt = "Remember this workflow: run tests before editing.";

    await captureThroughHooks(prompt, ctx, events);

    expect(storedByBank.get("default")).toHaveLength(1);
    expect(storedByBank.get("default")?.[0]?.source).toContain("kind=global_workflow");
    expect(existsSync(join(dataDir, "candidates.json"))).toBe(false);

    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    expect(audit.map((entry: { action: string }) => entry.action)).toEqual([
      "write",
    ]);

    const eventsLog = await l0Events(dataDir);
    expect(
      eventsLog.filter((event) => event.type === "t1_memory_write")[0]?.payload,
    ).toMatchObject({
      kind: "global_workflow",
      scope: "global",
    });
  });

  it("governs an explicit project decision via hooks and confirms it into the project bank (task 4.2)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const projectBank = "project-task-42";
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "task-42",
        label: "task-42-project",
      }),
    });
    const ctx = createToolContext();
    const prompt = "We decided to keep the existing adapter.";

    await captureThroughHooks(prompt, ctx, events);

    // Queued as a governed candidate; nothing written to the bank yet.
    const store = createCandidateStore({
      adapter: createMnemosyneAdapter(run),
      statePath: join(dataDir, "candidates.json"),
    });
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({
      kind: "project_decision",
      targetBank: projectBank,
      targetScope: "project",
    });
    expect(storedByBank.get(projectBank)).toBeUndefined();

    const eventsLog = await l0Events(dataDir);
    expect(
      eventsLog.filter((event) => event.type === "candidate_created")[0]?.payload,
    ).toMatchObject({
      bank: projectBank,
      candidateId: expect.any(String),
      fingerprint: expect.any(String),
      kind: "project_decision",
      scope: "project",
      source: "input:interactive",
      sourceEventPosition: 1,
      sourceSessionId: expect.any(String),
    });

    // Review/confirmation path without TUI buttons: the real candidate store
    // persists the decision into the project bank.
    const candidateId = store.list()[0]?.id;
    expect(candidateId).toBeTruthy();
    const confirmed = await store.confirm(candidateId as string);
    expect(confirmed.status).toBe("stored");
    expect(store.list()).toHaveLength(0);
    expect(storedByBank.get(projectBank)).toHaveLength(1);
    expect(storedByBank.get(projectBank)?.[0]?.source).toContain(
      "kind=project_decision",
    );

    // Later project-scoped recall returns the decision.
    const response = await recall(
      {
        limit: 5,
        query: "adapter",
        context: {
          dataDir,
          projectBank,
        },
      },
      run,
    );
    expect(response.queriedBanks).toEqual([
      projectBank,
      "default",
    ]);
    expect(response.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "We decided to keep the existing adapter.",
          kind: "project_decision",
          scope: "project",
        }),
      ]),
    );

    // Isolation: an unrelated project cannot see the decision.
    const other = await recall(
      {
        limit: 5,
        query: "adapter",
        context: {
          dataDir,
          projectBank: "project-other",
        },
      },
      run,
    );
    expect(other.queriedBanks).toEqual([
      "default",
    ]);
    expect(other.results.some((item) => item.content.includes("adapter"))).toBe(false);
  });

  it("governs project constraint and gotcha candidates with bank isolation (task 4.2)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const projectBank = "project-task-42-b";
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "task-42-b",
        label: "task-42-b-project",
      }),
    });
    const ctx = createToolContext();

    await captureThroughHooks(
      "In this repository, never add runtime dependencies.",
      ctx,
      events,
    );
    await captureThroughHooks(
      "Gotcha: this backend needs an explicit data directory.",
      ctx,
      events,
    );

    const store = createCandidateStore({
      adapter: createMnemosyneAdapter(run),
      statePath: join(dataDir, "candidates.json"),
    });
    const pending = store
      .list()
      .sort((left, right) => left.kind.localeCompare(right.kind));
    expect(pending.map((candidate) => candidate.kind)).toEqual([
      "project_constraint",
      "project_gotcha",
    ]);
    for (const candidate of pending) expect(candidate.targetScope).toBe("project");
    expect(storedByBank.get(projectBank)).toBeUndefined();

    await store.confirm(pending[0]?.id as string);
    await store.confirm(pending[1]?.id as string);
    expect(storedByBank.get(projectBank)).toHaveLength(2);

    const response = await recall(
      {
        limit: 5,
        query: "runtime dependencies",
        context: {
          dataDir,
          projectBank,
        },
      },
      run,
    );
    expect(response.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "project_constraint",
          scope: "project",
        }),
        expect.objectContaining({
          kind: "project_gotcha",
          scope: "project",
        }),
      ]),
    );
  });

  it("captures global memory in an uninitialized non-Git directory via hooks with usable recall (task 4.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const ctx = createToolContext();

    await captureThroughHooks("Please remember: prefer concise answers.", ctx, events);
    expect(storedByBank.get("default")?.[0]?.source).toContain(
      "kind=global_preference",
    );

    const response = await recall(
      {
        limit: 5,
        query: "prefer concise",
        context: {
          dataDir,
          projectBank: null,
        },
      },
      run,
    );
    expect(response.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "Please remember: prefer concise answers.",
          kind: "global_preference",
          scope: "global",
        }),
      ]),
    );
  });

  it("captures session context in an uninitialized non-Git directory via hooks with session-scoped recall (task 4.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const ctx = createToolContext();

    await captureThroughHooks(
      "For this session, remember the migration is pending.",
      ctx,
      events,
    );
    expect(storedByBank.get("default")?.[0]?.source).toContain("kind=session_context");

    // The write carries the L0 session discriminator in its source metadata
    // (task 2.3), decoupled from project identity.
    const source = storedByBank.get("default")?.[0]?.source ?? "";
    expect(source).toContain("kind=session_context");
    const sidMatch = SOURCE_SID_PATTERN.exec(source);
    expect(sidMatch?.[1]?.length).toBeGreaterThan(0);
    const [sessionDir] = readdirSync(join(dataDir, "sessions"));
    expect(sidMatch?.[1]).toBe(sessionDir);
  });

  it("rejects project memory in an uninitialized non-Git directory via hooks with L0/audit evidence and no global write (task 4.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const ctx = createToolContext();

    await captureThroughHooks("We decided to keep the existing adapter.", ctx, events);

    // Actionable rejection: no global row, no candidate, no silent global fallback.
    expect(storedByBank.get("default") ?? []).toHaveLength(0);
    expect(existsSync(join(dataDir, "candidates.json"))).toBe(false);

    // Bounded audit evidence names the rejected kind and routing state.
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    expect(audit).toEqual([
      expect.objectContaining({
        action: "rejection",
        metadata: expect.objectContaining({
          kind: "project_decision",
          reason: "missing-project-context",
          scope: "project",
          status: "routing_rejected",
        }),
      }),
    ]);
    expect(JSON.stringify(audit)).not.toContain("existing adapter");

    // L0 keeps a body-free routing_rejected event.
    const eventsLog = await l0Events(dataDir);
    expect(eventsLog.filter((event) => event.type === "routing_rejected")).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          kind: "project_decision",
          outcome: "routing_rejected",
          reason: "missing-project-context",
          scope: "project",
        }),
      }),
    ]);
  });

  it("keeps explicit capture working when offline extraction is disabled and never runs the runner (task 4.4)", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    let runnerCalls = 0;
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      offlineExtractionRunner: async () => {
        runnerCalls += 1;
        return [];
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const ctx = createToolContext();

    await captureThroughHooks("Please remember: prefer concise answers.", ctx, events);
    expect(storedByBank.get("default")).toHaveLength(1);

    const shutdown = events.find(({ name }) => name === "session_shutdown");
    if (!shutdown) throw new Error("session_shutdown hook not registered");
    await shutdown.handler(
      {
        type: "session_shutdown",
      },
      ctx,
    );
    expect(runnerCalls).toBe(0);
  });

  it("does not block the active session when offline extraction is unavailable, failing, or enabled within budgets (task 4.4)", async () => {
    const scenarios = [
      {
        label: "unavailable (no runner)",
        offlineExtractionRunner: undefined,
      },
      {
        label: "failing runner",
        offlineExtractionRunner: async () => {
          throw new Error("provider crashed");
        },
      },
      {
        label: "enabled runner",
        offlineExtractionRunner: async () => [
          {
            confidence: 0.8,
            content: "extracted project summary",
            kind: "global_preference",
            sourceReference: "l0:1",
          },
        ],
      },
    ] as const;

    for (const scenario of scenarios) {
      const dataDir = createTemporaryDirectory();
      const { run, storedByBank } = backend(dataDir);
      const { events } = loadExtension({
        env: {
          XDG_CONFIG_HOME: dataDir,
          XPI_MEMO_DATA_DIR: dataDir,
          XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "true",
        },
        ...(scenario.offlineExtractionRunner
          ? {
              offlineExtractionRunner: scenario.offlineExtractionRunner,
            }
          : {}),
        run,
        resolveProjectIdentity: () => null,
      });
      const ctx = createToolContext();

      // Explicit deterministic capture works regardless of extraction state.
      // biome-ignore lint/performance/noAwaitInLoops: 逐场景断言 shutdown 行为,失败时定位到具体场景
      await captureThroughHooks(
        "Please remember: prefer concise answers.",
        ctx,
        events,
      );
      expect(storedByBank.get("default")).toHaveLength(1);

      // Shutdown never blocks or throws.
      const shutdown = events.find(({ name }) => name === "session_shutdown");
      if (!shutdown) throw new Error("session_shutdown hook not registered");
      await expect(
        shutdown.handler(
          {
            type: "session_shutdown",
          },
          ctx,
        ),
      ).resolves.toBeUndefined();
    }
  });
});
