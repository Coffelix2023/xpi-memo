import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type RecallRunner, recallWithPolicy } from "./recall.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-exclusion-"));
  temporaryDirectories.push(directory);
  return directory;
}

function payload(bank: string): string {
  return JSON.stringify({
    engine: "linear",
    explain: {
      stages: [],
      embedding: {
        available: true,
        computed: true,
      },
    },
    results: [
      {
        bank,
        content: `${bank} memory`,
        id: `${bank}-memory`,
        scope: "global",
        score: 0.8,
        source:
          bank === "default"
            ? "kind=global_preference;ev=explicit-user-statement;prov=user;ts=2026-01-01T00%3A00%3A00.000Z;src=user"
            : "kind=project_gene;ev=verified-repository-fact;prov=repo;ts=2026-01-01T00%3A00%3A00.000Z;src=package.json",
      },
    ],
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("automatic recall boundaries", () => {
  it("does not recall for an ordinary prompt", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run: RecallRunner = async (args) => {
      calls.push(args);
      return payload("default");
    };

    const result = await recallWithPolicy(
      {
        query: "Implement the parser",
        context: {
          dataDir,
          projectBank: null,
        },
      },
      "high-value-auto",
      run,
    );

    expect(result.decision.reason).toBe("ordinary-prompt");
    expect(result.response).toBeNull();
    expect(calls).toEqual([]);
  });

  it("queries only the current project and global banks", async () => {
    const dataDir = createTemporaryDirectory();
    const projectBank = "project-p-current";
    mkdirSync(join(dataDir, "banks", projectBank), {
      recursive: true,
    });
    mkdirSync(join(dataDir, "banks", "project-p-unrelated"), {
      recursive: true,
    });
    const calls: Array<{
      bank: string | undefined;
      query: string;
    }> = [];
    const run: RecallRunner = async (args, options) => {
      calls.push({
        bank: options?.bank,
        query: args[1] ?? "",
      });
      return payload(options?.bank ?? "default");
    };

    const result = await recallWithPolicy(
      {
        globalLimit: 1,
        limit: 2,
        projectLimit: 1,
        query: "What did we decide before?",
        context: {
          dataDir,
          projectBank,
        },
      },
      "high-value-auto",
      run,
    );

    expect(result.response?.queriedBanks).toEqual([
      projectBank,
      "default",
    ]);
    expect(calls.map(({ bank }) => bank)).toEqual([
      projectBank,
      undefined,
    ]);
    expect(calls.some(({ bank }) => bank === "project-p-unrelated")).toBe(false);
    expect(result.response?.results.map(({ bank }) => bank)).toEqual([
      projectBank,
      "default",
    ]);
  });
});
