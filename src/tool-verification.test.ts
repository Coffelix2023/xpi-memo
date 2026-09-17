import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

const GENE_EXCERPT =
  "The extension loads src/index.ts TypeScript source directly.";

function geneFact(overrides: Partial<{ path: string; excerpt: string; revision: string }> = {}) {
  return {
    excerpt: overrides.excerpt ?? GENE_EXCERPT,
    path: overrides.path ?? "docs/architecture.md",
    ...(overrides.revision ? { revision: overrides.revision } : {}),
  };
}

describe("verifyProjectGene (stabilize task 1.2/3.1)", () => {
  it("verifies a declaration whose file contains the excerpt verbatim", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": `Rationale:\n${GENE_EXCERPT}\n`,
    });
    const result = await verifyProjectGene(
      {
        content: "The loader reads TypeScript directly.",
        kind: "project_gene",
        repositoryFact: geneFact(),
      },
      { root },
    );
    expect(result).toMatchObject({
      excerpt: GENE_EXCERPT,
      filePath: "docs/architecture.md",
      line: 2,
      status: "verified",
    });
  });

  it("fails with no-declaration when the candidate has no repository fact", async () => {
    const result = await verifyProjectGene({
      content: "Any prose without a declaration.",
      kind: "project_gene",
    });
    expect(result).toMatchObject({
      reason: "no-declaration",
      status: "failed",
    });
  });

  it("fails with path-outside-root for absolute and escaping paths", async () => {
    for (const path of ["/etc/passwd", "../outside.md", "a/../../b.md"]) {
      const result = await verifyProjectGene(
        {
          content: "x",
          kind: "project_gene",
          repositoryFact: geneFact({ path }),
        },
        { root: createTemporaryRepository({}) },
      );
      expect(result).toMatchObject({
        reason: "path-outside-root",
        status: "failed",
      });
    }
  });

  it("fails with file-not-found when the declared file is missing", async () => {
    const root = createTemporaryRepository({});
    const result = await verifyProjectGene(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact(),
      },
      { root },
    );
    expect(result).toMatchObject({
      reason: "file-not-found",
      status: "failed",
    });
  });

  it("fails with excerpt-not-found when the file lacks the verbatim excerpt", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": "Some other text entirely.\n",
    });
    const result = await verifyProjectGene(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact(),
      },
      { root },
    );
    expect(result).toMatchObject({
      reason: "excerpt-not-found",
      status: "failed",
    });
  });

  it("fails with comment-evidence when the excerpt line is a comment", async () => {
    const root = createTemporaryRepository({
      "src/loader.ts": `// ${GENE_EXCERPT}\nexport const x = 1;\n`,
      "notes.md": `<!-- ${GENE_EXCERPT} -->\n`,
    });
    for (const path of ["src/loader.ts", "notes.md"]) {
      const result = await verifyProjectGene(
        {
          content: "x",
          kind: "project_gene",
          repositoryFact: geneFact({ path }),
        },
        { root },
      );
      expect(result).toMatchObject({
        reason: "comment-evidence",
        status: "failed",
      });
    }
  });

  it("fails with revision-mismatch when the declared revision differs from HEAD", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": `${GENE_EXCERPT}\n`,
    });
    const result = await verifyProjectGene(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact({ revision: "aaaaaaaaaaaaaaaa" }),
      },
      { headRevision: "bbbbbbbbbbbbbbbb", root },
    );
    expect(result).toMatchObject({
      reason: "revision-mismatch",
      status: "failed",
    });
  });

  it("passes when the declared revision matches HEAD", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": `${GENE_EXCERPT}\n`,
    });
    const result = await verifyProjectGene(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact({ revision: "aaaaaaaaaaaaaaaa" }),
      },
      { headRevision: "aaaaaaaaaaaaaaaa", root },
    );
    expect(result).toMatchObject({ status: "verified" });
  });

  it("fails with timeout and git-unavailable for revision subprocess failures", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": `${GENE_EXCERPT}\n`,
    });
    const timeoutError = Object.assign(new Error("killed"), { killed: true });
    const timedOut = await verifyProjectGene(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact({ revision: "aaaaaaaaaaaaaaaa" }),
      },
      {
        execFile: () => Promise.reject(timeoutError),
        root,
      },
    );
    expect(timedOut).toMatchObject({ reason: "timeout", status: "failed" });
    const missingGit = await verifyProjectGene(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact({ revision: "aaaaaaaaaaaaaaaa" }),
      },
      {
        execFile: () =>
          Promise.reject(Object.assign(new Error("spawn"), { code: "ENOENT" })),
        root,
      },
    );
    expect(missingGit).toMatchObject({
      reason: "git-unavailable",
      status: "failed",
    });
  });
});

describe("verifyCandidateIfNeeded (stabilize rollout seam)", () => {
  it("routes gene candidates to the registered verifier", async () => {
    const root = createTemporaryRepository({
      "docs/architecture.md": `${GENE_EXCERPT}\n`,
    });
    const result = await verifyCandidateIfNeeded(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact(),
      },
      { root },
    );
    expect(result).toMatchObject({ status: "verified" });
  });

  it("skips verification for manual-confirm kinds without calling a verifier", async () => {
    const result = await verifyCandidateIfNeeded({
      content: "x",
      kind: "project_decision",
    });
    expect(result).toMatchObject({
      reason: "policy:manual-confirm",
      status: "skipped",
    });
  });

  it("keeps the kill switch behaviour: XPI_MEMO_AUTO_VERIFY=false skips verification", async () => {
    const result = await verifyCandidateIfNeeded(
      {
        content: "x",
        kind: "project_gene",
        repositoryFact: geneFact(),
      },
      { env: { XPI_MEMO_AUTO_VERIFY: "false" } },
    );
    expect(result).toMatchObject({
      reason: "policy:manual-confirm",
      status: "skipped",
    });
  });

  it("exposes the gene and constraint verifiers in the registry", () => {
    expect(VERIFIERS.has("project_gene")).toBe(true);
    expect(VERIFIERS.has("project_constraint")).toBe(true);
  });
});
