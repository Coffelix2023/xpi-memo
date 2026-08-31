import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { bankDbPath, bankExists, GLOBAL_BANK } from "./banks.ts";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-banks-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("bank resolution", () => {
  it("resolves the global bank to Mnemosyne's default database", () => {
    const dataDir = createTemporaryDirectory();

    expect(bankDbPath(dataDir, GLOBAL_BANK)).toBe(join(dataDir, "mnemosyne.db"));
    expect(bankExists(dataDir, GLOBAL_BANK)).toBe(true);
  });

  it("resolves a project bank below the isolated banks directory", () => {
    const dataDir = createTemporaryDirectory();
    const bank = "project-p-0123456789ab";

    expect(bankDbPath(dataDir, bank)).toBe(
      join(dataDir, "banks", bank, "mnemosyne.db"),
    );
    expect(bankExists(dataDir, bank)).toBe(false);

    mkdirSync(join(dataDir, "banks", bank), {
      recursive: true,
    });
    expect(bankExists(dataDir, bank)).toBe(true);
  });

  it("keeps global and project databases physically separate", () => {
    const dataDir = createTemporaryDirectory();
    const projectBank = "project-p-abcdef012345";

    expect(bankDbPath(dataDir, GLOBAL_BANK)).not.toBe(bankDbPath(dataDir, projectBank));
    expect(bankDbPath(dataDir, projectBank)).toContain(
      join(dataDir, "banks", projectBank),
    );
    expect(bankDbPath(dataDir, projectBank)).not.toBe(join(dataDir, "mnemosyne.db"));
  });

  it("does not confuse projects that share a display basename", () => {
    const dataDir = createTemporaryDirectory();
    const firstBank = "project-p-aaaaaaaaaaaa";
    const secondBank = "project-p-bbbbbbbbbbbb";

    expect(bankDbPath(dataDir, firstBank)).not.toBe(bankDbPath(dataDir, secondBank));
    expect(bankExists(dataDir, firstBank)).toBe(false);
    expect(bankExists(dataDir, secondBank)).toBe(false);
  });
});
