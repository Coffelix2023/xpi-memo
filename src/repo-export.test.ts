/**
 * Repository Markdown export + governed re-import (tasks 6.1-6.4).
 *
 * The machine state (SQLite bank) is the single source of truth; export
 * derives stable Markdown under `.pi/memory/`, and re-import routes entries
 * back through the candidate governance path with `repo-export` evidence.
 */
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

import { afterEach, describe, expect, it } from "vitest";

import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import { createL0Coordinator } from "./l0/l0-runtime.js";
import {
  encodeSourceMetadata,
  type MnemosyneAdapter,
  type T1MemoryOperation,
} from "./operations.js";
import {
  detectOrphanBanks,
  discoverRepoExport,
  exportProjectMemory,
  parseRepoMemoryMarkdown,
  type RepoMemoryEntry,
  reimportRepoExport,
  renderRepoMemoryMarkdown,
  repoMemoryDir,
} from "./repo-export.js";

const directories: string[] = [];

function temporaryDirectory(prefix = "xpi-memo-repo-export-"): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory)
      rmSync(directory, {
        force: true,
        recursive: true,
      });
  }
});

function adapter(stored: T1MemoryOperation[] = []): MnemosyneAdapter {
  return {
    store: async (operation) => {
      stored.push(operation);
      return {
        id: "memory-1",
        operation,
        output: "stored",
      };
    },
  };
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
    provenance: "test",
    scope,
    source: {
      evidenceType: "verified-tool-result",
      ...(sessionId
        ? {
            sessionId,
          }
        : {}),
      source: "test",
      timestamp: new Date().toISOString(),
    },
    targetBank,
  };
}

function encodedSource(op: T1MemoryOperation): string {
  return encodeSourceMetadata(op);
}

/** Minimal `mnemosyne export` mock: emits a JSON file with working_memory rows. */
function exportRun(rows: Array<Record<string, unknown>>) {
  return async (args: string[]): Promise<string> => {
    if (args[0] === "export" && args[1]) {
      const output = {
        working_memory: rows,
        mnemosyne_export: {
          version: "1.3",
        },
      };
      writeFileSync(args[1], JSON.stringify(output));
    }
    return "";
  };
}

describe("repo-export render + parse (tasks 6.1-6.2)", () => {
  it("renders deterministic per-kind Markdown with stable anchors and stable ordering", () => {
    const dataDir = temporaryDirectory();
    const projectBank = "project-demo";
    const first = operation(
      dataDir,
      "use pnpm",
      "project_constraint",
      projectBank,
      "project",
    );
    const second = operation(
      dataDir,
      "keep the adapter",
      "project_decision",
      projectBank,
      "project",
    );
    const entries: RepoMemoryEntry[] = [
      {
        content: second.content,
        id: "memory-2",
        kind: "project_decision",
        scope: "project",
        source: encodedSource(second),
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        content: first.content,
        id: "memory-1",
        kind: "project_constraint",
        scope: "project",
        source: encodedSource(first),
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];

    const files = renderRepoMemoryMarkdown(entries);
    expect(Object.keys(files)).toEqual([
      "project_constraint.md",
      "project_decision.md",
    ]);
    const decisionMd = files["project_decision.md"];
    expect(decisionMd).toContain("# Decisions");
    expect(decisionMd).toContain("memory `memory-2`");
    expect(decisionMd).toContain("kind `project_decision`");
    expect(decisionMd).toContain("scope `project`");
    expect(decisionMd).toContain("source `kind=project_decision");
    expect(decisionMd).toContain("- keep the adapter");

    // Stable: same input renders byte-identical output.
    expect(renderRepoMemoryMarkdown(entries)).toEqual(files);
  });

  it("round-trips rendered Markdown back into machine-readable entries", () => {
    const dataDir = temporaryDirectory();
    const projectBank = "project-demo";
    const op = operation(
      dataDir,
      "never add runtime deps",
      "project_constraint",
      projectBank,
      "project",
    );
    const entries: RepoMemoryEntry[] = [
      {
        content: op.content,
        id: "memory-9",
        kind: "project_constraint",
        scope: "project",
        source: encodedSource(op),
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    const files = renderRepoMemoryMarkdown(entries);
    const parsed = parseRepoMemoryMarkdown(
      files["project_constraint.md"] ?? "",
      "project_constraint",
    );
    expect(parsed).toEqual([
      expect.objectContaining({
        content: "never add runtime deps",
        id: "memory-9",
        kind: "project_constraint",
        scope: "project",
      }),
    ]);
  });

  it("sorts entries by stable id so unchanged banks produce identical files", () => {
    const mk = (id: string, content: string): RepoMemoryEntry => ({
      content,
      id,
      kind: "project_decision",
      scope: "project",
      source: "",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const a = renderRepoMemoryMarkdown([
      mk("memory-2", "b"),
      mk("memory-1", "a"),
    ]);
    const b = renderRepoMemoryMarkdown([
      mk("memory-1", "a"),
      mk("memory-2", "b"),
    ]);
    expect(a).toEqual(b);
    const decision = a["project_decision.md"] ?? "";
    expect(decision.indexOf("memory-1")).toBeLessThan(decision.indexOf("memory-2"));
  });
});

describe("collectProjectMemory + exportProjectMemory (task 6.1)", () => {
  it("writes only governed project Markdown under .pi/memory/ and skips prohibited content", async () => {
    const dataDir = temporaryDirectory();
    const projectRoot = temporaryDirectory("xpi-memo-repo-root-");
    const projectBank = "project-demo";
    const op = operation(
      dataDir,
      "we chose TypeScript",
      "project_decision",
      projectBank,
      "project",
    );
    const secretOp = operation(
      dataDir,
      "remember api_key=super-secret-value must never export",
      "project_decision",
      projectBank,
      "project",
    );
    const run = exportRun([
      {
        content: op.content,
        id: "memory-11",
        importance: 0.9,
        source: encodedSource(op),
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        content: secretOp.content,
        id: "memory-12",
        importance: 0.9,
        source: encodedSource(secretOp),
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await exportProjectMemory({
      dataDir,
      privacy: false,
      projectBank,
      projectRoot,
      run,
    });
    expect(result.files).toEqual([
      "project_decision.md",
    ]);
    expect(result.rejected).toBe(1);

    const dir = repoMemoryDir(projectRoot);
    expect(existsSync(join(dir, "project_decision.md"))).toBe(true);
    const markdown = readFileSync(join(dir, "project_decision.md"), "utf8");
    expect(markdown).toContain("we chose TypeScript");
    expect(markdown).not.toContain("api_key=");
    // No machine-state files ever enter the repository.
    const allFiles = readdirSync(projectRoot, {
      recursive: true,
    }) as string[];
    expect(
      allFiles.some(
        (name) =>
          name.endsWith(".db") || name.endsWith(".db-wal") || name.endsWith(".db-shm"),
      ),
    ).toBe(false);
  });

  it("applies privacy redaction to exported content", async () => {
    const dataDir = temporaryDirectory();
    const projectRoot = temporaryDirectory("xpi-memo-repo-root-");
    const projectBank = "project-demo";
    const op = operation(
      dataDir,
      "deploy to /srv/prod-server/secret-dir at 9am",
      "project_decision",
      projectBank,
      "project",
    );
    const run = exportRun([
      {
        content: op.content,
        id: "memory-13",
        importance: 0.9,
        source: encodedSource(op),
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await exportProjectMemory({
      dataDir,
      privacy: true,
      projectBank,
      projectRoot,
      run,
    });
    const markdown = readFileSync(
      join(repoMemoryDir(projectRoot), "project_decision.md"),
      "utf8",
    );
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).not.toContain("/srv/prod-server");
  });
});

describe("discoverRepoExport + reimportRepoExport (task 6.3)", () => {
  it("discovers entries from .pi/memory/<kind>.md files", async () => {
    const projectRoot = temporaryDirectory("xpi-memo-repo-root-");
    const dir = repoMemoryDir(projectRoot);
    mkdirSync(dir, {
      recursive: true,
    });
    writeFileSync(
      join(dir, "project_decision.md"),
      "# Decisions\n\n<!-- xpi-memo repo-export -->\n\n- keep the adapter\n  <sub>memory `m-1` · kind `project_decision` · scope `project` · source `` · updated ``</sub>\n",
    );
    const entries = discoverRepoExport(projectRoot);
    expect(entries).toEqual([
      expect.objectContaining({
        content: "keep the adapter",
        id: "m-1",
        kind: "project_decision",
        scope: "project",
      }),
    ]);
  });

  it("routes discovered entries through candidate governance with repo-export evidence and dedupes", async () => {
    const dataDir = temporaryDirectory();
    const projectBank = "project-demo";
    const stored: T1MemoryOperation[] = [];
    const audit = createAuditLog({
      statePath: join(dataDir, "audit.json"),
    });
    const candidates = createCandidateStore({
      adapter: adapter(stored),
      statePath: join(dataDir, "candidates.json"),
    });
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });
    const entry: RepoMemoryEntry = {
      content: "keep the adapter",
      id: "m-1",
      kind: "project_decision",
      scope: "project",
      source: "",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const runtime = {
      audit,
      candidates,
      context: {
        dataDir,
        identity: "git" as const,
        projectBank,
      },
      dataDir,
      l0,
    };

    const first = await reimportRepoExport(
      [
        entry,
      ],
      runtime,
    );
    expect(first).toEqual({
      duplicates: 0,
      imported: 1,
      rejected: 0,
    });
    // Candidate queued, never a direct T1 write.
    expect(stored).toHaveLength(0);
    expect(candidates.list()).toHaveLength(1);
    expect(candidates.list()[0]?.kind).toBe("project_decision");
    expect(audit.list().map((entry2) => entry2.action)).toContain("candidate");
    expect(
      audit.list().find((entry2) => entry2.action === "candidate")?.metadata
        .evidenceType,
    ).toBe("repo-export");

    // Repeating discovery does not duplicate candidates or rows.
    const second = await reimportRepoExport(
      [
        entry,
      ],
      runtime,
    );
    expect(second).toEqual({
      duplicates: 1,
      imported: 0,
      rejected: 0,
    });
    expect(candidates.list()).toHaveLength(1);
    expect(stored).toHaveLength(0);
  });

  it("rejects entries without a project identity and never writes globally", async () => {
    const dataDir = temporaryDirectory();
    const stored: T1MemoryOperation[] = [];
    const audit = createAuditLog({
      statePath: join(dataDir, "audit.json"),
    });
    const candidates = createCandidateStore({
      adapter: adapter(stored),
      statePath: join(dataDir, "candidates.json"),
    });
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });
    const entry: RepoMemoryEntry = {
      content: "project rule from a repo file",
      id: "m-2",
      kind: "project_constraint",
      scope: "project",
      source: "",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const result = await reimportRepoExport(
      [
        entry,
      ],
      {
        audit,
        candidates,
        context: {
          dataDir,
          identity: "none" as const,
          projectBank: null,
        },
        dataDir,
        l0,
      },
    );
    expect(result).toEqual({
      duplicates: 0,
      imported: 0,
      rejected: 1,
    });
    expect(stored).toHaveLength(0);
    expect(candidates.list()).toHaveLength(0);
    expect(audit.list().map((e) => e.action)).toEqual([
      "rejection",
    ]);
  });

  it("rejects prohibited content without creating candidates or exposing the body", async () => {
    const dataDir = temporaryDirectory();
    const projectBank = "project-demo";
    const stored: T1MemoryOperation[] = [];
    const audit = createAuditLog({
      statePath: join(dataDir, "audit.json"),
    });
    const candidates = createCandidateStore({
      adapter: adapter(stored),
      statePath: join(dataDir, "candidates.json"),
    });
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });
    const entry: RepoMemoryEntry = {
      content: "token=abc123secret never export",
      id: "m-3",
      kind: "project_decision",
      scope: "project",
      source: "",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const result = await reimportRepoExport(
      [
        entry,
      ],
      {
        audit,
        candidates,
        context: {
          dataDir,
          identity: "git" as const,
          projectBank,
        },
        dataDir,
        l0,
      },
    );
    expect(result.rejected).toBe(1);
    expect(stored).toHaveLength(0);
    expect(candidates.list()).toHaveLength(0);
    expect(JSON.stringify(audit.list())).not.toContain("abc123secret");
  });
});
describe("detectOrphanBanks (task 6.4)", () => {
  it("reports only unrecognized project banks read-only, never deleting", () => {
    const dataDir = temporaryDirectory();
    mkdirSync(join(dataDir, "banks", "project-known"), {
      recursive: true,
    });
    mkdirSync(join(dataDir, "banks", "project-orphan"), {
      recursive: true,
    });
    mkdirSync(join(dataDir, "banks", "project-current"), {
      recursive: true,
    });

    const orphans = detectOrphanBanks({
      currentBank: "project-current",
      dataDir,
      knownBanks: [
        "project-known",
      ],
    });

    expect(orphans).toEqual([
      {
        bank: "project-orphan",
        reason: "no matching project identity in the local registry",
      },
    ]);
    // Nothing was deleted; the bank directory still exists.
    expect(existsSync(join(dataDir, "banks", "project-orphan"))).toBe(true);
  });

  it("returns an empty list when no banks directory exists", () => {
    const dataDir = temporaryDirectory();
    expect(
      detectOrphanBanks({
        currentBank: null,
        dataDir,
        knownBanks: [],
      }),
    ).toEqual([]);
  });
});
