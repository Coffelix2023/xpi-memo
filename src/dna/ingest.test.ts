import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { upsertDnaEntry } from "./ingest.ts";
import { dnaFilePath } from "./load.ts";
import type { DnaEntry } from "./schema.ts";

const temporaryDirectories: string[] = [];

function projectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xpi-memo-dna-ingest-"));
  temporaryDirectories.push(dir);
  return dir;
}

function writeDna(dir: string, text: string): void {
  mkdirSync(join(dir, ".pi"), {
    recursive: true,
  });
  writeFileSync(dnaFilePath(dir), text, "utf8");
}

function readDna(dir: string): string {
  return readFileSync(dnaFilePath(dir), "utf8");
}

function entry(overrides: Partial<DnaEntry> = {}): DnaEntry {
  return {
    confidence: "high",
    id: "gap-width",
    semantic: "组件间距 gap 不小于 12px",
    source: "agent-derived",
    ...overrides,
  };
}

const userFile = `# 用户手编的注释,勿删
art:
  # 卡片规则
  - id: card-border
    semantic: 卡片需要 1px border
    source: user-authored
    confidence: high
write: []
`;

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, {
      force: true,
      recursive: true,
    });
  }
});

describe("DNA write pipeline (tasks 4.1-4.3)", () => {
  it("rejects schema-invalid entries before touching disk", () => {
    const dir = projectDir();
    writeDna(dir, userFile);
    const before = readDna(dir);
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry({
        id: "Bad_ID",
      }),
      trusted: true,
    });
    expect(result).toMatchObject({
      reason: "schema",
      status: "rejected",
    });
    expect(readDna(dir)).toBe(before);
  });

  it("rejects prohibited content with a bounded label and unchanged file", () => {
    const dir = projectDir();
    writeDna(dir, userFile);
    const before = readDna(dir);
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry({
        semantic: "调试时的 cookie: 策略说明",
      }),
      trusted: true,
    });
    expect(result).toMatchObject({
      detail: "cookie",
      reason: "content-policy",
      status: "rejected",
    });
    expect(readDna(dir)).toBe(before);
  });

  it("refuses when credential safety cannot be confirmed", () => {
    const dir = projectDir();
    writeDna(dir, userFile);
    const before = readDna(dir);
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry({
        semantic: "粘贴的密钥 -----BEGIN OPENSSH PRIVATE KEY----- abc123",
      }),
      trusted: true,
    });
    expect(result).toMatchObject({
      detail: "uncertain-credential",
      reason: "unsafe-external",
      status: "rejected",
    });
    expect(readDna(dir)).toBe(before);
  });

  it("rejects writes in untrusted projects without creating the file", () => {
    const dir = projectDir();
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry(),
      trusted: false,
    });
    expect(result).toMatchObject({
      reason: "untrusted",
      status: "rejected",
    });
    expect(existsSync(dnaFilePath(dir))).toBe(false);
  });

  it("appends a new entry while preserving user entries and comments", () => {
    const dir = projectDir();
    writeDna(dir, userFile);
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry(),
      trusted: true,
    });
    expect(result.status).toBe("stored");
    const after = readDna(dir);
    expect(after).toContain("# 用户手编的注释,勿删");
    expect(after).toContain("# 卡片规则");
    expect(after).toContain("card-border");
    expect(after).toContain("gap-width");
  });

  it("keeps the user version on a conflicting update (task 4.3)", () => {
    const dir = projectDir();
    writeDna(dir, userFile);
    const before = readDna(dir);
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry({
        id: "card-border",
        semantic: "Agent 想改成的新说法",
        source: "agent-derived",
      }),
      trusted: true,
    });
    expect(result).toMatchObject({
      detail: "entry card-border is user-authored; user version kept",
      reason: "conflict",
      status: "rejected",
    });
    expect(readDna(dir)).toBe(before);
  });

  it("treats an identical re-write of a user entry as stored without touching the file", () => {
    const dir = projectDir();
    writeDna(dir, userFile);
    const before = readDna(dir);
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry({
        id: "card-border",
        semantic: "卡片需要 1px border",
        source: "agent-translated-user-confirmed",
      }),
      trusted: true,
    });
    expect(result.status).toBe("stored");
    expect(readDna(dir)).toBe(before);
  });

  it("updates agent-owned entries in place", () => {
    const dir = projectDir();
    const first = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry(),
      trusted: true,
    });
    expect(first.status).toBe("stored");
    const second = upsertDnaEntry({
      cwd: dir,
      domain: "art",
      entry: entry({
        semantic: "组件间距 gap 不小于 16px",
      }),
      trusted: true,
    });
    expect(second.status).toBe("stored");
    const after = readDna(dir);
    expect(after).toContain("16px");
    expect(after).not.toContain("12px");
  });

  it("creates the file on first explicit write and round-trips through the parser", () => {
    const dir = projectDir();
    const result = upsertDnaEntry({
      cwd: dir,
      domain: "write",
      entry: entry(),
      trusted: true,
    });
    expect(result.status).toBe("stored");
    expect(existsSync(dnaFilePath(dir))).toBe(true);
    const after = readDna(dir);
    expect(after).toContain("gap-width");
    expect(after).toContain("write:");
  });
});
