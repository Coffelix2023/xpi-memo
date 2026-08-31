import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectIdentity } from "./identity.ts";
import {
  emptyRegistry,
  loadRegistry,
  registryPath,
  saveRegistry,
  upsertIdentity,
} from "./registry.ts";

const temporaryDirectories: string[] = [];
const PROJECT_ID_PATTERN = /^p-[a-f0-9]{12}$/;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-registry-"));
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

describe("project registry persistence", () => {
  it("persists the complete project entry and restores it", () => {
    const agentDir = createTemporaryDirectory();
    const projectRoot = join(agentDir, "project");
    mkdirSync(projectRoot, {
      recursive: true,
    });
    const registryFile = registryPath(agentDir);
    const identity = {
      canonicalRoot: projectRoot,
      commonDir: join(projectRoot, ".git"),
      id: "p-0123456789ab",
      isWorktree: true,
      label: "project",
      root: join(agentDir, "project-worktree"),
      remotes: [
        "ssh://github.com/Example/Project",
      ],
    };

    const registry = emptyRegistry();
    const { entry, moved } = upsertIdentity(registry, identity);
    saveRegistry(registryFile, registry);
    const restored = loadRegistry(registryFile);

    expect(moved).toBe(false);
    expect(entry).toMatchObject({
      bank: "project-p-0123456789ab",
      canonicalRoot: projectRoot,
      id: "p-0123456789ab",
      label: "project",
      remotes: [
        "ssh://github.com/Example/Project",
      ],
      worktreeRoots: [
        join(agentDir, "project-worktree"),
      ],
    });
    expect(entry.createdAt).toBeTruthy();
    expect(entry.updatedAt).toBe(entry.createdAt);
    expect(restored).toEqual(registry);
  });

  it("refreshes an existing entry without changing its bank", () => {
    const agentDir = createTemporaryDirectory();
    const registryFile = registryPath(agentDir);
    const firstIdentity = {
      canonicalRoot: "/workspace/project",
      commonDir: "/workspace/project/.git",
      id: "p-aaaaaaaaaaaa",
      isWorktree: false,
      label: "project",
      root: "/workspace/project",
      remotes: [
        "https://github.com/example/project",
      ],
    };
    const secondIdentity = {
      ...firstIdentity,
      label: "renamed-project",
      remotes: [
        ...firstIdentity.remotes,
        "ssh://github.com/example/project",
      ],
    };
    const registry = emptyRegistry();

    const first = upsertIdentity(registry, firstIdentity).entry;
    const second = upsertIdentity(registry, secondIdentity).entry;
    saveRegistry(registryFile, registry);

    expect(second.bank).toBe(first.bank);
    expect(second.label).toBe("renamed-project");
    expect(second.remotes).toEqual([
      "https://github.com/example/project",
      "ssh://github.com/example/project",
    ]);
    expect(loadRegistry(registryFile).projects[first.id]).toMatchObject({
      bank: first.bank,
      label: "renamed-project",
    });
  });

  it("records additional linked worktree roots without duplicating them", () => {
    const registry = emptyRegistry();
    const identity = {
      canonicalRoot: "/workspace/project",
      commonDir: "/workspace/project/.git",
      id: "p-bbbbbbbbbbbb",
      isWorktree: true,
      label: "project",
      remotes: [],
      root: "/workspace/project-worktree",
    };

    const first = upsertIdentity(registry, identity).entry;
    const second = upsertIdentity(registry, identity).entry;

    expect(first.worktreeRoots).toEqual([
      "/workspace/project-worktree",
    ]);
    expect(second.worktreeRoots).toEqual([
      "/workspace/project-worktree",
    ]);
  });

  it("writes a private registry directory and file", () => {
    const agentDir = createTemporaryDirectory();
    const registryFile = registryPath(agentDir);
    saveRegistry(registryFile, emptyRegistry());

    const directoryMode = statSync(join(agentDir, "mnemosyne")).mode & 0o777;
    const fileMode = statSync(registryFile).mode & 0o777;
    const raw = readFileSync(registryFile, "utf8");

    expect(directoryMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
    expect(JSON.parse(raw)).toEqual({
      projects: {},
      version: 1,
    });
  });

  it("returns an empty registry for missing or malformed files", () => {
    const agentDir = createTemporaryDirectory();
    const registryFile = registryPath(agentDir);
    expect(loadRegistry(registryFile)).toEqual({
      projects: {},
      version: 1,
    });

    mkdirSync(join(agentDir, "mnemosyne"), {
      recursive: true,
    });
    writeFileSync(registryFile, "not-json\n");
    expect(loadRegistry(registryFile)).toEqual({
      projects: {},
      version: 1,
    });
  });

  it("records the current project identity when resolving a real Git project", () => {
    const identity = resolveProjectIdentity(process.cwd());
    expect(identity).not.toBeNull();
    expect(identity?.id).toMatch(PROJECT_ID_PATTERN);
  });
});
