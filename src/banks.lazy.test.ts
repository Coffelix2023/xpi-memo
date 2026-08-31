import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { bankDbPath, bankExists, ensureProjectBank, GLOBAL_BANK } from "./banks.ts";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-lazy-bank-"));
  temporaryDirectories.push(directory);
  return directory;
}

function installFakeMnemosyne(binDir: string): string {
  const executable = join(binDir, "mnemosyne");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [command, action, bank] = process.argv.slice(2);
appendFileSync(process.env.XPI_MEMO_TEST_LOG, JSON.stringify({ command, action, bank }) + "\\n");
if (command === "bank" && action === "create") {
  mkdirSync(join(process.env.MNEMOSYNE_DATA_DIR, "banks", bank), { recursive: true });
}
`,
  );
  chmodSync(executable, 0o700);
  return executable;
}

async function withFakeMnemosyne<T>(
  dataDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const binDir = join(dataDir, "bin");
  mkdirSync(binDir, {
    recursive: true,
  });
  installFakeMnemosyne(binDir);
  const logPath = join(dataDir, "mnemosyne-calls.log");
  const previousPath = process.env.PATH;
  const previousLog = process.env.XPI_MEMO_TEST_LOG;
  const previousDataDir = process.env.MNEMOSYNE_DATA_DIR;
  process.env.PATH = `${binDir}${delimiter}${previousPath ?? ""}`;
  process.env.XPI_MEMO_TEST_LOG = logPath;
  process.env.MNEMOSYNE_DATA_DIR = dataDir;

  return operation().finally(() => {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.XPI_MEMO_TEST_LOG;
    else process.env.XPI_MEMO_TEST_LOG = previousLog;
    if (previousDataDir === undefined) delete process.env.MNEMOSYNE_DATA_DIR;
    else process.env.MNEMOSYNE_DATA_DIR = previousDataDir;
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

describe("project bank lazy creation", () => {
  it("does not create a project bank during read-only resolution", () => {
    const dataDir = createTemporaryDirectory();
    const bank = "project-p-0123456789ab";

    expect(bankDbPath(dataDir, bank)).toBe(
      join(dataDir, "banks", bank, "mnemosyne.db"),
    );
    expect(bankExists(dataDir, bank)).toBe(false);
    expect(existsSync(join(dataDir, "banks", bank))).toBe(false);
    expect(existsSync(join(dataDir, "mnemosyne.db"))).toBe(false);
  });

  it("creates a project bank only when ensureProjectBank runs", async () => {
    const dataDir = createTemporaryDirectory();
    const bank = "project-p-0123456789ab";

    await withFakeMnemosyne(dataDir, async () => {
      expect(bankExists(dataDir, bank)).toBe(false);
      expect(
        await ensureProjectBank({
          dataDir,
          projectBank: bank,
        }),
      ).toBe(true);
      expect(bankExists(dataDir, bank)).toBe(true);
      expect(existsSync(bankDbPath(dataDir, bank))).toBe(false);
    });
  });

  it("does not invoke the CLI for an existing project bank", async () => {
    const dataDir = createTemporaryDirectory();
    const bank = "project-p-abcdef012345";
    mkdirSync(join(dataDir, "banks", bank), {
      recursive: true,
    });

    await withFakeMnemosyne(dataDir, async () => {
      expect(
        await ensureProjectBank({
          dataDir,
          projectBank: bank,
        }),
      ).toBe(true);
    });

    expect(existsSync(join(dataDir, "mnemosyne-calls.log"))).toBe(false);
  });

  it("does not create or invoke the CLI without a recognized project", async () => {
    const dataDir = createTemporaryDirectory();

    await withFakeMnemosyne(dataDir, async () => {
      expect(
        await ensureProjectBank({
          dataDir,
          projectBank: null,
        }),
      ).toBe(false);
    });

    expect(existsSync(join(dataDir, "banks"))).toBe(false);
    expect(existsSync(join(dataDir, "mnemosyne-calls.log"))).toBe(false);
  });

  it("always treats the global bank as the existing default database", () => {
    const dataDir = createTemporaryDirectory();

    expect(bankExists(dataDir, GLOBAL_BANK)).toBe(true);
    expect(bankDbPath(dataDir, GLOBAL_BANK)).toBe(join(dataDir, "mnemosyne.db"));
  });
});
