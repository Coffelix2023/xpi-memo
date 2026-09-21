/**
 * Compatibility and identity isolation (add-mental-model-projections, tasks
 * 6.1, 6.2 and 6.4).
 *
 * Three structural properties are pinned here, at the level of the real
 * registered hooks rather than a single module:
 *
 * - 6.1 projection generation never mutates governed state: no T1 write, no
 *   candidate, no forget, no profile or Markdown-export mutation;
 * - 6.2 projection ownership follows existing routing identity, never the
 *   working directory, and never falls back across banks;
 * - 6.4 a synthesis-disabled installation needs no model, no new dependency,
 *   and no Hindsight component.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import xpiMemo from "./index.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  USER_WORKING_STYLE_ID,
} from "./mental-model/definitions.js";
import { mentalModelProjectionPath } from "./mental-model/owner.js";
import type { MnemosyneRunner } from "./operations.ts";

const SOURCE_CONTENT = "prefer one-line summaries";
const SOURCE =
  "kind=global_preference;ev=explicit-user-statement;prov=manual;ts=2026-09-21T00:00:00.000Z;src=session:s1#42";
/** Any dependency name that would mean a Hindsight runtime was adopted. */
const HINDSIGHT_PATTERN = /hindsight/i;
const PROJECT_SOURCE =
  "kind=project_decision;ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=session:s1#7";

const temporaryDirectories: string[] = [];

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

/** Create a project bank the bounded bank reader can discover. */
function seedBank(dataDir: string, bank: string): void {
  const path = join(dataDir, "banks", bank, "mnemosyne.db");
  mkdirSync(dirname(path), {
    recursive: true,
  });
  writeFileSync(path, "not-a-real-db");
}

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-compat-"));
  temporaryDirectories.push(directory);
  return directory;
}

interface Row {
  content: string;
  id: string;
  source: string;
}

interface Backend {
  /** Every mutating or targeted CLI invocation the extension made. */
  mutations: string[];
  /** Physical banks the extension routed to (recall/search/store options). */
  routedBanks: string[];
  run: MnemosyneRunner;
  storedByBank: Map<string, Row[]>;
}

function backend(banks: Record<string, Row[]>): Backend {
  const storedByBank = new Map<string, Row[]>(Object.entries(banks));
  const mutations: string[] = [];
  const routedBanks: string[] = [];
  const run: MnemosyneRunner = async (args, options) => {
    const bank = options?.bank ?? "default";
    routedBanks.push(bank);
    const command = args[0] ?? "";
    if (command === "export") {
      writeFileSync(
        args[1] as string,
        JSON.stringify({
          episodic_memory: [],
          working_memory: (storedByBank.get(bank) ?? []).map((row) => ({
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
    if (command === "stats")
      return "Episodic memory: 1\nTotal memories: 1\nWorking memory: 1\n";
    if (command === "recall")
      return JSON.stringify({
        results: (storedByBank.get(bank) ?? []).map((row) => ({
          content: row.content,
          id: row.id,
          score: 0.9,
          source: row.source,
        })),
      });
    // Anything else is a governed mutation this feature must never perform.
    mutations.push(
      [
        command,
        ...args.slice(1, 2),
      ].join(":"),
    );
    return "";
  };
  return {
    mutations,
    routedBanks,
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
  env?: NodeJS.ProcessEnv;
  projectId?: string | null;
  run: MnemosyneRunner;
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
        handler,
        name,
      });
    },
    registerCommand() {},
    registerTool() {},
  } as unknown as ExtensionAPI;
  const projectId = options.projectId === undefined ? null : options.projectId;
  xpiMemo(pi, {
    run: options.run,
    env: {
      XDG_CONFIG_HOME: options.dataDir,
      XPI_MEMO_DATA_DIR: options.dataDir,
      ...options.env,
    },
    resolveProjectIdentity: () =>
      projectId
        ? {
            id: projectId,
            label: projectId,
          }
        : null,
  });
  return {
    events,
  };
}

function ctxWithModel(count: () => void): ExtensionContext {
  const client = {
    complete: async () => {
      count();
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

function ctxWithoutModel(): ExtensionContext {
  return {
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
}

async function fire(
  events: RegisteredEvent[],
  name: string,
  context: ExtensionContext,
  event: unknown = {},
): Promise<unknown> {
  const hook = events.find((entry) => entry.name === name);
  if (!hook) throw new Error(`${name} hook not registered`);
  return hook.handler(event, context);
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

function auditActions(dataDir: string): string[] {
  const path = join(dataDir, "audit.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    entries: Array<{
      action: string;
    }>;
  };
  return parsed.entries.map((entry) => entry.action);
}

async function l0EventTypes(dataDir: string): Promise<string[]> {
  const sessionsRoot = join(dataDir, "sessions");
  if (!existsSync(sessionsRoot)) return [];
  const types: string[] = [];
  for (const sessionId of readdirSync(sessionsRoot)) {
    // biome-ignore lint/performance/noAwaitInLoops: one read per real session directory.
    const events = await createEventLogReader({
      sessionDir: join(sessionsRoot, sessionId),
    }).readAll();
    types.push(...events.map((event) => event.type));
  }
  return types;
}

function markdownSnapshot(dataDir: string): string[] {
  const root = join(dataDir, "markdown");
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    files.push(`${entry}:${readFileSync(path, "utf8")}`);
  }
  return files;
}

describe("mental-model compatibility (tasks 6.1 and 6.4)", () => {
  it("generates a projection without mutating any governed state", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    const { mutations, run, storedByBank } = backend({
      default: [
        {
          content: SOURCE_CONTENT,
          id: "memory-1",
          source: SOURCE,
        },
      ],
    });
    let modelCalls = 0;
    const { events } = loadExtension({
      dataDir: dir,
      env: {
        XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "true",
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
    });
    const ctx = ctxWithModel(() => {
      modelCalls += 1;
    });
    await fire(events, "input", ctx, {
      source: "interactive",
      text: "hello",
      type: "input",
    });
    const markdownBefore = markdownSnapshot(dir);

    await fire(events, "session_before_compact", ctx);
    const target = mentalModelProjectionPath(
      dir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    await until(() => existsSync(target));

    // The only model call is the projection synthesis itself.
    expect(modelCalls).toBe(1);
    // No governed mutation reached the CLI, and the T1 rows are byte-identical.
    expect(mutations).toEqual([]);
    expect(storedByBank.get("default")).toHaveLength(1);
    expect(existsSync(join(dir, "candidates.json"))).toBe(false);
    // No governed audit action was recorded by the projection path.
    const governed = auditActions(dir).filter((action) =>
      [
        "candidate",
        "confirmation",
        "deletion",
        "rejection",
        "write",
      ].includes(action),
    );
    expect(governed).toEqual([]);
    // L0 gained lifecycle events only; no T1 write event was emitted.
    const types = await l0EventTypes(dir);
    expect(types).toContain("mental_model_refresh");
    expect(types).not.toContain("t1_memory_write");
    expect(markdownSnapshot(dir)).toEqual(markdownBefore);
  });

  it("needs no model, no new dependency, and no Hindsight component when synthesis is off", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    const { mutations, run } = backend({
      default: [
        {
          content: SOURCE_CONTENT,
          id: "memory-1",
          source: SOURCE,
        },
      ],
    });
    const { events } = loadExtension({
      dataDir: dir,
      run,
    });
    // No model registry at all: the default wiring must still work.
    const ctx = ctxWithoutModel();
    await fire(events, "input", ctx, {
      source: "interactive",
      text: "hello",
      type: "input",
    });
    await fire(events, "before_agent_start", ctx, {
      prompt: "hello",
      type: "before_agent_start",
    });
    await fire(events, "session_shutdown", ctx, {
      type: "session_shutdown",
    });

    // Existing capture/recall path still runs; only governed mutations are 0.
    expect(mutations).toEqual([]);
    // No projection is created without synthesis, and nothing claims otherwise.
    expect(existsSync(join(dir, "mental-models"))).toBe(false);
    // The disabled default writes no lifecycle noise either.
    expect(auditActions(dir)).not.toContain("mental-model");

    // Static guard: the feature claims no Hindsight dependency anywhere.
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const declared = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ];
    expect(declared.filter((name) => HINDSIGHT_PATTERN.test(name))).toEqual([]);
  });
});

describe("mental-model identity isolation (task 6.2)", () => {
  it("keys a project projection by routing identity, not by working directory", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    seedBank(dir, "project-alpha");
    const { run, routedBanks } = backend({
      "project-alpha": [
        {
          content: "keep generated state out of T1",
          id: "memory-1",
          source: PROJECT_SOURCE,
        },
      ],
    });
    const { events } = loadExtension({
      dataDir: dir,
      projectId: "alpha",
      env: {
        XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "true",
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
    });
    const ctx = ctxWithModel(() => undefined);
    await fire(events, "input", ctx, {
      source: "interactive",
      text: "hello",
      type: "input",
    });

    // Routing identity observed by the existing recall path.
    await fire(events, "before_agent_start", ctx, {
      prompt: "restore project context decisions constraints",
      type: "before_agent_start",
    });
    expect(routedBanks).toContain("project-alpha");

    const pending = fire(events, "session_before_compact", ctx);
    const target = mentalModelProjectionPath(
      dir,
      {
        key: "project-alpha",
        scope: "project",
      },
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    ) as string;
    await until(() => existsSync(target));
    await pending;

    // The projection lives under exactly the routed bank, and no other owner
    // directory was created for either definition.
    expect(existsSync(dirname(target))).toBe(true);
    expect(existsSync(join(dir, "mental-models", "projects"))).toBe(true);
    expect(readdirSync(join(dir, "mental-models", "projects"))).toEqual([
      "project-alpha",
    ]);
  });

  it("never delivers or overwrites another project's projection", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    seedBank(dir, "project-alpha");
    seedBank(dir, "project-beta");
    const { run } = backend({
      "project-alpha": [
        {
          content: "alpha keeps generated state out of T1",
          id: "memory-1",
          source: PROJECT_SOURCE,
        },
      ],
      "project-beta": [
        {
          content: "beta keeps generated state out of T1",
          id: "memory-1",
          source: PROJECT_SOURCE,
        },
      ],
    });
    // Alpha builds a projection first.
    const alpha = loadExtension({
      dataDir: dir,
      projectId: "alpha",
      env: {
        XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "true",
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
    });
    const alphaCtx = ctxWithModel(() => undefined);
    await fire(alpha.events, "input", alphaCtx, {
      source: "interactive",
      text: "hello",
      type: "input",
    });
    await fire(alpha.events, "session_before_compact", alphaCtx);
    const alphaPath = mentalModelProjectionPath(
      dir,
      {
        key: "project-alpha",
        scope: "project",
      },
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    ) as string;
    await until(() => existsSync(alphaPath));
    const alphaBytes = readFileSync(alphaPath, "utf8");

    // Beta runs in the same data root with its own identity.
    const beta = loadExtension({
      dataDir: dir,
      projectId: "beta",
      env: {
        XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "true",
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
    });
    const betaCtx = ctxWithModel(() => undefined);
    await fire(beta.events, "input", betaCtx, {
      source: "interactive",
      text: "hello",
      type: "input",
    });
    const betaContent = (await fire(beta.events, "before_agent_start", betaCtx, {
      prompt: "restore project context decisions constraints",
      type: "before_agent_start",
    })) as {
      message?: {
        content?: string;
      };
    };
    await fire(beta.events, "session_before_compact", betaCtx);

    // No cross-project body, and alpha's record is untouched by beta's run.
    expect(betaContent?.message?.content ?? "").not.toContain(
      "The user prefers one-line summaries.",
    );
    expect(readFileSync(alphaPath, "utf8")).toBe(alphaBytes);
  });

  it("skips the project model entirely when no identity is recognized", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    const { run } = backend({
      default: [
        {
          content: SOURCE_CONTENT,
          id: "memory-1",
          source: SOURCE,
        },
      ],
    });
    const { events } = loadExtension({
      dataDir: dir,
      projectId: null,
      env: {
        XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "true",
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
    });
    const ctx = ctxWithModel(() => undefined);
    await fire(events, "input", ctx, {
      source: "interactive",
      text: "hello",
      type: "input",
    });
    await fire(events, "session_before_compact", ctx);
    const globalPath = mentalModelProjectionPath(
      dir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    await until(() => existsSync(globalPath));

    // The global model still builds; the project model has no owner and is not
    // silently rehomed into the global or a default project directory.
    expect(existsSync(join(dir, "mental-models", "projects"))).toBe(false);
    const records = JSON.parse(readFileSync(join(dir, "audit.json"), "utf8")) as {
      entries: Array<{
        metadata: Record<string, unknown>;
      }>;
    };
    const definitionIds = records.entries
      .filter((entry) => entry.metadata.outcome !== undefined)
      .map((entry) => entry.metadata.definitionId);
    expect(definitionIds).not.toContain(ACTIVE_PROJECT_OPERATING_MODEL_ID);
  });
});
