/**
 * Cross-session behavior evaluation (tasks 5.1 + 5.3).
 *
 * Fixed fixtures drive the same governed surfaces as production — the real
 * `input`/`before_agent_start` hooks, the real candidate lifecycle, audit log,
 * idempotency and L0 logs over one shared data directory — with the Mnemosyne
 * backend mocked at the CLI boundary. A case passes only when the memory
 * changes a later session's recall/profile/injection outcome, not merely when
 * a row exists. Environment degradation (no search backend) is asserted
 * separately so it can never masquerade as a logic pass.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import { buildEvaluationReport, type EvalCase } from "./eval-metrics.js";
import xpiMemo from "./index.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import { createMnemosyneAdapter, type MnemosyneRunner } from "./operations.js";
import { traceMemoryEvent } from "./source-trace.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-eval-"));
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

interface StoredRow {
  content: string;
  id: string;
  source: string;
  timestamp?: string;
}

/**
 * Backend mock shared by all scenarios. `failBank` simulates a store outage;
 * `unavailable` simulates a fully absent backend (environment failure).
 */
function backend(
  dataDir: string,
  unavailable = false,
): {
  run: MnemosyneRunner;
  storedByBank: Map<string, StoredRow[]>;
  failBank: (bank: string) => void;
} {
  const storedByBank = new Map<string, StoredRow[]>();
  const failedBanks = new Set<string>();
  let counter = 0;
  const run: MnemosyneRunner = async (args, options) => {
    if (unavailable) throw new Error("mnemosyne: command not found");
    const bank = options?.bank ?? "default";
    if (args[0] === "store") {
      if (failedBanks.has(bank))
        throw new Error("mnemosyne: backend storage unavailable");
      counter += 1;
      const id = `memory-${counter}`;
      const rows = storedByBank.get(bank) ?? [];
      rows.push({
        content: args[1] ?? "",
        id,
        source: args[2] ?? "",
        timestamp: new Date().toISOString(),
      });
      storedByBank.set(bank, rows);
      if (bank !== "default")
        require("node:fs").mkdirSync(join(dataDir, "banks", bank), {
          recursive: true,
        });
      return `Stored: ${id}`;
    }
    if (args[0] === "recall") {
      const rows = (storedByBank.get(bank) ?? []).map((row) => ({
        content: row.content,
        id: row.id,
        scope: "global",
        score: 0.9,
        source: row.source,
        timestamp: row.timestamp,
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
    failBank: (bank) => failedBanks.add(bank),
    run,
    storedByBank,
  };
}

interface RegisteredEvent {
  handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>;
  name: string;
}

interface RegisteredTool {
  execute: (
    id: string,
    params: Record<string, unknown>,
    x?: unknown,
    y?: unknown,
    ctx?: ExtensionContext,
  ) => Promise<{
    /** The tool's text output; `index.test.ts` reads the same field. */
    content?: Array<{
      text?: string;
    }>;
    details: Record<string, unknown>;
  }>;
  name: string;
  parameters: {
    properties?: Record<string, unknown>;
  };
}

function loadExtension(dependencies: {
  env: NodeJS.ProcessEnv;
  resolveProjectIdentity?: (cwd: string) => {
    id: string;
    label: string;
  } | null;
  run: MnemosyneRunner;
}): {
  events: RegisteredEvent[];
  tools: RegisteredTool[];
} {
  const events: RegisteredEvent[] = [];
  const tools: RegisteredTool[] = [];
  const pi = {
    on(name: string, handler: () => Promise<void>) {
      events.push({
        name,
        handler,
      });
    },
    registerCommand() {},
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
  } as unknown as ExtensionAPI;
  xpiMemo(pi, dependencies as never);
  return {
    events,
    tools,
  };
}

function createToolContext(
  cwd = "/tmp",
  options: {
    mode?: string;
    select?: string;
  } = {},
): ExtensionContext {
  const { mode = "rpc", select } = options;
  return {
    cwd,
    isError: false,
    mode,
    ui: {
      confirm: async () => false,
      notify: () => undefined,
      select: async () => select,
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  } as unknown as ExtensionContext;
}

/** Drive the real input + before_agent_start hooks like one Pi session turn. */
async function sessionTurn(
  prompt: string,
  ctx: ExtensionContext,
  events: RegisteredEvent[],
): Promise<{
  context: string | null;
  statusLines: string[];
}> {
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
  const outcome = (await beforeAgentStart.handler(
    {
      prompt,
      type: "before_agent_start",
    },
    ctx,
  )) as
    | {
        message?: {
          content?: string;
        };
      }
    | undefined;
  const content = outcome?.message?.content ?? "";
  // Hook content = status lines ("✦ …") followed by the injected context.
  const lines = content.split("\n");
  return {
    context:
      lines
        .filter((line) => !line.startsWith("✦"))
        .join("\n")
        .trim() || null,
    statusLines: lines.filter((line) => line.startsWith("✦")),
  };
}

function toolByName(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  return tool;
}

function auditEntries(dataDir: string): Array<{
  action: string;
  metadata?: Record<string, unknown>;
}> {
  if (!existsSync(join(dataDir, "audit.json"))) return [];
  return (
    JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")) as {
      entries: Array<{
        action: string;
        metadata?: Record<string, unknown>;
      }>;
    }
  ).entries;
}

async function l0Events(dataDir: string): Promise<
  Array<{
    event: import("./l0/types.js").L0Event;
    sessionId: string;
  }>
> {
  const sessions = readdirSync(join(dataDir, "sessions"));
  const perSession = await Promise.all(
    sessions.map(async (sessionId) => {
      const events = await createEventLogReader({
        sessionDir: join(dataDir, "sessions", sessionId),
      }).readAll();
      return events.map((event) => ({
        event,
        sessionId,
      }));
    }),
  );
  return perSession.flat();
}

describe("cross-session behavior evaluation fixtures (task 5.1)", () => {
  it("durable language preference survives a new session and drives injection", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      resolveProjectIdentity: () => null,
      run,
    });
    const ctxA = createToolContext();
    await sessionTurn("Please remember: prefer concise answers.", ctxA, events);
    expect(storedByBank.get("default")).toHaveLength(1);
    const oldId = storedByBank.get("default")?.[0]?.id;

    // New session: same dataDir, fresh extension instance.
    const { events: eventsB } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      resolveProjectIdentity: () => null,
      run,
    });
    const ctxB = createToolContext();
    const turn = await sessionTurn("继续上次的偏好,回答一个普通问题。", ctxB, eventsB);

    // Behavior, not storage: the memory must be injected into the agent
    // context, and the user must see a bounded status line (awareness).
    expect(turn.context).toContain("prefer concise answers.");
    const writes = (await l0Events(dataDir)).filter(
      ({ event }) => event.type === "t1_memory_write",
    );
    expect(writes[0]?.event.payload.memoryId).toBe(oldId);
  });

  it("project decision does not leak into another project's context", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const env = {
      XDG_CONFIG_HOME: dataDir,
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_RECALL_POLICY: "active",
    };
    const projectA = {
      id: "proj-a",
      label: "project-a",
    };
    const { events } = loadExtension({
      env,
      resolveProjectIdentity: () => projectA,
      run,
    });
    const ctxA = createToolContext();
    await sessionTurn("We decided to use podman for containers.", ctxA, events);

    // Confirm the candidate through the governed review surface.
    const adapter = createMnemosyneAdapter(run);
    const candidates = await import("./candidate-lifecycle.js");
    const store = candidates.createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const [pending] = store.list();
    expect(pending).toBeTruthy();
    await store.confirm(pending.id);
    expect(storedByBank.get("project-proj-a")).toHaveLength(1);

    // Project B session: project A's decision must not appear.
    const { events: eventsB } = loadExtension({
      env,
      resolveProjectIdentity: () => ({
        id: "proj-b",
        label: "project-b",
      }),
      run,
    });
    const ctxB = createToolContext();
    const turn = await sessionTurn("继续上次的决策,继续容器配置。", ctxB, eventsB);
    expect(turn.context ?? "").not.toContain("podman");
  });

  it("unconfirmed candidate is presented as uncertain, not as confirmed fact", async () => {
    const dataDir = createTemporaryDirectory();
    const { run } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      resolveProjectIdentity: () => ({
        id: "proj-c",
        label: "project-c",
      }),
      run,
    });
    const ctx = createToolContext();
    const turn = await sessionTurn(
      "We decided to use podman for containers.",
      ctx,
      events,
    );
    // The candidate exists but was never confirmed: nothing is injected and
    // nothing reaches a bank. Uncertainty is the governed state — the
    // candidate stays pending in candidates.json and the recall block is empty.
    expect(turn.context).toBeNull();
    const recallEntries = auditEntries(dataDir).filter(
      (entry) => entry.action === "recall",
    );
    expect(recallEntries.length).toBeGreaterThan(0);
    expect(recallEntries.every((entry) => entry.metadata?.resultCount === 0)).toBe(
      true,
    );
    const candidates = await import("./candidate-lifecycle.js");
    const store = candidates.createCandidateStore({
      adapter: createMnemosyneAdapter(run),
      statePath: join(dataDir, "candidates.json"),
    });
    expect(store.list()).toHaveLength(1);
    expect(existsSync(join(dataDir, "banks"))).toBe(false);
  });

  it("explicit correction demotes the old preference within the next session", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const env = {
      XDG_CONFIG_HOME: dataDir,
      // The correction asserts the explicit confirmation path.
      XPI_MEMO_AUTO_ADMIT: "false",
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_RECALL_POLICY: "active",
    };
    const { events, tools } = loadExtension({
      env,
      resolveProjectIdentity: () => null,
      run,
    });
    const ctx = createToolContext();
    await sessionTurn("Please remember: prefer concise answers.", ctx, events);
    const oldId = storedByBank.get("default")?.[0]?.id;

    // Governed correction through the remember tool's supersedes path.
    // ctx.mode=tui routes through chooseCandidateAction → user confirms "Store".
    const remember = toolByName(tools, "xpi_memo_remember");
    const result = await remember.execute(
      "correction-1",
      {
        content: "Always reply in English.",
        kind: "global_preference",
        supersedes: oldId,
      },
      undefined,
      undefined,
      createToolContext("/tmp", {
        mode: "tui",
        select: "Store",
      }),
    );
    expect(result.details.status).toBe("stored");
    const newId = result.details.id as string;

    // Next session: the corrected value dominates; the old one carries a
    // supersededBy link instead of disappearing.
    const { events: eventsB } = loadExtension({
      env,
      resolveProjectIdentity: () => null,
      run,
    });
    const turn = await sessionTurn("继续上次的偏好。", createToolContext(), eventsB);
    expect(turn.context).toContain("reply in English.");
    expect(turn.context).not.toContain("reply in Chinese.");

    const correction = auditEntries(dataDir).find(
      (entry) =>
        entry.action === "feedback" && entry.metadata?.feedback === "correction",
    );
    expect(correction?.metadata).toMatchObject({
      replacementMemoryId: newId,
      supersedes: oldId,
      targetMemoryId: oldId,
    });
  });

  it("an auto-admitted correction records the supersession too", async () => {
    // The sibling test above pins `XPI_MEMO_AUTO_ADMIT=false` so the correction
    // travels the confirmation path. This one leaves the admission defaults
    // alone, so the same call is admitted automatically — and that path used to
    // return before writing the correction, leaving the old memory live and
    // unmarked: `applyFeedbackToRecall` needs `supersedes` and
    // `replacementMemoryId` on one feedback entry, and `summarizeFeedback`
    // counts the same pair.
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const env = {
      XDG_CONFIG_HOME: dataDir,
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_RECALL_POLICY: "active",
    };
    const { events, tools } = loadExtension({
      env,
      resolveProjectIdentity: () => null,
      run,
    });
    const ctx = createToolContext();
    await sessionTurn("Please remember: prefer concise answers.", ctx, events);
    const oldId = storedByBank.get("default")?.[0]?.id;

    const remember = toolByName(tools, "xpi_memo_remember");
    const result = await remember.execute(
      "correction-1",
      {
        content: "Always reply in English.",
        kind: "global_preference",
        supersedes: oldId,
      },
      undefined,
      undefined,
      createToolContext(),
    );
    // No user in the loop: the admission decision is what stored it.
    expect(result.details.status).toBe("stored");
    const newId = result.details.id as string;
    const correction = auditEntries(dataDir).find(
      (entry) =>
        entry.action === "feedback" && entry.metadata?.feedback === "correction",
    );
    expect(correction?.metadata).toMatchObject({
      replacementMemoryId: newId,
      supersedes: oldId,
      targetMemoryId: oldId,
    });

    // And the pair is what recall reads: the old memory comes back marked
    // rather than unmarked, which is the whole point of recording it.
    const recall = toolByName(tools, "xpi_memo_recall");
    const recalled = await recall.execute(
      "recall-1",
      {
        query: "concise answers",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const results = JSON.parse(recalled.content?.[0]?.text ?? "{}").results ?? [];
    const superseded = results.find((item: { id?: string }) => item.id === oldId);
    expect(superseded?.supersededBy).toBe(newId);
  });

  it("no-hit recall stays a bounded, user-visible no-op", async () => {
    const dataDir = createTemporaryDirectory();
    const { run } = backend(dataDir);
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      resolveProjectIdentity: () => null,
      run,
    });
    const turn = await sessionTurn("继续上次的进度。", createToolContext(), events);
    expect(turn.context).toBeNull();
    const recallEntry = auditEntries(dataDir).find(
      (entry) => entry.action === "recall",
    );
    expect(recallEntry?.metadata).toMatchObject({
      resultCount: 0,
    });
  });

  it("backend fallback degrades to ripgrep-style rows and marks retrieval fallback", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, storedByBank } = backend(dataDir);
    const env = {
      XDG_CONFIG_HOME: dataDir,
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_RECALL_POLICY: "active",
    };
    const { events } = loadExtension({
      env,
      resolveProjectIdentity: () => null,
      run,
    });
    await sessionTurn(
      "Please remember: prefer concise answers.",
      createToolContext(),
      events,
    );
    expect(storedByBank.get("default")).toHaveLength(1);

    // Fallback semantics (5.1): the audit recall entry carries the
    // backend/fallback projection the metric layer reads; details carry
    // searchBackend. Mock runs as mnemosyne → not a fallback.
    const recallTool = toolByName(toolsList(dataDir, run), "xpi_memo_recall");
    const response = await recallTool.execute(
      "recall-fallback",
      {
        query: "prefer concise",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(response.details).toMatchObject({
      backendState: "backend-queried-with-hits",
    });
    const lastRecall = [
      ...auditEntries(dataDir),
    ]
      .reverse()
      .find((entry) => entry.action === "recall")?.metadata;
    expect(lastRecall).toMatchObject({
      backend: "mnemosyne",
      fallback: false,
      resultCount: 1,
    });
  });

  it("write failure keeps the session usable and reports failure, not success", async () => {
    const dataDir = createTemporaryDirectory();
    const { run, failBank } = backend(dataDir);
    failBank("default");
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      resolveProjectIdentity: () => null,
      run,
    });
    const ctx = createToolContext();
    await sessionTurn("Please remember: prefer concise answers.", ctx, events);
    const failed = (await l0Events(dataDir)).filter(
      ({ event }) => event.type === "memory_failed",
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]?.event.payload.outcome).toBe("failed");
    // Session continues: audit recorded the attempt, no phantom success.
    expect(auditEntries(dataDir).some((entry) => entry.action === "write")).toBe(false);
  });
});

function toolsList(dataDir: string, run: MnemosyneRunner): RegisteredTool[] {
  return loadExtension({
    env: {
      XDG_CONFIG_HOME: dataDir,
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_RECALL_POLICY: "active",
    },
    resolveProjectIdentity: () => null,
    run,
  }).tools;
}

describe("cross-session integration coverage (task 5.3)", () => {
  it("links later adoption back to the originating memory operation via source trace", async () => {
    const dataDir = createTemporaryDirectory();
    const { run } = backend(dataDir);
    const env = {
      XDG_CONFIG_HOME: dataDir,
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_RECALL_POLICY: "active",
    };
    const { events } = loadExtension({
      env,
      resolveProjectIdentity: () => null,
      run,
    });
    const stored = await sessionTurn(
      "Please remember: prefer concise answers.",
      createToolContext(),
      events,
    );
    expect(stored.statusLines.length).toBeGreaterThan(0);

    const writes = (await l0Events(dataDir)).filter(
      ({ event }) => event.type === "t1_memory_write",
    );
    expect(writes).toHaveLength(1);
    const firstWrite = writes[0];
    if (!firstWrite) throw new Error("no t1_memory_write event found");
    const trace = traceMemoryEvent(
      [
        {
          payload: firstWrite.event.payload,
          position: firstWrite.event.position,
          timestamp: firstWrite.event.timestamp,
          type: firstWrite.event.type,
          version: firstWrite.event.version,
        },
      ],
      firstWrite.sessionId,
      firstWrite.event.position,
    );
    expect(trace?.provenance.source).toBe("input:interactive");
    expect(trace?.kind).toBe("global_preference");
    if (trace?.target !== "memory") throw new Error("trace is not a memory trace");
    expect(trace.sessionId).toBeTruthy();
  });

  it("metrics separate backend-unavailable runs from logic failures", () => {
    const cases: EvalCase[] = [
      {
        adopted: true,
        correctionSessions: null,
        falseMemory: false,
        id: "pref-survives",
        leaked: false,
        useful: true,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: 1,
        falseMemory: false,
        id: "correction-latency",
        leaked: false,
        useful: false,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: null,
        falseMemory: false,
        id: "scope-isolation",
        leaked: false,
        useful: false,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: null,
        falseMemory: true,
        id: "candidate-not-fact",
        leaked: false,
        useful: false,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: null,
        falseMemory: false,
        id: "no-hit-bounded",
        leaked: false,
        useful: false,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: null,
        falseMemory: false,
        id: "write-failure-reported",
        leaked: false,
        useful: false,
        userAware: true,
      },
    ];
    const report = buildEvaluationReport(cases, true);
    expect(report.backendAvailable).toBe(true);
    expect(report.cases).toBe(6);
    // No leaks, one false presentation, one-session correction, 1/6 utility.
    expect(report.metrics.scopeLeakRate).toBe(0);
    expect(report.metrics.falseMemoryRate).toBeCloseTo(1 / 6);
    expect(report.metrics.correctionLatency).toBe(1);
    expect(report.metrics.memoryUtility).toBeCloseTo(1 / 6);
    expect(report.metrics.preferenceAccuracy).toBeCloseTo(1 / 6);
    expect(report.metrics.userAwareness).toBe(1);
  });
});

function surfaceEnv(dataDir: string): Record<string, string> {
  return {
    XDG_CONFIG_HOME: dataDir,
    XPI_MEMO_DATA_DIR: dataDir,
    XPI_MEMO_RECALL_POLICY: "active",
  };
}

async function seedPreference(
  env: Record<string, string>,
  run: MnemosyneRunner,
): Promise<void> {
  const { events } = loadExtension({
    env,
    resolveProjectIdentity: () => null,
    run,
  });
  await sessionTurn(
    "Please remember: prefer concise answers.",
    createToolContext(),
    events,
  );
}

function createTuiContext(statuses: string[]): ExtensionContext {
  const base = createToolContext("/tmp", {
    mode: "tui",
  });
  return {
    ...base,
    ui: {
      ...base.ui,
      setStatus: (_key: string, value: string) => {
        statuses.push(value);
      },
    },
  } as unknown as ExtensionContext;
}

async function startTuiSession(
  events: RegisteredEvent[],
  statuses: string[],
): Promise<void> {
  const sessionStart = events.find(({ name }) => name === "session_start");
  if (!sessionStart) throw new Error("session_start hook not registered");
  await sessionStart.handler(
    {
      type: "session_start",
    },
    createTuiContext(statuses),
  );
}

/** True when a footer line carries a lifecycle event (base line has no separator). */
function hasEventLine(statuses: readonly string[]): boolean {
  return statuses.some((value) => value.includes(" · "));
}

describe("runtime surface rollback (task 6.4)", () => {
  it("disabling profile injection keeps recall usable and drops only the profile block", async () => {
    const dataDir = createTemporaryDirectory();
    const { run } = backend(dataDir);
    await seedPreference(surfaceEnv(dataDir), run);

    const { events: onEvents } = loadExtension({
      env: surfaceEnv(dataDir),
      resolveProjectIdentity: () => null,
      run,
    });
    const onTurn = await sessionTurn(
      "继续上次的偏好,回答一个普通问题。",
      createToolContext(),
      onEvents,
    );
    expect(onTurn.context).toContain("<user-preference-profile>");

    const { events: offEvents } = loadExtension({
      env: {
        ...surfaceEnv(dataDir),
        XPI_MEMO_PROFILE_INJECTION: "false",
      },
      resolveProjectIdentity: () => null,
      run,
    });
    const offTurn = await sessionTurn(
      "继续上次的偏好,回答一个普通问题。",
      createToolContext(),
      offEvents,
    );
    expect(offTurn.context).toContain("prefer concise answers.");
    expect(offTurn.context ?? "").not.toContain("<user-preference-profile>");
  });

  it("disabling passive feedback keeps recall usable and stops usage writes", async () => {
    const dataDir = createTemporaryDirectory();
    const { run } = backend(dataDir);
    await seedPreference(surfaceEnv(dataDir), run);
    const passiveEntries = () =>
      auditEntries(dataDir).filter(
        (entry) =>
          entry.action === "feedback" && entry.metadata?.feedbackMode === "passive",
      );

    const { events: onEvents } = loadExtension({
      env: surfaceEnv(dataDir),
      resolveProjectIdentity: () => null,
      run,
    });
    await sessionTurn(
      "继续上次的偏好,回答一个普通问题。",
      createToolContext(),
      onEvents,
    );
    const passiveOn = passiveEntries().length;
    expect(passiveOn).toBeGreaterThan(0);

    const { events: offEvents } = loadExtension({
      env: {
        ...surfaceEnv(dataDir),
        XPI_MEMO_PASSIVE_FEEDBACK: "false",
      },
      resolveProjectIdentity: () => null,
      run,
    });
    const offTurn = await sessionTurn(
      "继续上次的偏好,回答一个普通问题。",
      createToolContext(),
      offEvents,
    );
    expect(offTurn.context).toContain("prefer concise answers.");
    expect(passiveEntries()).toHaveLength(passiveOn);
  });

  it("disabling event presentation keeps memory writes working without footer events", async () => {
    const onDir = createTemporaryDirectory();
    const onBackend = backend(onDir);
    const onStatuses: string[] = [];
    const { events: onEvents } = loadExtension({
      env: surfaceEnv(onDir),
      run: onBackend.run,
      resolveProjectIdentity: () => null,
    });
    await startTuiSession(onEvents, onStatuses);
    await sessionTurn(
      "Please remember: prefer concise answers.",
      createToolContext(),
      onEvents,
    );
    expect(hasEventLine(onStatuses)).toBe(true);

    const offDir = createTemporaryDirectory();
    const offBackend = backend(offDir);
    const offStatuses: string[] = [];
    const { events: offEvents } = loadExtension({
      run: offBackend.run,
      env: {
        ...surfaceEnv(offDir),
        XPI_MEMO_EVENT_PRESENTATION: "false",
      },
      resolveProjectIdentity: () => null,
    });
    await startTuiSession(offEvents, offStatuses);
    await sessionTurn(
      "Please remember: prefer concise answers.",
      createToolContext(),
      offEvents,
    );
    expect(offBackend.storedByBank.get("default")).toHaveLength(1);
    expect(hasEventLine(offStatuses)).toBe(false);
  });
});
