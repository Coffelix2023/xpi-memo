import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  handler: () => Promise<void>;
  name: string;
}

interface TestDependencies {
  env?: NodeJS.ProcessEnv;
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

function createToolContext(confirmed = false) {
  return {
    cwd: "/tmp",
    isError: false,
    mode: "rpc",
    ui: {
      confirm: async () => confirmed,
      notify: () => undefined,
      setStatus: () => undefined,
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
      "xpi-memo-l0",
      "xpi-memo-migrate",
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
    const confirmations: string[] = [];
    await commandHandler(commands, "xpi-memo")("", {
      cwd: "/tmp",
      mode: "tui",
      ui: {
        async confirm(title: string) {
          confirmations.push(title);
          return true;
        },
        custom: async (factory: unknown) => {
          panel = mountPanel(factory);
          return undefined;
        },
        notify: () => undefined,
        setStatus: () => undefined,
      },
    } as never);
    if (!panel) throw new Error("console panel was not mounted");

    panel.handleInput("2");
    const rendered = panel.render(70).join("\n");
    // SelectList truncates the label to its primary column width.
    expect(rendered).toContain("project_decision · project-con");
    expect(rendered.toLowerCase()).not.toContain("delete");

    panel.handleInput("\r");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(confirmations).toContain("Confirm T1 memory");
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
    expect(stored.details).toMatchObject({
      reason: "paused",
      status: "rejected",
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

  it("stores an explicit global preference through the governed T1 path", async () => {
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

    expect(details).toMatchObject({
      bank: "default",
      id: "memory-123",
      kind: "global_preference",
      scope: "global",
      status: "stored",
    });
    expect(calls[0]).toMatchObject({
      args: [
        "store",
        "Prefer tests before implementation.",
        expect.stringContaining("kind=global_preference"),
        "1",
      ],
      options: {
        dataDir,
        scope: "global",
      },
    });
    expect(readFileSync(join(dataDir, "audit.json"), "utf8")).toContain(
      '"action": "write"',
    );
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
  it("requires confirmation before storing a project decision", async () => {
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
      createToolContext(true),
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
      legacyDataDirExists: expect.any(Boolean),
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
  });
});
