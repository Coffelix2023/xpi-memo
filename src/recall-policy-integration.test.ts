import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type RecallRunner, recallWithPolicy } from "./recall.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-policy-recall-"));
  temporaryDirectories.push(directory);
  return directory;
}

function payload(): string {
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
        content: "project memory",
        id: "memory-1",
        scope: "global",
        score: 0.8,
        source:
          "kind=global_preference;ev=explicit-user-statement;prov=user;ts=2026-01-01T00%3A00%3A00.000Z;src=user",
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

describe("policy-controlled recall", () => {
  it("runs one bounded recall for active policy", async () => {
    const dataDir = createTemporaryDirectory();
    const projectBank = "project-p-0123456789ab";
    mkdirSync(join(dataDir, "banks", projectBank), {
      recursive: true,
    });
    const calls: string[][] = [];
    const run: RecallRunner = async (args) => {
      calls.push(args);
      return payload();
    };

    const result = await recallWithPolicy(
      {
        limit: 1,
        query: "continue the task",
        context: {
          dataDir,
          projectBank,
        },
      },
      "active",
      run,
    );

    expect(result.decision).toMatchObject({
      automatic: true,
      maxAutomaticRecalls: 1,
      reason: "active-policy",
      shouldRecall: true,
    });
    expect(result.response?.results).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("leaves assist policy to an explicit caller action", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run: RecallRunner = async (args) => {
      calls.push(args);
      return payload();
    };

    const result = await recallWithPolicy(
      {
        query: "continue the task",
        context: {
          dataDir,
          projectBank: null,
        },
      },
      "assist",
      run,
    );

    expect(result.decision.reason).toBe("assist-policy");
    expect(result.response).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("does not query banks when automatic recall is paused", async () => {
    const calls: string[][] = [];
    const result = await recallWithPolicy(
      {
        query: "continue the task",
        context: {
          dataDir: "/tmp",
          projectBank: null,
        },
      },
      "active",
      async (args) => {
        calls.push(args);
        return payload();
      },
      true,
    );
    expect(result.decision).toMatchObject({
      reason: "paused",
      shouldRecall: false,
    });
    expect(result.response).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("runs one bounded recall for a matching Chinese continuity prompt", async () => {
    const dataDir = createTemporaryDirectory();
    const calls: string[][] = [];
    const run: RecallRunner = async (args) => {
      calls.push(args);
      return payload();
    };

    const result = await recallWithPolicy(
      {
        query: "继续上次的实现",
        context: {
          dataDir,
          projectBank: null,
        },
      },
      "high-value-auto",
      run,
    );

    expect(result.decision.trigger).toBe("continuity-zh");
    expect(result.response?.results).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});
