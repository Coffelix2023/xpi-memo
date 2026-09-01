import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearIdentityCache,
  normalizeRemote,
  projectIdFor,
  resolveProjectIdentity,
} from "./identity.ts";

const temporaryDirectories: string[] = [];
const PROJECT_ID_PATTERN = /^p-[a-f0-9]{12}$/;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-identity-"));
  temporaryDirectories.push(directory);
  return directory;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: [
      "ignore",
      "pipe",
      "pipe",
    ],
  }).trim();
}

function createRepository(parent: string, name: string): string {
  const repository = join(parent, name);
  mkdirSync(parent, {
    recursive: true,
  });
  git(parent, [
    "init",
    "--quiet",
    repository,
  ]);
  git(repository, [
    "config",
    "user.email",
    "xpi-memo-tests@example.invalid",
  ]);
  git(repository, [
    "config",
    "user.name",
    "XpiMemo Tests",
  ]);
  writeFileSync(join(repository, "README.md"), "identity spike\n");
  git(repository, [
    "add",
    "README.md",
  ]);
  git(repository, [
    "commit",
    "--quiet",
    "-m",
    "initial",
  ]);
  return repository;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("project identity spike", () => {
  it("resolves a normal repository to a stable identity", () => {
    const parent = createTemporaryDirectory();
    const repository = createRepository(parent, "repo");
    const identity = resolveProjectIdentity(repository);

    expect(identity).not.toBeNull();
    expect(identity?.id).toBe(projectIdFor(identity?.commonDir ?? ""));
    expect(identity?.canonicalRoot).toBe(realpathSync(repository));
    expect(identity?.root).toBe(realpathSync(repository));
    expect(identity?.isWorktree).toBe(false);
    expect(identity?.label).toBe("repo");
  });

  it("keeps same-basename repositories in distinct identities", () => {
    const parent = createTemporaryDirectory();
    const first = createRepository(join(parent, "one"), "repo");
    const second = createRepository(join(parent, "two"), "repo");
    const firstIdentity = resolveProjectIdentity(first);
    const secondIdentity = resolveProjectIdentity(second);

    expect(firstIdentity?.id).not.toBe(secondIdentity?.id);
    expect(firstIdentity?.commonDir).not.toBe(secondIdentity?.commonDir);
  });

  it("uses one identity for the main worktree and a linked worktree", () => {
    const parent = createTemporaryDirectory();
    const repository = createRepository(parent, "repo");
    const worktree = join(parent, "repo-worktree");
    git(repository, [
      "worktree",
      "add",
      "--quiet",
      "-b",
      "feature",
      worktree,
    ]);

    const mainIdentity = resolveProjectIdentity(repository);
    const worktreeIdentity = resolveProjectIdentity(worktree);

    expect(worktreeIdentity?.id).toBe(mainIdentity?.id);
    expect(worktreeIdentity?.commonDir).toBe(mainIdentity?.commonDir);
    expect(worktreeIdentity?.canonicalRoot).toBe(mainIdentity?.canonicalRoot);
    expect(worktreeIdentity?.root).toBe(realpathSync(worktree));
    expect(worktreeIdentity?.isWorktree).toBe(true);
  });

  it("resolves repositories without remotes without losing identity", () => {
    const parent = createTemporaryDirectory();
    const repository = createRepository(parent, "offline-repo");
    const identity = resolveProjectIdentity(repository);

    expect(identity).not.toBeNull();
    expect(identity?.remotes).toEqual([]);
    expect(identity?.id).toMatch(PROJECT_ID_PATTERN);
  });

  it("keeps a moved repository identifiable through its normalized remote alias", () => {
    const parent = createTemporaryDirectory();
    const repository = createRepository(parent, "before-move");
    git(repository, [
      "remote",
      "add",
      "origin",
      "git@github.com:Example/Repo.git",
    ]);
    const beforeMove = resolveProjectIdentity(repository);
    const movedRepository = join(parent, "after-move");
    renameSync(repository, movedRepository);
    const afterMove = resolveProjectIdentity(movedRepository);

    expect(afterMove?.id).not.toBe(beforeMove?.id);
    expect(afterMove?.remotes).toEqual([
      "ssh://github.com/Example/Repo",
    ]);
    expect(afterMove?.canonicalRoot).toBe(realpathSync(movedRepository));
  });

  it("returns no identity outside a Git worktree", () => {
    const directory = createTemporaryDirectory();

    expect(resolveProjectIdentity(directory)).toBeNull();
  });

  it("caches the identity per cwd across repeated calls (task 14.3)", () => {
    const parent = createTemporaryDirectory();
    const repository = createRepository(parent, "cached-repo");
    const subdirectory = join(repository, "packages");
    mkdirSync(subdirectory);
    const first = resolveProjectIdentity(repository);
    const second = resolveProjectIdentity(repository);
    expect(second).toBe(first); // same object reference = cache hit
    // distinct cache key resolves fresh, but must land on the same project id
    expect(resolveProjectIdentity(subdirectory)?.id).toBe(first?.id);
    clearIdentityCache();
    const third = resolveProjectIdentity(repository);
    expect(third).not.toBe(first); // fresh resolve after explicit invalidation
    expect(third?.id).toBe(first?.id);
  });
});

describe("remote normalization", () => {
  it("normalizes scp-style SSH URLs and credentials consistently", () => {
    expect(normalizeRemote("git@github.com:Example/Repo.git")).toBe(
      "ssh://github.com/Example/Repo",
    );
    expect(normalizeRemote("https://token@GitHub.com/Example/Repo.git/")).toBe(
      "https://github.com/Example/Repo",
    );
  });
});
