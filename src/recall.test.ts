import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { type RecallRunner, recall } from "./recall.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-recall-"));
  temporaryDirectories.push(directory);
  return directory;
}

function payload(results: unknown[]): string {
  return JSON.stringify({
    engine: "linear",
    explain: {
      stages: [],
      embedding: {
        available: true,
        computed: true,
      },
    },
    results,
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

describe("bounded T1 recall", () => {
  it("queries the current project and bounded global bank, then labels provenance", async () => {
    const dataDir = createTemporaryDirectory();
    const projectBank = "project-p-0123456789ab";
    mkdirSync(join(dataDir, "banks", projectBank), {
      recursive: true,
    });
    const calls: Array<{
      args: string[];
      bank: string | undefined;
    }> = [];
    const run: RecallRunner = async (args, options) => {
      calls.push({
        args,
        bank: options?.bank,
      });
      return options?.bank === projectBank
        ? payload([
            {
              content: "project decision",
              id: "project-1",
              scope: "global",
              score: 0.7,
            },
            {
              content: "project context",
              id: "project-2",
              scope: "session",
              score: 0.6,
            },
          ])
        : payload([
            {
              content: "global preference",
              id: "global-1",
              scope: "global",
              score: 0.9,
              source:
                "kind=global_preference;ev=explicit-user-statement;prov=user;ts=2026-01-01T00%3A00%3A00.000Z;src=user%20message",
            },
            {
              content: "leaked project gene",
              id: "global-leak",
              scope: "global",
              score: 0.95,
              source:
                "kind=project_gene;ev=verified-repository-fact;prov=repo;ts=2026-01-01T00%3A00%3A00.000Z;src=package.json",
            },
          ]);
    };

    const result = await recall(
      {
        globalLimit: 1,
        limit: 3,
        projectLimit: 2,
        query: "which memory applies?",
        context: {
          dataDir,
          projectBank,
        },
      },
      run,
    );

    expect(calls).toEqual([
      {
        bank: projectBank,
        args: [
          "recall",
          "which memory applies?",
          "2",
          "--explain",
          "--json",
        ],
      },
      {
        bank: undefined,
        args: [
          "recall",
          "which memory applies?",
          "1",
          "--explain",
          "--json",
        ],
      },
    ]);
    expect(result.queriedBanks).toEqual([
      projectBank,
      "default",
    ]);
    expect(result.results).toEqual([
      expect.objectContaining({
        bank: "default",
        content: "global preference",
        kind: "global_preference",
        scope: "global",
        provenance: {
          bank: "default",
          layer: "T1",
          source: "mnemosyne",
        },
      }),
      expect.objectContaining({
        bank: projectBank,
        content: "project decision",
        scope: "global",
        provenance: {
          bank: projectBank,
          layer: "T1",
          source: "mnemosyne",
        },
      }),
      expect.objectContaining({
        bank: projectBank,
        content: "project context",
        scope: "session",
      }),
    ]);
    expect(result.results.map((item) => item.content)).not.toContain(
      "leaked project gene",
    );
    expect(result.results).toHaveLength(3);
  });

  it("skips a missing project bank without creating it", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: Array<{
      args: string[];
      bank: string | undefined;
    }> = [];
    const run: RecallRunner = async (args, options) => {
      calls.push({
        args,
        bank: options?.bank,
      });
      return payload([]);
    };

    const result = await recall(
      {
        query: "history",
        context: {
          dataDir,
          projectBank: "project-missing",
        },
      },
      run,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.bank).toBeUndefined();
    expect(result.queriedBanks).toEqual([
      "default",
    ]);
    expect(result.results).toEqual([]);
    expect(result.retrieval.mode).toBe("hybrid");
  });

  it("clamps invalid and oversized limits before invoking Mnemosyne", async () => {
    const dataDir = createTemporaryDirectory();
    const projectBank = "project-p-limits";
    mkdirSync(join(dataDir, "banks", projectBank), {
      recursive: true,
    });
    const calls: string[][] = [];
    const run: RecallRunner = async (args) => {
      calls.push(args);
      return payload([
        {
          content: "bounded memory",
          id: "bounded-1",
          scope: "global",
          score: 0.8,
        },
      ]);
    };

    const result = await recall(
      {
        globalLimit: 999,
        limit: 0,
        projectLimit: -3,
        query: "bounded limits",
        context: {
          dataDir,
          projectBank,
        },
      },
      run,
    );

    expect(calls.map((args) => args[2])).toEqual([
      "1",
      "50",
    ]);
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it("parses real recall explain output without treating em_fallback as retrieval fallback", async () => {
    const fixture = readFileSync(join(fixtureDirectory, "recall-explain.json"), "utf8");
    const run: RecallRunner = async () => fixture;

    const dataDir = createTemporaryDirectory();
    const projectBank = "project-p-fixture";
    mkdirSync(join(dataDir, "banks", projectBank), {
      recursive: true,
    });
    const result = await recall(
      {
        query: "task 7.2 marker",
        context: {
          dataDir,
          projectBank,
        },
      },
      run,
    );

    expect(result.retrieval).toEqual({
      embeddingAvailable: true,
      fallback: false,
      mode: "hybrid",
    });
    expect(result.results).toEqual([
      expect.objectContaining({
        content: "English task 7.2 project marker",
        kind: "project_gene",
        source: "package.json",
      }),
    ]);
  });
});
