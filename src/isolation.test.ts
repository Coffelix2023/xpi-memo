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

import { bankDbPath } from "./banks.ts";
import {
  emptyRegistry,
  loadRegistry,
  registryPath,
  saveRegistry,
  upsertIdentity,
} from "./registry.ts";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-isolation-"));
  temporaryDirectories.push(directory);
  return directory;
}

function identity(overrides: Partial<Parameters<typeof upsertIdentity>[1]> = {}) {
  return {
    canonicalRoot: "/workspace/project",
    commonDir: "/workspace/project/.git",
    id: "p-aaaaaaaaaaaa",
    isWorktree: false,
    label: "project",
    root: "/workspace/project",
    remotes: [
      "ssh://github.com/example/project",
    ],
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("registry and bank isolation", () => {
  it("leaves a malformed registry untouched while routing from an empty registry", () => {
    const agentDir = createTemporaryDirectory();
    const file = registryPath(agentDir);
    mkdirSync(join(agentDir, "mnemosyne"), {
      recursive: true,
    });
    const malformed = "not-json\n";
    writeFileSync(file, malformed);

    expect(loadRegistry(file)).toEqual({
      projects: {},
      version: 1,
    });
    expect(readFileSync(file, "utf8")).toBe(malformed);
  });

  it("writes atomically without leaving a temporary registry file", () => {
    const agentDir = createTemporaryDirectory();
    const file = registryPath(agentDir);
    const registry = emptyRegistry();
    upsertIdentity(registry, identity());

    saveRegistry(file, registry);

    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    expect(loadRegistry(file)).toEqual(registry);
  });

  it("repairs a moved project by remote without creating or merging banks", () => {
    const agentDir = createTemporaryDirectory();
    const registry = emptyRegistry();
    const original = identity();
    const moved = identity({
      canonicalRoot: "/moved/project",
      commonDir: "/moved/project/.git",
      id: "p-bbbbbbbbbbbb",
      root: "/moved/project",
    });

    const originalEntry = upsertIdentity(registry, original).entry;
    const result = upsertIdentity(registry, moved);
    const registryFile = registryPath(agentDir);
    saveRegistry(registryFile, registry);

    expect(result.moved).toBe(true);
    expect(result.entry.bank).toBe(originalEntry.bank);
    expect(Object.keys(registry.projects)).toEqual([
      moved.id,
    ]);
    expect(registry.projects[moved.id]?.bank).toBe(originalEntry.bank);
    expect(bankDbPath(join(agentDir, "mnemosyne"), originalEntry.bank)).toBe(
      join(agentDir, "mnemosyne", "banks", originalEntry.bank, "mnemosyne.db"),
    );
  });

  it("keeps a linked worktree on the canonical project's bank", () => {
    const registry = emptyRegistry();
    const main = identity();
    const worktree = identity({
      isWorktree: true,
      root: "/workspace/project-worktree",
    });

    const mainEntry = upsertIdentity(registry, main).entry;
    const worktreeEntry = upsertIdentity(registry, worktree).entry;

    expect(worktreeEntry.id).toBe(mainEntry.id);
    expect(worktreeEntry.bank).toBe(mainEntry.bank);
    expect(worktreeEntry.worktreeRoots).toEqual([
      "/workspace/project-worktree",
    ]);
    expect(Object.keys(registry.projects)).toHaveLength(1);
  });

  it("does not delete an existing project bank during registry refresh", () => {
    const agentDir = createTemporaryDirectory();
    const registry = emptyRegistry();
    const project = identity();
    const entry = upsertIdentity(registry, project).entry;
    const bankDir = join(agentDir, "mnemosyne", "banks", entry.bank);
    mkdirSync(bankDir, {
      recursive: true,
    });
    const marker = join(bankDir, "mnemosyne.db");
    writeFileSync(marker, "existing-memory-marker\n");

    saveRegistry(registryPath(agentDir), registry);
    upsertIdentity(
      registry,
      identity({
        label: "updated-project",
      }),
    );
    saveRegistry(registryPath(agentDir), registry);

    expect(readFileSync(marker, "utf8")).toBe("existing-memory-marker\n");
    expect(loadRegistry(registryPath(agentDir)).projects[project.id]?.label).toBe(
      "updated-project",
    );
  });
});
