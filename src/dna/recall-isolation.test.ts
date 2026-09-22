import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type RecallRunner, recall } from "../recall.ts";

const temporaryDirectories: string[] = [];
const MARKER = "DNA-MARKER-不可检索-卡片必须有1px边框";

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xpi-memo-dna-recall-"));
  temporaryDirectories.push(dir);
  return dir;
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

const run: RecallRunner = async () =>
  payload([
    {
      content: "卡片规则记忆",
      id: "memory-1",
      scope: "project",
      score: 0.9,
    },
  ]);

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, {
      force: true,
      recursive: true,
    });
  }
});

describe("recall stays byte-identical with DNA present (task 3.4)", () => {
  it("produces the same recall output with and without a project DNA file", async () => {
    const dataDir = tempDir();
    const projectBank = "project-p-0123456789ab";
    mkdirSync(join(dataDir, "banks", projectBank), {
      recursive: true,
    });
    const request = {
      limit: 3,
      query: "卡片样式规则",
      context: {
        dataDir,
        projectBank,
      },
    };

    const withoutDna = await recall(request, run);

    // The DNA file lives where a naive scan would find it; recall must ignore it.
    mkdirSync(join(dataDir, ".pi"), {
      recursive: true,
    });
    writeFileSync(
      join(dataDir, ".pi", "DNA.yaml"),
      `art:\n  - id: marker\n    semantic: ${MARKER}\n    source: user-authored\n    confidence: high\n`,
      "utf8",
    );
    const withDna = await recall(request, run);

    expect(withDna).toEqual(withoutDna);
    expect(JSON.stringify(withDna)).not.toContain("DNA-MARKER");
  });
});
