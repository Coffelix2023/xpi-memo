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

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-index-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createToolContext(
  options: { confirm?: boolean; mode?: string; select?: string } = {},
) {
  const { confirm = false, mode = "rpc", select = undefined } = options;
  return {
    cwd: "/tmp",
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
      scope: "global",
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
      scope: "global",
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
      reason: "sleep-disabled-by-default",
      status: "rejected",
    });
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
      reason: "dedicated-sleep-model-unsupported",
      status: "rejected",
    });
    expect(calls.map(([command]) => command)).toEqual([
      "--help",
    ]);
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).toContain(
      '"action": "sleep-authorization"',
    );
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
    expect(status.fallback).toBeNull();
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
