import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import xpiMemo from "./index.ts";

const enabled = process.env.XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION === "1";
const PROJECT_BANK_PREFIX = /^project-/;
const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function initGitRepo(root: string): void {
  execFileSync("git", [
    "init",
    "-q",
    root,
  ]);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe.skipIf(!enabled)("task 7.7 live RPC probe", () => {
  it("registers once, isolates two git projects, and keeps sleep capability-checked", async () => {
    const dataDir = createTemporaryDirectory("xpi-memo-live-data-");
    const projectsDir = createTemporaryDirectory("xpi-memo-live-projects-");
    const projectA = join(projectsDir, "project-a");
    const projectB = join(projectsDir, "project-b");
    execFileSync("mkdir", [
      "-p",
      projectA,
      projectB,
    ]);
    initGitRepo(projectA);
    initGitRepo(projectB);

    const tools: ToolDefinition[] = [];
    const commands: Array<{
      name: string;
      handler: (args: string, ctx: ExtensionContext) => Promise<void>;
    }> = [];
    const notifications: string[] = [];
    const pi = {
      on() {},
      registerCommand(
        name: string,
        options: {
          handler: (args: string, ctx: ExtensionContext) => Promise<void>;
        },
      ) {
        commands.push({
          handler: options.handler,
          name,
        });
      },
      registerTool(tool: ToolDefinition) {
        tools.push(tool);
      },
    } as unknown as ExtensionAPI;

    xpiMemo(pi, {
      env: {
        MNEMOSYNE_NO_EMBEDDINGS: "1",
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODEL: "live-dedicated-sleep-model",
      },
    });

    const targetTools = [
      "xpi_memo_remember",
      "xpi_memo_recall",
      "xpi_memo_forget",
      "xpi_memo_sleep",
    ];
    const toolNames = tools.map((tool) => tool.name);
    expect(
      targetTools.every(
        (name) => toolNames.filter((tool) => tool === name).length === 1,
      ),
    ).toBe(true);
    expect(commands.filter(({ name }) => name === "xpi-memo-status")).toHaveLength(1);

    const contextFor = (cwd: string): ExtensionContext =>
      ({
        cwd,
        ui: {
          confirm: async () => true,
          notify: (message: string) => {
            notifications.push(message);
          },
          setStatus: () => undefined,
        },
      }) as unknown as ExtensionContext;

    const tool = (name: string): ToolDefinition => {
      const found = tools.find((candidate) => candidate.name === name);
      if (!found) throw new Error(`tool not registered: ${name}`);
      return found;
    };
    type ToolResult = Awaited<ReturnType<ToolDefinition["execute"]>>;
    const detailsOf = (result: ToolResult) => result.details as Record<string, unknown>;
    const textOf = (result: ToolResult): string => {
      const first = result.content[0];
      return first && "text" in first ? first.text : "{}";
    };
    const payloadOf = (result: ToolResult): Record<string, unknown> => {
      try {
        return JSON.parse(textOf(result)) as Record<string, unknown>;
      } catch {
        return {};
      }
    };
    const call = (
      name: string,
      id: string,
      params: Record<string, unknown>,
      cwd: string,
    ) => tool(name).execute(id, params, undefined, undefined, contextFor(cwd));

    const aCtx = contextFor(projectA);
    const statusCommand = commands.find(({ name }) => name === "xpi-memo-status");
    await statusCommand?.handler("", aCtx);
    const status = JSON.parse(
      notifications.find((message) => message.includes('"tiers"')) ?? "{}",
    ) as {
      tiers?: Record<string, string>;
    };
    expect(status.tiers).toEqual({
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    });

    const global = detailsOf(
      await call(
        "xpi_memo_remember",
        "global-remember",
        {
          content: "live global preference marker",
          kind: "global_preference",
          source: "task-7.7-live",
        },
        projectA,
      ),
    );
    const globalId = global.id;
    expect(global.status).toBe("stored");
    expect(global.bank).toBe("default");
    expect(typeof globalId).toBe("string");

    const globalRecall = payloadOf(
      await call(
        "xpi_memo_recall",
        "global-recall",
        {
          limit: 10,
          query: "live global preference marker",
        },
        projectA,
      ),
    );
    expect(globalRecall.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: "live global preference marker",
        }),
      ]),
    );

    const aRemember = detailsOf(
      await call(
        "xpi_memo_remember",
        "a-remember",
        {
          content: "live project A isolation marker",
          kind: "session_context",
          source: "task-7.7-live",
        },
        projectA,
      ),
    );
    const bRemember = detailsOf(
      await call(
        "xpi_memo_remember",
        "b-remember",
        {
          content: "live project B isolation marker",
          kind: "session_context",
          source: "task-7.7-live",
        },
        projectB,
      ),
    );
    expect(aRemember.status).toBe("stored");
    expect(String(aRemember.bank)).toMatch(PROJECT_BANK_PREFIX);
    expect(bRemember.status).toBe("stored");
    expect(String(bRemember.bank)).toMatch(PROJECT_BANK_PREFIX);
    expect(aRemember.bank).not.toBe(bRemember.bank);

    const bRecall = payloadOf(
      await call(
        "xpi_memo_recall",
        "b-recall",
        {
          limit: 10,
          query: "live project isolation marker",
        },
        projectB,
      ),
    );
    const aRecall = payloadOf(
      await call(
        "xpi_memo_recall",
        "a-recall",
        {
          limit: 10,
          query: "live project isolation marker",
        },
        projectA,
      ),
    );
    const bContents =
      (bRecall.results as
        | Array<{
            content?: string;
          }>
        | undefined) ?? [];
    const aContents =
      (aRecall.results as
        | Array<{
            content?: string;
          }>
        | undefined) ?? [];
    const bQueriedBanks = (bRecall.queriedBanks as string[] | undefined) ?? [];
    expect(
      bContents.some((item) => item.content === "live project A isolation marker"),
    ).toBe(false);
    expect(
      bContents.some((item) => item.content === "live project B isolation marker"),
    ).toBe(true);
    expect(
      aContents.some((item) => item.content === "live project A isolation marker"),
    ).toBe(true);
    expect(
      aContents.some((item) => item.content === "live project B isolation marker"),
    ).toBe(false);
    expect(bQueriedBanks).toHaveLength(2);
    expect(bQueriedBanks).toEqual(
      expect.arrayContaining([
        bRemember.bank,
        "default",
      ]),
    );
    expect(bQueriedBanks).not.toContain(aRemember.bank);

    const unauthorized = detailsOf(
      await call(
        "xpi_memo_sleep",
        "sleep-rejected",
        {
          authorized: false,
        },
        projectA,
      ),
    );
    const authorized = detailsOf(
      await call(
        "xpi_memo_sleep",
        "sleep-capability",
        {
          authorized: true,
        },
        projectA,
      ),
    );
    expect(unauthorized).toMatchObject({
      reason: "sleep-disabled-by-default",
      status: "rejected",
    });
    expect(authorized).toMatchObject({
      reason: "dedicated-sleep-model-unsupported",
      status: "rejected",
    });

    const forgotten = detailsOf(
      await call(
        "xpi_memo_forget",
        "forget-global",
        {
          memoryId: globalId,
        },
        projectA,
      ),
    );
    expect(forgotten).toMatchObject({
      id: globalId,
      status: "deleted",
    });

    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")) as {
      entries?: Array<{
        action: string;
      }>;
    };
    const actions = (audit.entries ?? []).map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "recall",
        "sleep-authorization",
        "write",
      ]),
    );

    const banksPath = join(dataDir, "banks");
    const projectBanks = readdirSync(banksPath).filter((entry) => {
      try {
        return (
          entry.startsWith("project-") && statSync(join(banksPath, entry)).isDirectory()
        );
      } catch {
        return false;
      }
    });
    expect(projectBanks.length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
