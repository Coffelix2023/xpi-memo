import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { dnaFilePath, loadDna } from "./load.ts";

const temporaryDirectories: string[] = [];

function projectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xpi-memo-dna-load-"));
  temporaryDirectories.push(dir);
  return dir;
}

function writeDna(dir: string, text: string): void {
  mkdirSync(join(dir, ".pi"), {
    recursive: true,
  });
  writeFileSync(dnaFilePath(dir), text, "utf8");
}

const validFile = `art:
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
describe("trust-gated DNA load (task 3.1)", () => {
  it("stays disabled in an untrusted project even when the file exists", () => {
    const dir = projectDir();
    writeDna(dir, validFile);
    expect(
      loadDna({
        cwd: dir,
        trusted: false,
      }),
    ).toEqual({
      status: "disabled",
    });
  });

  it("stays disabled when the file is absent and never creates it", () => {
    const dir = projectDir();
    expect(
      loadDna({
        cwd: dir,
        trusted: true,
      }),
    ).toEqual({
      status: "disabled",
    });
    expect(existsSync(dnaFilePath(dir))).toBe(false);
  });

  it("returns the file when trusted and valid", () => {
    const dir = projectDir();
    writeDna(dir, validFile);
    const result = loadDna({
      cwd: dir,
      trusted: true,
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.file.art?.[0]?.id).toBe("card-border");
  });

  it("fails closed on an invalid file with bounded issues", () => {
    const dir = projectDir();
    writeDna(dir, "art: not-a-list\n");
    const result = loadDna({
      cwd: dir,
      trusted: true,
    });
    expect(result.status).toBe("disabled");
    if (result.status === "disabled") expect(result.issues?.length).toBeGreaterThan(0);
  });
});
