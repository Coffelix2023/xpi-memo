import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { VerifierFn } from "./tool-verification.ts";
import {
  VERIFIERS,
  verifyCandidateIfNeeded,
  verifyProjectGene,
} from "./tool-verification.ts";

const temporaryDirectories: string[] = [];

function createTemporaryRepository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "xpi-memo-tool-verification-"));
  temporaryDirectories.push(root);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), {
      recursive: true,
    });
    writeFileSync(absolute, content);
  }
  return root;
}

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

const GENE_CONTENT = "The extension loads src/index.ts TypeScript source directly.";

describe("verifyProjectGene (task 3.2)", () => {
  it("verifies when the repository contains the claimed fact", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md":
        "Rationale:\nThe extension loads src/index.ts TypeScript source directly.\n",
    });
    const result = await verifyProjectGene(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        root,
      },
    );
    expect(result.status).toBe("verified");
    if (result.status !== "verified") return;
    expect(result.filePath).toBe(join(root, "docs/architecture.md"));
    expect(result.matchedLine).toContain("src/index.ts");
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it("fails with no-match when the repository lacks the claimed fact", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": "Nothing relevant here.\n",
    });
    const result = await verifyProjectGene(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        root,
      },
    );
    expect(result).toEqual({
      reason: "no-match",
      status: "failed",
    });
  });

  it("fails with timeout when the search exceeds the 500ms budget", async () => {
    const timeoutError = Object.assign(new Error("killed"), {
      killed: true,
    });
    const result = await verifyProjectGene(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        execFile: async () => {
          throw timeoutError;
        },
      },
    );
    expect(result).toEqual({
      reason: "timeout",
      status: "failed",
    });
  });

  it("never verifies against test directories", async () => {
    const root = createTemporaryRepository({
      "tests/architecture.test.ts": `it("${GENE_CONTENT}", () => {});\n`,
    });
    const result = await verifyProjectGene(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        root,
      },
    );
    expect(result).toEqual({
      reason: "no-match",
      status: "failed",
    });
  });

  it("fails with no-verifiable-text for whitespace-only content", async () => {
    const result = await verifyProjectGene(
      {
        content: "   \n  ",
        kind: "project_gene",
      },
      {
        root: ".",
      },
    );
    expect(result).toEqual({
      reason: "no-verifiable-text",
      status: "failed",
    });
  });
});

describe("verifier registry (task 3.3)", () => {
  it("registers the gene and constraint verifiers", () => {
    expect(VERIFIERS.get("project_gene")).toBeDefined();
    expect(VERIFIERS.get("project_constraint")).toBeDefined();
  });

  it("fails verification for unregistered kinds", async () => {
    const result = await verifyCandidateIfNeeded(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        verifiers: new Map(),
      },
    );
    expect(result).toEqual({
      reason: "verifier-not-registered",
      status: "failed",
    });
  });
});

describe("verifyCandidateIfNeeded routing (task 3.4)", () => {
  it("routes tool-verify kinds to their verifier", async () => {
    const verified: VerifierFn = async (candidate) => {
      expect(candidate.content).toBe(GENE_CONTENT);
      expect(candidate.kind).toBe("project_gene");
      return {
        filePath: "AGENTS.md",
        matchedLine: GENE_CONTENT,
        status: "verified",
        timestamp: "2026-01-01T00:00:00.000Z",
      };
    };
    const result = await verifyCandidateIfNeeded(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        verifiers: new Map([
          [
            "project_gene",
            verified,
          ],
        ]),
      },
    );
    expect(result.status).toBe("verified");
  });

  it("skips verification for manual-confirm kinds", async () => {
    const result = await verifyCandidateIfNeeded(
      {
        content: "Prefer pnpm over npm.",
        kind: "project_decision",
      },
      {
        verifiers: new Map([
          [
            "project_decision",
            async () => {
              throw new Error("verifier must not run for decision kind");
            },
          ],
        ]),
      },
    );
    expect(result).toEqual({
      reason: "policy:manual-confirm",
      status: "skipped",
    });
  });

  it("skips verification when the global kill switch is on", async () => {
    const result = await verifyCandidateIfNeeded(
      {
        content: GENE_CONTENT,
        kind: "project_gene",
      },
      {
        verifiers: VERIFIERS,
        env: {
          XPI_MEMO_AUTO_VERIFY: "false",
        },
      },
    );
    expect(result).toEqual({
      reason: "policy:manual-confirm",
      status: "skipped",
    });
  });
});

describe("VerifierFn signature (task 3.1)", () => {
  it("accepts an async candidate-to-result function", async () => {
    const verifier: VerifierFn = async (candidate) => ({
      reason: `unverifiable:${candidate.kind}`,
      status: "failed",
    });
    expect(
      await verifier({
        content: "x",
        kind: "project_gene",
      }),
    ).toEqual({
      reason: "unverifiable:project_gene",
      status: "failed",
    });
  });
});
