import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import { ensureProjectBank } from "./banks.js";
import { runMnemosyne } from "./cli.js";
import xpiMemo from "./index.ts";
import { createMnemosyneAdapter, type T1MemoryOperation } from "./operations.js";
import { type RecallRunner, recall } from "./recall.js";

const enabled = process.env.XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION === "1";
const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-cli-integration-"));
  temporaryDirectories.push(directory);
  return directory;
}

function operation(
  dataDir: string,
  content: string,
  kind: T1MemoryOperation["kind"],
  targetBank: string,
  scope: T1MemoryOperation["scope"],
  sessionId?: string,
): T1MemoryOperation {
  return {
    confidence: 0.9,
    content,
    dataDir,
    kind,
    provenance: "task-7.2-real-cli",
    scope,
    source: {
      evidenceType: "verified-tool-result",
      ...(sessionId
        ? {
            sessionId,
          }
        : {}),
      source: kind,
      timestamp: new Date().toISOString(),
    },
    targetBank,
  };
}

const noEmbeddingRecall: RecallRunner = (args, options) =>
  runMnemosyne(args, {
    ...options,
    env: {
      ...options?.env,
      ...process.env,
      MNEMOSYNE_NO_EMBEDDINGS: "1",
    },
  });

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe.skipIf(!enabled)("real Mnemosyne CLI integration", () => {
  it("makes an extension store visible to CLI stats under the same MNEMOSYNE_DATA_DIR", async () => {
    // Task 5.1: extension spawn pins MNEMOSYNE_DATA_DIR to the configured
    // dataDir, so a bare CLI `stats` with the same env sees the new row.
    const dataDir = createTemporaryDirectory();
    const adapter = createMnemosyneAdapter();
    await adapter.store(
      operation(
        dataDir,
        "task 5.1 shared-root marker",
        "global_preference",
        "default",
        "global",
      ),
    );
    const statsOutput = await runMnemosyne(
      [
        "stats",
      ],
      {
        dataDir,
      },
    );
    expect(statsOutput).toContain("Total memories: 1");
  });

  it("routes scoped kinds, recalls multilingual content, and excludes another project bank", async () => {
    const dataDir = createTemporaryDirectory();
    const projectA = "project-a-7-2";
    const projectB = "project-b-7-2";

    expect(
      await ensureProjectBank({
        dataDir,
        projectBank: projectA,
      }),
    ).toBe(true);
    expect(
      await ensureProjectBank({
        dataDir,
        projectBank: projectB,
      }),
    ).toBe(true);

    const adapter = createMnemosyneAdapter();
    await adapter.store(
      operation(
        dataDir,
        "English task 7.2 project marker",
        "project_gene",
        projectA,
        "global",
      ),
    );
    await adapter.store(
      operation(
        dataDir,
        "中文 task 7.2 session marker",
        "session_context",
        projectA,
        "session",
        "session-a-7-2",
      ),
    );
    await adapter.store(
      operation(
        dataDir,
        "unrelated task 7.2 project marker",
        "project_gene",
        projectB,
        "global",
      ),
    );

    const result = await recall({
      limit: 10,
      query: "task 7.2 marker",
      sessionId: "session-a-7-2",
      context: {
        dataDir,
        projectBank: projectA,
      },
    });

    expect(result.queriedBanks).toEqual([
      projectA,
      "default",
    ]);
    expect(result.results.map((item) => item.content)).toEqual(
      expect.arrayContaining([
        "English task 7.2 project marker",
        "中文 task 7.2 session marker",
      ]),
    );
    expect(result.results.map((item) => item.content)).not.toContain(
      "unrelated task 7.2 project marker",
    );
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bank: projectA,
          scope: "project",
        }),
        expect.objectContaining({
          bank: projectA,
          scope: "session",
        }),
      ]),
    );
    expect(result.retrieval.mode).toBe("hybrid");
    expect(typeof result.retrieval.fallback).toBe("boolean");

    const projectDb = join(dataDir, "banks", projectA, "mnemosyne.db");
    expect(readFileSync(projectDb).byteLength).toBeGreaterThan(0);
  });

  it("keeps FTS5 retrieval when embeddings are disabled", async () => {
    const dataDir = createTemporaryDirectory();
    const projectBank = "project-fts-7-2";

    expect(
      await ensureProjectBank({
        dataDir,
        projectBank,
      }),
    ).toBe(true);

    const adapter = createMnemosyneAdapter();
    await adapter.store(
      operation(
        dataDir,
        "FTS5 fallback integration marker",
        "project_gene",
        projectBank,
        "global",
      ),
    );

    const result = await recall(
      {
        limit: 10,
        query: "FTS5 fallback marker",
        context: {
          dataDir,
          projectBank,
        },
      },
      noEmbeddingRecall,
    );

    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bank: projectBank,
          content: "FTS5 fallback integration marker",
        }),
      ]),
    );
    expect(result.retrieval).toEqual({
      embeddingAvailable: false,
      fallback: true,
      mode: "hybrid",
    });
  });
  it("executes all four tools against the real CLI sandbox", async () => {
    const dataDir = createTemporaryDirectory();
    const projectId = "tool-four-it";
    const projectBank = `project-${projectId}`;

    const tools: ToolDefinition[] = [];
    const pi = {
      on() {},
      registerCommand() {},
      registerTool(tool: ToolDefinition) {
        tools.push(tool);
      },
    } as unknown as ExtensionAPI;
    xpiMemo(pi, {
      env: {
        XDG_CONFIG_HOME: dataDir,
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_SLEEP_MODE: "dedicated",
        XPI_MEMO_SLEEP_MODEL: "unused-dedicated-model",
      },
      resolveProjectIdentity: () => ({
        id: projectId,
        label: "tool-four-it",
      }),
    });
    const ctx = {
      cwd: dataDir,
      mode: "tui",
      ui: {
        confirm: async () => true,
        notify: () => undefined,
        select: async () => "Store",
        setStatus: () => undefined,
        setWidget: () => undefined,
      },
    } as unknown as ExtensionContext;
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

    // remember: explicit global preference auto-stores into the global bank
    const remembered = detailsOf(
      await tool("xpi_memo_remember").execute(
        "remember",
        {
          content: "prefer tests before implementation",
          kind: "global_preference",
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(remembered.status).toBe("stored");
    expect(remembered.bank).toBe("default");
    // remember: bounded session context lands in the current project bank
    const session = detailsOf(
      await tool("xpi_memo_remember").execute(
        "remember",
        {
          content: "当前构建必须使用 pnpm 11.5+",
          kind: "session_context",
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(session.status).toBe("stored");
    expect(session.bank).toBe(projectBank);
    expect(session.scope).toBe("session");

    // remember: project decision persists only after user confirmation
    const decision = detailsOf(
      await tool("xpi_memo_remember").execute(
        "remember",
        {
          content: "use Mnemosyne as the T1 store",
          kind: "project_decision",
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(decision.status).toBe("stored");
    expect(decision.candidateId).toBeTruthy();

    // Project recall → forget closure must use the real backend ID.
    const projectRecall = await tool("xpi_memo_recall").execute(
      "recall-project",
      {
        limit: 10,
        query: "Mnemosyne T1 store",
      },
      undefined,
      undefined,
      ctx,
    );
    const projectPayload = JSON.parse(textOf(projectRecall)) as {
      results: Array<{
        bank?: string;
        id?: string | null;
      }>;
    };
    const projectMemory = projectPayload.results.find(
      (item) => item.bank === projectBank && typeof item.id === "string",
    );
    expect(projectMemory?.id).toEqual(expect.any(String));
    const forgottenProject = detailsOf(
      await tool("xpi_memo_forget").execute(
        "forget-project",
        {
          memoryId: projectMemory?.id as string,
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(forgottenProject).toMatchObject({
      bank: projectBank,
      id: projectMemory?.id,
      status: "deleted",
    });
    const afterForget = await tool("xpi_memo_recall").execute(
      "recall-project-after-forget",
      {
        limit: 10,
        query: "Mnemosyne T1 store",
      },
      undefined,
      undefined,
      ctx,
    );
    const afterForgetPayload = JSON.parse(textOf(afterForget)) as {
      results: Array<{
        id?: string | null;
      }>;
    };
    expect(
      afterForgetPayload.results.some((item) => item.id === projectMemory?.id),
    ).toBe(false);

    // recall: returns kind and provenance metadata from the project bank
    const recalled = await tool("xpi_memo_recall").execute(
      "recall",
      {
        limit: 10,
        query: "pnpm",
      },
      undefined,
      undefined,
      ctx,
    );
    const recalledDetails = detailsOf(recalled);
    expect(recalledDetails.status).toBe("recalled");
    expect(recalledDetails.queriedBanks).toEqual([
      projectBank,
      "default",
    ]);
    const recallPayload = JSON.parse(textOf(recalled));
    expect(recallPayload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bank: projectBank,
          kind: "session_context",
          provenance: {
            bank: projectBank,
            layer: "T1",
            source: "mnemosyne",
          },
        }),
      ]),
    );

    // recall: the global preference round-trips through the global bank
    const globalRecall = await tool("xpi_memo_recall").execute(
      "recall",
      {
        limit: 10,
        query: "tests before implementation",
      },
      undefined,
      undefined,
      ctx,
    );
    const globalPayload = JSON.parse(textOf(globalRecall));
    expect(globalPayload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bank: "default",
          kind: "global_preference",
        }),
      ]),
    );

    // forget: governed deletion through the real CLI, using the recalled global ID
    const globalMemory = globalPayload.results.find(
      (item: { bank?: string; id?: string | null }) =>
        item.bank === "default" && typeof item.id === "string",
    );
    expect(globalMemory?.id).toEqual(expect.any(String));
    const forgotten = detailsOf(
      await tool("xpi_memo_forget").execute(
        "forget-global",
        {
          memoryId: globalMemory?.id as string,
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(forgotten).toMatchObject({
      bank: "default",
      id: globalMemory?.id,
      status: "deleted",
    });
    // sleep: unauthorized stays rejected; authorized with a dedicated model is
    // capability-blocked instead of silently falling back to the primary model
    const unauthorized = detailsOf(
      await tool("xpi_memo_sleep").execute(
        "sleep",
        {
          authorized: false,
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(unauthorized.status).toBe("rejected");
    expect(unauthorized.reason).toBe("sleep-disabled-by-default");

    const authorized = detailsOf(
      await tool("xpi_memo_sleep").execute(
        "sleep",
        {
          authorized: true,
        },
        undefined,
        undefined,
        ctx,
      ),
    );
    expect(authorized.status).toBe("rejected");
    expect(authorized.reason).toBe("dedicated-sleep-model-unsupported");

    // audit wiring: bounded metadata landed in the sandbox audit log
    const audit = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8"));
    const actions = audit.entries.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "confirmation",
        "recall",
        "sleep-authorization",
        "write",
      ]),
    );
  });
});
