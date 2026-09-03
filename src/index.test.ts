import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type ExtensionAPI,
  initTheme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import type { CliOptions } from "./cli.ts";
import xpiMemo from "./index.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import { initializeLocalProject } from "./local-identity.ts";
import type { OfflineExtractionRunner } from "./offline-extraction.js";

interface RegisteredCommand {
  name: string;
  options: {
    description: string;
    handler: (
      args: string,
      ctx: {
        cwd: string;
        ui: {
          confirm: (title: string, message: string) => Promise<boolean>;
          notify: (message: string, level: string) => void;
        };
      },
    ) => Promise<void>;
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

const temporaryDirectories: string[] = [];
const SOURCE_SID_PATTERN = /sid=([^;]+)/;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-index-"));
  temporaryDirectories.push(directory);
  return directory;
}
function createToolContext(
  options: { confirm?: boolean; cwd?: string; mode?: string; select?: string } = {},
) {
  const { confirm = false, cwd = "/tmp", mode = "rpc", select = undefined } = options;
  return {
    cwd,
    isError: false,
    mode,
    ui: {
      confirm: async () => confirm,
      notify: () => undefined,
      select: async () => select,
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  } as unknown as Parameters<ToolDefinition["execute"]>[4];
}

function toolByName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  return tool;
}

function loadExtension(dependencies: TestDependencies = {}): {
  commands: RegisteredCommand[];
  events: RegisteredEvent[];
  tools: ToolDefinition[];
} {
  const commands: RegisteredCommand[] = [];
  const events: RegisteredEvent[] = [];
  const tools: ToolDefinition[] = [];
  const pi = {
    on(name: string, handler: () => Promise<void>) {
      events.push({
        name,
        handler,
      });
    },
    registerCommand(name: string, options: RegisteredCommand["options"]) {
      commands.push({
        name,
        options,
      });
    },
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
  } as unknown as ExtensionAPI;

  xpiMemo(pi, dependencies);
  return {
    commands,
    events,
    tools,
  };
}
interface Panel {
  handleInput(data: string): void;
  render(width: number): string[];
}

/** Mount the overlay component the way ctx.ui.custom does, with a 30-row terminal. */
function mountPanel(factory: unknown): Panel {
  initTheme("dark");
  return (
    factory as (
      tui: unknown,
      theme: unknown,
      keybindings: unknown,
      done: () => void,
    ) => Panel
  )(
    {
      requestRender: () => undefined,
      terminal: {
        rows: 30,
      },
    },
    {
      bold: (text: string) => text,
      fg: (_color: string, text: string) => text,
    },
    {
      matches: () => false,
    },
    () => undefined,
  );
}

function commandHandler(
  commands: RegisteredCommand[],
  name: string,
): (args: string, ctx: never) => Promise<void> {
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) throw new Error(`command not registered: ${name}`);
  return command.options.handler as (args: string, ctx: never) => Promise<void>;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("xpi-memo bootstrap entrypoint", () => {
  it("registers the status command and all four T1 tools exactly once", () => {
    const { commands, events, tools } = loadExtension();

    expect(commands.map(({ name }) => name)).toEqual([
      "xpi-memo",
      "xpi-memo-status",
      "xpi-memo-trace",
      "xpi-memo-export",
      "xpi-memo-init",
    ]);
    expect(tools.map(({ name }) => name)).toEqual([
      "xpi_memo_remember",
      "xpi_memo_recall",
      "xpi_memo_forget",
      "xpi_memo_sleep",
    ]);
    expect(events.map(({ name }) => name)).toEqual([
      "input",
      "tool_call",
      "tool_result",
      "session_compact",
      "session_start",
      "before_agent_start",
      "session_before_compact",
      "session_shutdown",
    ]);
  });

  it("initializes a non-Git directory with only the metadata file", async () => {
    const root = createTemporaryDirectory();
    const { commands } = loadExtension();
    const initCommand = commands.find(({ name }) => name === "xpi-memo-init");
    if (!initCommand) throw new Error("init command was not registered");
    const notifications: string[] = [];

    await initCommand.options.handler("", {
      cwd: root,
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });

    const metadataPath = join(root, ".pi", "xpi-memo", "project.json");
    expect(existsSync(metadataPath)).toBe(true);
    // only project.json exists under the repo; no SQLite/WAL/SHM
    const files = collectFiles(root);
    expect(files).toEqual([
      join(".pi", "xpi-memo", "project.json"),
    ]);
    expect(notifications.join("\n")).toContain("Initialized non-Git project identity");
  });

  it("is idempotent for an already-initialized directory", async () => {
    const root = createTemporaryDirectory();
    const { commands } = loadExtension();
    const initCommand = commands.find(({ name }) => name === "xpi-memo-init");
    if (!initCommand) throw new Error("init command was not registered");
    const notifications: string[] = [];

    await initCommand.options.handler("", {
      cwd: root,
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const metadataPath = join(root, ".pi", "xpi-memo", "project.json");
    const before = readFileSync(metadataPath, "utf8");

    notifications.length = 0;
    await initCommand.options.handler("", {
      cwd: root,
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const after = readFileSync(metadataPath, "utf8");

    expect(after).toBe(before);
    expect(notifications.join("\n")).toContain("Already initialized");
  });

  it("does not initialize inside a recognized Git project", async () => {
    const root = createTemporaryDirectory();
    const { commands } = loadExtension({
      resolveProjectIdentity: () => ({
        id: "git-project",
        label: "git-project",
      }),
    });
    const initCommand = commands.find(({ name }) => name === "xpi-memo-init");
    if (!initCommand) throw new Error("init command was not registered");
    const notifications: string[] = [];

    await initCommand.options.handler("", {
      cwd: root,
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });

    expect(existsSync(join(root, ".pi", "xpi-memo", "project.json"))).toBe(false);
    expect(notifications.join("\n")).toContain("Git project");
  });
  it("directs non-TUI users to JSON status", async () => {
    const { commands } = loadExtension();
    const consoleCommand = commands.find(({ name }) => name === "xpi-memo");
    if (!consoleCommand) throw new Error("console command was not registered");
    const notifications: string[] = [];
    await consoleCommand.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    expect(notifications[0]).toContain("/xpi-memo-status");
  });

  it("notifies a backlog digest at session start with a cooldown", async () => {
    const dataDir = createTemporaryDirectory();
    const candidates: Record<string, unknown> = {};
    for (const [id, kind] of [
      [
        "c1",
        "project_decision",
      ],
      [
        "c2",
        "global_preference",
      ],
      [
        "c3",
        "global_workflow",
      ],
    ] as const) {
      candidates[id] = {
        candidate: {
          conflictState: "none",
          content: `body-${id}`,
          createdAt: "2026-09-01T00:00:00.000Z",
          evidenceSummary: "test",
          id,
          kind,
          rationale: "test",
          reason: "high-impact-durable",
          status: "pending",
          targetBank: "default",
          targetScope: "global",
          evidence: {
            confidence: 1,
            provenance: "test",
            source: "test",
            timestamp: "2026-09-01T00:00:00.000Z",
            type: "l0-conclusion",
          },
        },
        operation: {
          content: `body-${id}`,
          kind,
          scope: "global",
          source: "test",
          targetBank: "default",
        },
      };
    }
    writeFileSync(
      join(dataDir, "candidates.json"),
      JSON.stringify({
        audit: [],
        version: 1,
        candidates,
      }),
    );
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => null,
    });
    const start = events.find(({ name }) => name === "session_start");
    if (!start) throw new Error("session_start hook not registered");
    const notifications: string[] = [];
    const context = createToolContext({
      mode: "rpc",
    });
    (
      context as {
        ui: {
          notify: (m: string) => void;
        };
      }
    ).ui.notify = (message: string) => {
      notifications.push(message);
    };
    await start.handler({}, context);
    await start.handler({}, context);
    // First start surfaces the digest; the second is throttled by the
    // 6-hour cooldown and stays silent (task 4.2).
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain("3 pending memory reviews");
    expect(notifications[0]).toContain("/xpi-memo console");
    expect(notifications[0]).not.toContain("body-c1");
  });

  it("confirms a pending candidate from the TUI console through the real candidate store", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "stats") return "Mnemosyne Stats\n\n  Total memories: 0";
      if (args[0] === "store") return "Stored: memory-42";
      return "";
    };
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => ({
        id: "console-project",
        label: "console",
      }),
      run,
    });

    // Seed the pending queue the same way the paused auto-store path does.
    writeFileSync(
      join(dataDir, "candidates.json"),
      JSON.stringify({
        audit: [],
        version: 1,
        candidates: {
          candidate: {
            candidate: {
              conflictState: "none",
              content: "Use the existing adapter boundary.",
              createdAt: "2026-08-28T00:00:00.000Z",
              evidenceSummary: "test",
              id: "candidate",
              kind: "project_decision",
              rationale: "test",
              reason: "project-decision",
              status: "pending",
              targetBank: "project-console-project",
              targetScope: "global",
              evidence: {
                confidence: 1,
                provenance: "test",
                source: "test",
                timestamp: "2026-08-28T00:00:00.000Z",
                type: "explicit-user-statement",
              },
            },
            operation: {
              content: "Use the existing adapter boundary.",
              kind: "project_decision",
              scope: "global",
              source: "test",
              targetBank: "project-console-project",
            },
          },
        },
      }),
    );

    let panel: Panel | undefined;
    const selections: string[] = [];
    await commandHandler(commands, "xpi-memo")("", {
      cwd: "/tmp",
      mode: "tui",
      ui: {
        confirm: async () => true,
        custom: async (factory: unknown) => {
          panel = mountPanel(factory);
          return undefined;
        },
        notify: () => undefined,
        async select(title: string) {
          selections.push(title);
          return "Store";
        },
        setStatus: () => undefined,
      },
    } as never);
    if (!panel) throw new Error("console panel was not mounted");

    panel.handleInput("2");
    const rendered = panel.render(70).join("\n");
    // SelectList truncates the label to its primary column width.
    expect(rendered).toContain("Decision · project-con");
    expect(rendered.toLowerCase()).not.toContain("delete");

    panel.handleInput("\r");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(selections[0]?.split("\n")[0]).toBe(
      "Store project_decision in project-console-project?",
    );
    expect(calls.map(([command]) => command)).toContain("store");
    expect(
      JSON.parse(readFileSync(join(dataDir, "candidates.json"), "utf8")).candidates,
    ).toEqual({});
  });

  it("blocks paused automatic storage but retains pending candidates", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "Stored: should-not-run";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_PAUSED: "true",
      },
      run,
      resolveProjectIdentity: () => ({
        id: "paused-project",
        label: "paused",
      }),
    });

    const stored = await toolByName(tools, "xpi_memo_remember").execute(
      "paused-store",
      {
        content: "Keep this preference.",
        kind: "global_preference",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    // Agent tool input is verified-tool-result evidence, so a global
    // preference becomes a governed candidate instead of a direct write;
    // with T1 paused it queues in the review inbox (mode=rpc: no dialog).
    expect(stored.details).toMatchObject({
      status: "candidate",
    });
    expect(calls).toEqual([]);

    const candidate = await toolByName(tools, "xpi_memo_remember").execute(
      "paused-candidate",
      {
        content: "Use the project adapter.",
        kind: "project_decision",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(candidate.details).toMatchObject({
      status: "candidate",
    });
    expect(
      JSON.parse(readFileSync(join(dataDir, "candidates.json"), "utf8")).candidates,
    ).not.toEqual({});
  });

  it("routes agent remember calls through the candidate inbox", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: Array<{
      args: string[];
      options: CliOptions | undefined;
    }> = [];
    const run = async (args: string[], options?: CliOptions): Promise<string> => {
      calls.push({
        args,
        options,
      });
      return args[0] === "store" ? "Stored: memory-123" : "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember",
      {
        content: "Prefer tests before implementation.",
        kind: "global_preference",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const details = result.details as Record<string, unknown>;

    // Agent tool input is model-constructed content (verified-tool-result),
    // so governance queues it for human confirmation instead of storing.
    expect(details).toMatchObject({
      bank: "default",
      kind: "global_preference",
      scope: "global",
      status: "candidate",
    });
    expect(calls).toEqual([]);
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8"));
    expect(audit.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "candidate",
          metadata: expect.objectContaining({
            evidenceType: "verified-tool-result",
          }),
        }),
      ]),
    );
    const [sessionId] = readdirSync(join(dataDir, "sessions"));
    const events = await createEventLogReader({
      sessionDir: join(dataDir, "sessions", sessionId),
    }).readAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            evidenceType: "verified-tool-result",
          }),
          type: "candidate_created",
        }),
      ]),
    );
  });

  it("keeps explicit remember working when the offline extraction runner fails", async () => {
    const dataDir = createTemporaryDirectory();
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "true",
      },
      // The runner is present but broken: it always rejects.
      offlineExtractionRunner: async () => {
        throw new Error("provider down");
      },
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember",
      {
        content: "Prefer tests before implementation.",
        kind: "global_preference",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    // Deterministic explicit capture must remain functional while the
    // offline extraction provider is failing (task 3.4).
    expect(result.details).toMatchObject({
      status: "candidate",
    });
    expect(
      JSON.parse(readFileSync(join(dataDir, "candidates.json"), "utf8")).candidates,
    ).not.toEqual({});
  });

  it("coalesces repeated direct remember calls using tool provenance", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return args[0] === "store" ? "Stored: memory-1" : "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const remember = toolByName(tools, "xpi_memo_remember");
    const context = createToolContext();
    const params = {
      content: "Prefer tests before implementation.",
      kind: "global_preference",
    } as const;

    const first = await remember.execute(
      "remember-1",
      params,
      undefined,
      undefined,
      context,
    );
    const second = await remember.execute(
      "remember-2",
      params,
      undefined,
      undefined,
      context,
    );

    expect(first.details).toMatchObject({
      status: "candidate",
    });
    expect(second.details).toMatchObject({
      reason: "duplicate-content",
      status: "skipped",
    });
    expect(calls.filter(([command]) => command === "store")).toHaveLength(0);
    expect(
      JSON.parse(readFileSync(join(dataDir, "idempotency.json"), "utf8")).entries,
    ).toHaveLength(1);
  });

  it("coalesces automatic activation with an explicit remember call", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return args[0] === "store" ? "Stored: memory-1" : "";
    };
    const { events, tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "assist",
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const input = events.find(({ name }) => name === "input");
    const beforeAgentStart = events.find(({ name }) => name === "before_agent_start");
    if (!input || !beforeAgentStart) throw new Error("activation hooks not registered");
    const context = createToolContext();
    const prompt = "Please remember: prefer concise answers.";

    await input.handler(
      {
        source: "interactive",
        text: prompt,
        type: "input",
      },
      context,
    );
    await beforeAgentStart.handler(
      {
        prompt,
        type: "before_agent_start",
      },
      context,
    );
    const explicit = await toolByName(tools, "xpi_memo_remember").execute(
      "explicit-remember",
      {
        content: "Please remember: prefer concise answers.",
        kind: "global_preference",
      },
      undefined,
      undefined,
      context,
    );

    expect(explicit.details).toMatchObject({
      reason: "duplicate-content",
      status: "skipped",
    });
    expect(calls.filter(([command]) => command === "store")).toHaveLength(1);
    expect(
      JSON.parse(readFileSync(join(dataDir, "idempotency.json"), "utf8")).entries,
    ).toHaveLength(1);
  });
  it("coalesces automatic activation with explicit remember for a candidate", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return args[0] === "store" ? "Stored: should-not-run" : "";
    };
    const { events, tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "assist",
      },
      run,
      resolveProjectIdentity: () => ({
        id: "project-test",
        label: "test-project",
      }),
    });
    const input = events.find(({ name }) => name === "input");
    const beforeAgentStart = events.find(({ name }) => name === "before_agent_start");
    if (!input || !beforeAgentStart) throw new Error("activation hooks not registered");
    const context = createToolContext();
    const prompt = "We decided to keep the existing adapter.";

    await input.handler(
      {
        source: "interactive",
        text: prompt,
        type: "input",
      },
      context,
    );
    await beforeAgentStart.handler(
      {
        prompt,
        type: "before_agent_start",
      },
      context,
    );
    const explicit = await toolByName(tools, "xpi_memo_remember").execute(
      "explicit-project-remember",
      {
        content: prompt,
        kind: "project_decision",
      },
      undefined,
      undefined,
      context,
    );

    expect(explicit.details).toMatchObject({
      reason: "duplicate-content",
      status: "skipped",
    });
    expect(calls.filter(([command]) => command === "store")).toHaveLength(0);
    const candidates = JSON.parse(
      readFileSync(join(dataDir, "candidates.json"), "utf8"),
    ).candidates;
    expect(Object.keys(candidates)).toHaveLength(1);
  });

  it("recalls bounded T1 memory and records the recall event", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: Array<{
      args: string[];
      options: CliOptions | undefined;
    }> = [];
    const run = async (args: string[], options?: CliOptions): Promise<string> => {
      calls.push({
        args,
        options,
      });
      if (args[0] === "recall") {
        return JSON.stringify({
          explain: {
            stages: [],
            embedding: {
              available: true,
            },
          },
          results: [
            {
              content: "Prefer tests before implementation.",
              id: "memory-123",
              scope: "global",
              score: 0.9,
              source:
                "kind=global_preference;ev=explicit-user-statement;prov=pi;ts=2026-01-01T00%3A00%3A00.000Z;src=user",
            },
          ],
        });
      }
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_recall").execute(
      "recall",
      {
        limit: 1,
        query: "what do we prefer?",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const details = result.details as Record<string, unknown>;
    const text = result.content[0];

    expect(details).toMatchObject({
      resultCount: 1,
      status: "recalled",
      queriedBanks: [
        "default",
      ],
    });
    expect(text?.type).toBe("text");
    expect(text && "text" in text ? text.text : "").toContain(
      "Prefer tests before implementation.",
    );
    expect(calls[0]).toMatchObject({
      args: [
        "recall",
        "what do we prefer?",
        "1",
        "--explain",
        "--json",
      ],
      options: {
        dataDir,
      },
    });
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).toContain(
      '"action": "recall"',
    );
  });

  it("reports queried banks on empty recall results", async () => {
    const dataDir = createTemporaryDirectory();
    const run = async (): Promise<string> =>
      JSON.stringify({
        results: [],
      });
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_recall").execute(
      "recall",
      {
        query: "nothing matches this",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const details = result.details as Record<string, unknown>;

    expect(details).toMatchObject({
      resultCount: 0,
      status: "recalled",
      queriedBanks: [
        "default",
      ],
    });
  });

  it("records automatic recall with backend, result count, and injected count (task 5.6)", async () => {
    const dataDir = createTemporaryDirectory();
    const run = async (args: string[]): Promise<string> => {
      if (args[0] !== "recall") return "";
      return JSON.stringify({
        explain: {
          embedding: {
            available: true,
          },
        },
        results: [
          {
            content: "Prefer concise answers.",
            id: "m1",
            importance: 0.9,
            scope: "global",
            score: 0.9,
            source:
              "kind=global_preference;ev=explicit-user-statement;prov=pi;ts=2026-01-01T00%3A00%3A00.000Z;src=user",
          },
        ],
      });
    };
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const beforeAgentStart = events.find(({ name }) => name === "before_agent_start");
    if (!beforeAgentStart) throw new Error("before_agent_start hook not registered");
    const context = createToolContext();
    const result = await beforeAgentStart.handler(
      {
        prompt: "what do you prefer?",
        type: "before_agent_start",
      },
      context,
    );
    expect(result).not.toBeUndefined();
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    const recallEntry = audit.find(
      (entry: { action: string }) => entry.action === "recall",
    );
    expect(recallEntry).toBeDefined();
    expect(recallEntry.metadata).toMatchObject({
      backend: "mnemosyne",
      injectedCount: 1,
      resultCount: 1,
      status: "recalled",
    });
  });

  it("records an empty recall from an executed backend without injectedCount (task 5.6)", async () => {
    const dataDir = createTemporaryDirectory();
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_RECALL_POLICY: "active",
      },
      resolveProjectIdentity: () => null,
      run: async (args) =>
        args[0] === "recall"
          ? JSON.stringify({
              results: [],
            })
          : "",
    });
    const beforeAgentStart = events.find(({ name }) => name === "before_agent_start");
    if (!beforeAgentStart) throw new Error("before_agent_start hook not registered");
    const context = createToolContext();
    const result = await beforeAgentStart.handler(
      {
        prompt: "continue the task",
        type: "before_agent_start",
      },
      context,
    );
    // Backend ran but returned nothing: no memory block, no injectedCount.
    expect(result).toBeUndefined();
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    const recallEntry = audit.find(
      (entry: { action: string }) => entry.action === "recall",
    );
    expect(recallEntry?.metadata).toMatchObject({
      backend: "mnemosyne",
      resultCount: 0,
      status: "recalled",
    });
    expect(recallEntry?.metadata.injectedCount).toBeUndefined();
  });
  it("rejects project memory in an uninitialized non-Git directory with guidance and no global write", async () => {
    const dataDir = createTemporaryDirectory();
    const root = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
    });

    for (const kind of [
      "project_decision",
      "project_constraint",
      "project_gene",
      "project_gotcha",
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: 逐 kind 断言拒绝语义,失败时定位到具体 kind
      const result = await toolByName(tools, "xpi_memo_remember").execute(
        "remember-project",
        {
          content: `Test content for ${kind}.`,
          kind,
        },
        undefined,
        undefined,
        createToolContext({
          cwd: root,
        }),
      );
      const details = result.details as Record<string, unknown>;
      expect(details).toMatchObject({
        reason: "project-identity-required",
        scope: "project",
        status: "routing_rejected",
      });
      const text = result.content[0];
      const message = text && "text" in text ? text.text : "";
      expect(message).toContain("/xpi-memo-init");
      expect(message).toContain("Git");
    }

    // no candidate and no T1 write for any of the four kinds
    expect(calls).toEqual([]);
    expect(existsSync(join(dataDir, "candidates.json"))).toBe(false);
    // Task 3.1: routing rejection is observable — audit records carry the
    // reason, kind, scope, identity state, and routing_rejected status,
    // and L0 emits a body-free routing_rejected event.
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    const rejectionEntries = audit.filter(
      (entry: { action: string }) => entry.action === "rejection",
    );
    expect(rejectionEntries).toHaveLength(4);
    for (const entry of rejectionEntries) {
      expect(entry.metadata).toMatchObject({
        identity: "none",
        reason: "project-identity-required",
        scope: "project",
        status: "routing_rejected",
      });
      expect(JSON.stringify(entry.metadata)).not.toContain("Test content");
    }
    const l0Sessions = readdirSync(join(dataDir, "sessions"));
    const events = await createEventLogReader({
      sessionDir: join(dataDir, "sessions", String(l0Sessions[0])),
    }).readAll();
    const routingRejected = events.filter((event) => event.type === "routing_rejected");
    expect(routingRejected).toHaveLength(4);
    for (const event of routingRejected) {
      expect(event.payload).toMatchObject({
        identity: "none",
        outcome: "routing_rejected",
        reason: "project-identity-required",
        scope: "project",
      });
      expect(JSON.stringify(event.payload)).not.toContain("Test content");
    }
  });

  it("captures session context in an uninitialized non-Git directory and isolates it by session (task 2.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const root = createTemporaryDirectory();
    const calls: string[][] = [];
    let sessionId = "";
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "recall") {
        return JSON.stringify({
          results: [
            {
              content: "current session context",
              id: "s1",
              scope: "session",
              score: 0.9,
              source: `kind=session_context;ev=verified-tool-result;prov=pi%3Axpi_memo_remember;ts=2026-01-01T00%3A00%3A00.000Z;src=test;sid=${sessionId}`,
            },
            {
              content: "other session context",
              id: "s2",
              scope: "session",
              score: 0.9,
              source:
                "kind=session_context;ev=verified-tool-result;prov=pi%3Axpi_memo_remember;ts=2026-01-01T00%3A00%3A00.000Z;src=test;sid=other-session",
            },
          ],
        });
      }
      return args[0] === "store" ? "Stored: memory-123" : "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });

    const stored = await toolByName(tools, "xpi_memo_remember").execute(
      "remember",
      {
        content: "For this session, remember the migration is pending.",
        kind: "session_context",
      },
      undefined,
      undefined,
      createToolContext({
        cwd: root,
      }),
    );
    const details = stored.details as Record<string, unknown>;
    // Decoupled from project identity: stored into the global bank with
    // session scope; no project identity required (task 2.3).
    expect(details).toMatchObject({
      bank: "default",
      kind: "session_context",
      scope: "session",
      status: "stored",
    });
    expect(existsSync(join(dataDir, "banks"))).toBe(false);

    // The write carries the L0 session discriminator in its source metadata.
    const storeCall = calls.find((args) => args[0] === "store");
    const source = storeCall?.[2] ?? "";
    const sidMatch = SOURCE_SID_PATTERN.exec(source);
    sessionId = sidMatch?.[1] ?? "";
    expect(sessionId.length).toBeGreaterThan(0);

    // Current-session recall surfaces the session row with explicit session
    // scope; an unrelated session's context is never injected.
    const recalled = await toolByName(tools, "xpi_memo_recall").execute(
      "recall",
      {
        limit: 10,
        query: "migration",
      },
      undefined,
      undefined,
      createToolContext({
        cwd: root,
      }),
    );
    const text = recalled.content[0];
    const payload = text && "text" in text ? JSON.parse(text.text) : {};
    const contents =
      (payload.results as Array<{
        content?: string;
        scope?: string;
      }>) ?? [];
    expect(contents.some((item) => item.content === "current session context")).toBe(
      true,
    );
    expect(contents.some((item) => item.content === "other session context")).toBe(
      false,
    );
    const sessionRow = contents.find(
      (item) => item.content === "current session context",
    );
    expect(sessionRow?.scope).toBe("session");
  });

  it("returns actionable text and degraded records when the T1 backend store fails (task 3.2)", async () => {
    const dataDir = createTemporaryDirectory();
    const run = async (args: string[]): Promise<string> => {
      if (args[0] === "store") throw new Error("mnemosyne store exploded");
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-store-fail",
      {
        content: "session note that must not leak",
        kind: "session_context",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const details = result.details as Record<string, unknown>;
    expect(details.status).toBe("error");
    const text = result.content[0];
    const message = text && "text" in text ? text.text : "";
    // Task 3.2: no generic "Memory write failed." — the response names the
    // backend and the actionable next step.
    expect(message).not.toBe("Memory write failed.");
    expect(message).toContain("mnemosyne");
    expect(message).toContain("xpi_memo");
    // Task 3.1: degraded storage failure is observable in audit + L0,
    // without the memory body.
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    const fallback = audit.find(
      (entry: { action: string }) => entry.action === "fallback",
    );
    expect(fallback?.metadata).toMatchObject({
      identity: "none",
      outcome: "degraded",
      status: "degraded",
    });
    expect(JSON.stringify(fallback?.metadata)).not.toContain("must not leak");
    const [sessionId] = readdirSync(join(dataDir, "sessions"));
    const events = await createEventLogReader({
      sessionDir: join(dataDir, "sessions", sessionId),
    }).readAll();
    const failed = events.find((event) => event.type === "memory_failed");
    expect(failed?.payload).toMatchObject({
      identity: "none",
      outcome: "degraded",
      phase: "backend",
    });
    expect(JSON.stringify(failed?.payload)).not.toContain("must not leak");
  });

  it("routes project memory to the project bank after explicit local initialization", async () => {
    const dataDir = createTemporaryDirectory();
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
    });

    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-initialized",
      {
        content: "Use the initialized project boundary.",
        kind: "project_decision",
      },
      undefined,
      undefined,
      createToolContext({
        cwd: root,
      }),
    );
    const details = result.details as Record<string, unknown>;

    // non-TUI: queued as a candidate, targeted at the local project bank
    expect(details).toMatchObject({
      scope: "project",
      status: "candidate",
    });
    expect(calls).toEqual([]);
    expect(readFileSync(join(dataDir, "candidates.json"), "utf8")).toContain(
      "project-",
    );
  });
  it("queues a project decision as a candidate in non-TUI mode", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "store") return "Stored: decision-123";
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "project-test",
        label: "test-project",
      }),
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-decision",
      {
        content: "Use the existing adapter boundary.",
        kind: "project_decision",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const details = result.details as Record<string, unknown>;

    expect(details).toMatchObject({
      bank: "project-project-test",
      kind: "project_decision",
      scope: "project",
      status: "candidate",
    });
    expect(calls).toEqual([]);
    expect(readFileSync(join(dataDir, "candidates.json"), "utf8")).toContain(
      "project-project-test",
    );
  });
  it("stores a project decision when Store is chosen in TUI mode", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "store") return "Stored: decision-123";
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "project-test",
        label: "test-project",
      }),
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-decision",
      {
        content: "Use the existing adapter boundary.",
        kind: "project_decision",
      },
      undefined,
      undefined,
      createToolContext({
        mode: "tui",
        select: "Store",
      }),
    );
    const details = result.details as Record<string, unknown>;

    expect(details).toMatchObject({
      bank: "project-project-test",
      kind: "project_decision",
      scope: "project",
      status: "stored",
    });
    expect(calls.map(([command]) => command)).toEqual([
      "bank",
      "store",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).toContain(
      '"action": "confirmation"',
    );
  });
  it("rejects a candidate when Reject is chosen in TUI mode", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "Stored: should-not-run";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "project-test",
        label: "test-project",
      }),
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-decision",
      {
        content: "Use the existing adapter boundary.",
        kind: "project_decision",
      },
      undefined,
      undefined,
      createToolContext({
        mode: "tui",
        select: "Reject",
      }),
    );
    const details = result.details as Record<string, unknown>;

    expect(details).toMatchObject({
      status: "rejected",
    });
    expect(calls).toEqual([]);
    expect(
      JSON.parse(readFileSync(join(dataDir, "candidates.json"), "utf8")).candidates,
    ).toEqual({});
  });

  it("keeps a pending candidate when Later is chosen in TUI mode", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "Stored: should-not-run";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "project-test",
        label: "test-project",
      }),
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-decision",
      {
        content: "Use the existing adapter boundary.",
        kind: "project_decision",
      },
      undefined,
      undefined,
      createToolContext({
        mode: "tui",
        select: "Later",
      }),
    );
    const details = result.details as Record<string, unknown>;

    expect(details).toMatchObject({
      kind: "project_decision",
      status: "candidate",
    });
    expect(calls).toEqual([]);
    const persisted = JSON.parse(
      readFileSync(join(dataDir, "candidates.json"), "utf8"),
    ) as {
      candidates: Record<
        string,
        {
          candidate: {
            kind: string;
          };
        }
      >;
    };
    const [entry] = Object.values(persisted.candidates);
    expect(entry?.candidate.kind).toBe("project_decision");
  });

  it("rejects prohibited content before the auto-store path", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "Stored: should-not-exist";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-secret",
      {
        content: "api_key=must-not-store",
        kind: "global_preference",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    const details = result.details as Record<string, unknown>;

    expect(details).toMatchObject({
      reason: "prohibited-content:secret",
      status: "rejected",
    });
    expect(calls).toEqual([]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).not.toContain(
      "must-not-store",
    );
  });

  it("executes sleep only after explicit authorization", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "--help") return "Commands:\n  sleep Run consolidation";
      return "";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const sleep = toolByName(tools, "xpi_memo_sleep");

    const unauthorized = await sleep.execute(
      "sleep-unauthorized",
      {
        authorized: false,
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(unauthorized.details).toMatchObject({
      mode: "disabled",
      reason: "sleep-disabled-by-default",
      status: "rejected",
    });
    const unauthorizedText = unauthorized.content[0];
    const unauthorizedMessage =
      unauthorizedText && "text" in unauthorizedText ? unauthorizedText.text : "";
    // Task 3.4: unauthorized sleep stays rejected and reports disabled mode.
    expect(unauthorizedMessage).not.toContain("Sleep completed");
    expect(calls).toEqual([]);

    const authorized = await sleep.execute(
      "sleep-authorized",
      {
        authorized: true,
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(authorized.details).toMatchObject({
      mode: "disabled",
      reason: "sleep-mode-not-configured",
      status: "rejected",
    });
    const authorizedText = authorized.content[0];
    const authorizedMessage =
      authorizedText && "text" in authorizedText ? authorizedText.text : "";
    // Task 5.1: authorized sleep without a configured mode fails closed with
    // a visible reason and never probes or runs the CLI.
    expect(authorizedMessage).toContain("sleep-mode-not-configured");
    expect(authorizedMessage).not.toContain("Sleep completed");
    expect(calls).toEqual([]);
    const auditJson = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8"));
    const sleepEntry = auditJson.entries.find(
      (entry: { action: string }) => entry.action === "sleep-authorization",
    );
    // Task 3.4: audit records the actual execution mode.
    expect(sleepEntry?.metadata.mode).toBeDefined();
  });

  it("executes an explicitly configured session-model fallback and names the actual mode (task 5.2/5.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "--help") return "Commands:\n  sleep Run consolidation";
      return "Consolidation complete";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODE: "session-model",
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const sleep = toolByName(tools, "xpi_memo_sleep");
    const result = await sleep.execute(
      "sleep-session",
      {
        authorized: true,
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(result.details).toMatchObject({
      mode: "session-model",
      reason: "sleep-executed",
      status: "executed",
    });
    expect(calls).toEqual([
      [
        "--help",
      ],
      [
        "sleep",
      ],
    ]);
  });

  it("executes an explicitly configured mechanical fallback and names the actual mode (task 5.2/5.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "--help") return "Commands:\n  sleep Run consolidation";
      return "Consolidation complete";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODE: "mechanical",
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const sleep = toolByName(tools, "xpi_memo_sleep");
    const result = await sleep.execute(
      "sleep-mechanical",
      {
        authorized: true,
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(result.details).toMatchObject({
      mode: "mechanical",
      reason: "sleep-executed",
      status: "executed",
    });
    expect(calls).toEqual([
      [
        "--help",
      ],
      [
        "sleep",
      ],
    ]);
  });

  it("does not modify memory when sleep mode is disabled (task 5.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODE: "disabled",
      },
      resolveProjectIdentity: () => null,
      run: async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
    });
    const sleep = toolByName(tools, "xpi_memo_sleep");
    const result = await sleep.execute(
      "sleep-disabled",
      {
        authorized: true,
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(result.details).toMatchObject({
      mode: "disabled",
      reason: "sleep-mode-not-configured",
      status: "rejected",
    });
    expect(calls).toEqual([]);
    // One-shot authorization is still required: no sleep ever ran and no
    // memory row was created (audit records only the rejected authorization).
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")).entries;
    expect(audit).toEqual([
      expect.objectContaining({
        action: "sleep-authorization",
        metadata: expect.objectContaining({
          mode: "disabled",
          reason: "sleep-mode-not-configured",
          status: "rejected",
        }),
      }),
    ]);
  });

  it("requires explicit sleep authorization in the tool schema", () => {
    const { tools } = loadExtension();
    const sleep = tools.find((tool) => tool.name === "xpi_memo_sleep");
    if (!sleep) throw new Error("sleep tool is not registered");
    const properties = (
      sleep.parameters as {
        properties?: Record<string, unknown>;
      }
    ).properties;

    expect(properties).toHaveProperty("authorized");
  });
  it("requires an explicit kind in the remember tool schema", () => {
    const { tools } = loadExtension();
    const remember = tools.find((tool) => tool.name === "xpi_memo_remember");
    if (!remember) throw new Error("remember tool is not registered");
    const parameters = remember.parameters as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(parameters.required).toContain("kind");
    expect(parameters.properties?.kind).toMatchObject({
      anyOf: expect.any(Array),
    });
  });
  it("rejects an unknown remember kind with no audit write", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      return "Stored: should-not-run";
    };
    const { tools } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const result = await toolByName(tools, "xpi_memo_remember").execute(
      "remember-unknown-kind",
      {
        content: "Some content.",
        kind: "not-a-real-kind",
      },
      undefined,
      undefined,
      createToolContext(),
    );
    expect(result.details).toMatchObject({
      status: "error",
    });
    expect(calls).toEqual([]);
    expect(existsSync(join(dataDir, "audit.json"))).toBe(false);
  });
  it("reports real stats and pending candidates without creating a project bank", async () => {
    const dataDir = createTemporaryDirectory();
    const run = async (args: string[]): Promise<string> => {
      if (args[0] === "stats")
        return "Mnemosyne Stats\n\n  Total memories: 7\n  Working memory: 5\n  Episodic memory: 2";
      return "";
    };
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => ({
        id: "status-project",
        label: "status-project",
      }),
      run,
    });
    writeFileSync(
      join(dataDir, "candidates.json"),
      JSON.stringify({
        audit: [],
        version: 1,
        candidates: {
          candidate: {
            operation: {},
            candidate: {
              conflictState: "none",
              content: "Use the existing adapter boundary.",
              createdAt: "2026-08-28T00:00:00.000Z",
              evidenceSummary: "test",
              id: "candidate",
              kind: "project_decision",
              rationale: "test",
              reason: "project-decision",
              status: "pending",
              targetBank: "project-status-project",
              targetScope: "global",
              evidence: {
                confidence: 1,
                provenance: "test",
                source: "test",
                timestamp: "2026-08-28T00:00:00.000Z",
                type: "explicit-user-statement",
              },
            },
          },
        },
      }),
    );
    const notifications: string[] = [];
    const statusCommand = commands.find(({ name }) => name === "xpi-memo-status");
    if (!statusCommand) throw new Error("status command was not registered");
    await statusCommand.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const status = JSON.parse(notifications[0] ?? "{}");
    expect(status.counts).toEqual({
      global: 7,
      project: null,
      session: null,
    });
    expect(status.pendingCandidates).toBe(1);
    expect(status).toMatchObject({
      diskBytes: null,
      paused: false,
      todayStored: 0,
    });
    // Task 3.3: fallback now reflects real degraded state (false here, no degraded audit).
    expect(status.fallback).toBe(false);
    expect(status.recentEntries).toBeDefined();
    expect(status.storage).toMatchObject({
      dataDir: dataDir,
    });
    expect(status.retrieval).toEqual({
      embeddingAvailable: null,
      mode: "hybrid",
    });
    expect(run).toBeDefined();
  });

  it("reports the configured sleep mode and capability state in status (task 5.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === "--help") return "Commands:\n  sleep Run consolidation";
      return "";
    };
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODE: "session-model",
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const command = commands.find(({ name }) => name === "xpi-memo-status");
    if (!command) throw new Error("status command was not registered");
    const notifications: string[] = [];
    await command.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    expect(notifications).toHaveLength(1);
    const status = JSON.parse(notifications[0] ?? "{}");
    expect(status.sleep).toMatchObject({
      enabled: true,
      mode: "session-model",
      state: "READY",
    });
    // The configured mode triggers the capability probe.
    expect(calls).toContainEqual([
      "--help",
    ]);
  });

  it("reports SLEEP_DISABLED in status when no sleep mode is configured (task 5.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => null,
      run: async (args: string[]) => {
        calls.push(args);
        return "";
      },
    });
    const command = commands.find(({ name }) => name === "xpi-memo-status");
    if (!command) throw new Error("status command was not registered");
    const notifications: string[] = [];
    await command.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const status = JSON.parse(notifications[0] ?? "{}");
    expect(status.sleep).toMatchObject({
      enabled: false,
      mode: "disabled",
      reason: "sleep-mode-not-configured",
      state: "SLEEP_DISABLED",
    });
    // No configured mode: the CLI sleep probe is never triggered.
    expect(calls.some((args) => args[0] === "--help")).toBe(false);
  });
  it("reports UNAVAILABLE when a sleep mode is configured but the CLI is missing (task 7.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODE: "mechanical",
      },
      resolveProjectIdentity: () => null,
      run: async (args: string[]) => {
        calls.push(args);
        return "";
      },
    });
    const command = commands.find(({ name }) => name === "xpi-memo-status");
    if (!command) throw new Error("status command was not registered");
    const notifications: string[] = [];
    await command.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const status = JSON.parse(notifications[0] ?? "{}");
    expect(status.sleep).toMatchObject({
      enabled: true,
      mode: "none",
      reason: "sleep-command-unavailable",
      sleepCommandSupported: false,
      state: "UNAVAILABLE",
    });
  });
  it("reports orphan project banks read-only in status (task 6.4)", async () => {
    const dataDir = createTemporaryDirectory();
    mkdirSync(join(dataDir, "banks", "project-orphan"), {
      recursive: true,
    });
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => ({
        id: "current",
        label: "current-project",
      }),
      run: async () => "",
    });
    const command = commands.find(({ name }) => name === "xpi-memo-status");
    if (!command) throw new Error("status command was not registered");
    const notifications: string[] = [];
    await command.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const status = JSON.parse(notifications[0] ?? "{}");
    expect(status.orphans).toEqual([
      {
        bank: "project-orphan",
        reason: "no matching project identity in the local registry",
      },
    ]);
    // The orphan bank directory is preserved (read-only report).
    expect(existsSync(join(dataDir, "banks", "project-orphan"))).toBe(true);
  });
  it("exports project memory to .pi/memory/ via the export command (task 6.1)", async () => {
    const dataDir = createTemporaryDirectory();
    const root = createTemporaryDirectory();
    const run = async (args: string[]): Promise<string> => {
      if (args[0] === "export" && args[1]) {
        const source =
          "kind=project_decision;ev=verified-tool-result;prov=pi;ts=2026-01-01T00%3A00%3A00.000Z;src=test";
        writeFileSync(
          args[1],
          JSON.stringify({
            mnemosyne_export: {
              version: "1.3",
            },
            working_memory: [
              {
                content: "we chose TypeScript",
                id: "memory-21",
                importance: 0.9,
                source,
                timestamp: "2026-01-01T00:00:00.000Z",
              },
            ],
          }),
        );
      }
      return "";
    };
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => ({
        id: "demo",
        label: "demo-project",
      }),
    });
    const command = commands.find(({ name }) => name === "xpi-memo-export");
    if (!command) throw new Error("export command was not registered");
    const notifications: string[] = [];
    await command.options.handler("--repo", {
      cwd: root,
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    const markdown = readFileSync(
      join(root, ".pi", "memory", "project_decision.md"),
      "utf8",
    );
    expect(markdown).toContain("we chose TypeScript");
    expect(markdown).toContain("memory `memory-21`");
    expect(notifications[0]).toContain("Exported 1 file(s)");
  });

  it("re-imports repo-export entries as governed candidates (task 6.3)", async () => {
    const dataDir = createTemporaryDirectory();
    const root = createTemporaryDirectory();
    mkdirSync(join(root, ".pi", "memory"), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".pi", "memory", "project_decision.md"),
      "# Decisions\n\n- keep the adapter\n  <sub>memory `m-99` · kind `project_decision` · scope `project` · source `` · updated ``</sub>\n",
    );
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => ({
        id: "demo",
        label: "demo-project",
      }),
      run: async () => "",
    });
    const command = commands.find(({ name }) => name === "xpi-memo-export");
    if (!command) throw new Error("export command was not registered");
    const notifications: string[] = [];
    await command.options.handler("--repo --reimport", {
      cwd: root,
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });
    expect(notifications[0]).toContain("Re-imported 1 candidate(s)");
    const candidates = JSON.parse(
      readFileSync(join(dataDir, "candidates.json"), "utf8"),
    ).candidates;
    expect(Object.keys(candidates)).toHaveLength(1);
  });
  it("reports fixed tier ownership without triggering memory operations", async () => {
    const { commands } = loadExtension();
    const command = commands.find(({ name }) => name === "xpi-memo-status");
    if (!command) throw new Error("status command was not registered");
    const notifications: string[] = [];

    await command.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });

    expect(notifications).toHaveLength(1);
    const status = JSON.parse(notifications[0] ?? "{}");
    expect(status.tiers).toEqual({
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    });
    expect(status.sleep).toMatchObject({
      dedicatedModelSupported: false,
      enabled: false,
    });
    expect(status.recall.scope).toBe("global-only");
  });

  it("traces a stored memory to its L0 session event (task 6.2)", async () => {
    const dataDir = createTemporaryDirectory();
    const sessionDir = join(dataDir, "sessions", "trace-session");
    mkdirSync(sessionDir, {
      recursive: true,
    });
    // JSONL line matching the L0 writer's serialized shape.
    const line = JSON.stringify({
      position: 3,
      timestamp: "2026-08-28T00:00:00.000Z",
      type: "t1_memory_write",
      version: 1,
      payload: {
        bank: "project-trace-project",
        content: "private body must stay out of trace",
        kind: "project_decision",
        source: "input:user",
        sourceEventPosition: 2,
        sourceSessionId: "source-session",
      },
    });
    writeFileSync(join(sessionDir, "events.jsonl"), `${line}\n`);

    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => ({
        id: "trace-project",
        label: "trace-project",
      }),
    });
    const command = commands.find(({ name }) => name === "xpi-memo-trace");
    if (!command) throw new Error("trace command was not registered");
    const notifications: string[] = [];

    await command.options.handler("--session trace-session --position 3", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });

    expect(notifications).toHaveLength(1);
    const rendered = notifications[0] ?? "";
    expect(rendered).toContain("target: memory");
    expect(rendered).toContain("kind: Decision (project_decision)");
    expect(rendered).toContain("session: trace-session");
    expect(rendered).toContain("position: 3");
    expect(rendered).toContain("source event: session source-session @ position 2");
    // Body-free trace: the memory body never leaves the log.
    expect(rendered).not.toContain("private body");
  });

  it("traces a pending candidate with its review state (task 6.2)", async () => {
    const dataDir = createTemporaryDirectory();
    const sessionDir = join(dataDir, "sessions", "candidate-session");
    mkdirSync(sessionDir, {
      recursive: true,
    });
    const createdLine = JSON.stringify({
      position: 7,
      timestamp: "2026-08-28T00:00:00.000Z",
      type: "candidate_created",
      version: 1,
      payload: {
        candidateId: "candidate-1",
        kind: "project_constraint",
        source: "tool_call",
        sourceEventPosition: 6,
        sourceSessionId: "source-session",
      },
    });
    writeFileSync(join(sessionDir, "events.jsonl"), `${createdLine}\n`);
    writeFileSync(
      join(dataDir, "candidates.json"),
      JSON.stringify({
        audit: [],
        version: 1,
        candidates: {
          "candidate-1": {
            operation: {},
            candidate: {
              conflictState: "none",
              content: "candidate body stays hidden",
              createdAt: "2026-08-28T00:00:00.000Z",
              evidenceSummary: "test",
              id: "candidate-1",
              kind: "project_constraint",
              rationale: "test",
              reason: "project-decision",
              status: "pending",
              targetBank: "project-trace-project",
              targetScope: "session",
              evidence: {
                confidence: 1,
                provenance: "test",
                source: "test",
                timestamp: "2026-08-28T00:00:00.000Z",
                type: "explicit-user-statement",
              },
            },
          },
        },
      }),
    );

    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      resolveProjectIdentity: () => ({
        id: "trace-project",
        label: "trace-project",
      }),
    });
    const command = commands.find(({ name }) => name === "xpi-memo-trace");
    if (!command) throw new Error("trace command was not registered");
    const notifications: string[] = [];

    await command.options.handler("--candidate candidate-1", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message) {
          notifications.push(message);
        },
      },
    });

    expect(notifications).toHaveLength(1);
    const rendered = notifications[0] ?? "";
    expect(rendered).toContain("target: candidate");
    expect(rendered).toContain("review state: pending");
    expect(rendered).toContain("source event: session source-session @ position 6");
    // Candidate body stays out of the trace.
    expect(rendered).not.toContain("candidate body");
  });

  it("includes the doctor state and read-only evidence in status output", async () => {
    const dataDir = createTemporaryDirectory();
    const run = async (args: string[]): Promise<string> =>
      args[0] === "stats"
        ? "Episodic memory: 0\nTotal memories: 0\nWorking memory: 0\n"
        : "";
    const { commands } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      run,
      resolveProjectIdentity: () => null,
    });
    const command = commands.find(({ name }) => name === "xpi-memo-status");
    if (!command) throw new Error("status command was not registered");
    const notifications: string[] = [];

    await command.options.handler("", {
      cwd: "/tmp",
      ui: {
        confirm: async () => false,
        notify(message: string) {
          notifications.push(message);
        },
      },
    } as never);

    expect(notifications).toHaveLength(1);
    const status = JSON.parse(notifications[0] ?? "{}") as {
      doctor?: {
        evidence: {
          bankRows: Record<string, number | null>;
          roots: unknown[];
        };
        state: string;
      };
    };
    expect(status.doctor).toBeDefined();
    expect(status.doctor?.state).toBe("NEVER_CALLED");
    expect(status.doctor?.evidence.bankRows.default).toBe(0);
    expect(status.doctor?.evidence.roots).toHaveLength(3);
  });
  it("runs the offline extraction runner at session shutdown when enabled", async () => {
    const dataDir = createTemporaryDirectory();
    const seen: Array<{
      events: number;
      sessionId: string;
    }> = [];
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "true",
      },
      offlineExtractionRunner: async (input) => {
        seen.push({
          events: input.events.length,
          sessionId: input.sessionId,
        });
        return [];
      },
      resolveProjectIdentity: () => null,
    });
    const input = events.find(({ name }) => name === "input");
    const shutdown = events.find(({ name }) => name === "session_shutdown");
    if (!input || !shutdown) throw new Error("hooks not registered");
    const context = createToolContext();
    await input.handler(
      {
        source: "interactive",
        text: "hello",
        type: "input",
      },
      context,
    );
    await shutdown.handler(
      {
        type: "session_shutdown",
      },
      context,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.events).toBe(1);
    expect(seen[0]?.sessionId).toBeTruthy();
  });

  it("does not run offline extraction when disabled", async () => {
    const dataDir = createTemporaryDirectory();
    let called = false;
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
      },
      offlineExtractionRunner: async () => {
        called = true;
        return [];
      },
    });
    const shutdown = events.find(({ name }) => name === "session_shutdown");
    if (!shutdown) throw new Error("shutdown hook not registered");
    await shutdown.handler(
      {
        type: "session_shutdown",
      },
      createToolContext(),
    );
    expect(called).toBe(false);
  });

  it("does not run the extraction runner twice for the same session (execution budget)", async () => {
    const dataDir = createTemporaryDirectory();
    let calls = 0;
    const { events } = loadExtension({
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "true",
      },
      offlineExtractionRunner: async () => {
        calls += 1;
        return [];
      },
      resolveProjectIdentity: () => null,
    });
    const input = events.find(({ name }) => name === "input");
    const shutdown = events.find(({ name }) => name === "session_shutdown");
    if (!input || !shutdown) throw new Error("hooks not registered");
    const context = createToolContext();
    await input.handler(
      {
        source: "interactive",
        text: "hello",
        type: "input",
      },
      context,
    );
    await shutdown.handler(
      {
        type: "session_shutdown",
      },
      context,
    );
    await shutdown.handler(
      {
        type: "session_shutdown",
      },
      context,
    );
    expect(calls).toBe(1);
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8"));
    const extractionEntries = audit.entries.filter(
      (entry: { action: string }) => entry.action === "extraction",
    );
    expect(extractionEntries).toHaveLength(2);
    expect(extractionEntries[1]?.metadata?.status).toBe("budget-exhausted");
  });
});

describe("memory-boundaries skill", () => {
  it("documents T1, L0, confirmation, and sleep boundaries", () => {
    const skill = readFileSync(
      new URL("../skills/memory-boundaries/SKILL.md", import.meta.url),
      "utf8",
    );

    expect(skill).toContain("L0 event-sourced session trace");
    expect(skill).toContain("user confirmation");
    expect(skill).toContain("sleep` is disabled by default");
    expect(skill).toContain("never silently fall back");
    // Task 6.1: remember requires kind; outcomes are exactly three statuses.
    expect(skill).toContain("requires `kind`");
    expect(skill).not.toContain("kind optional");
    for (const outcome of [
      "`stored`",
      "`candidate`",
      "`rejected`",
    ]) {
      expect(skill).toContain(outcome);
    }
  });
});

function collectFiles(directory: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      entries.push(...collectFiles(path).map((child) => join(entry, child)));
    } else {
      entries.push(entry);
    }
  }
  return entries;
}
