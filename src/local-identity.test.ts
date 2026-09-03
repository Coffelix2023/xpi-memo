import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearLocalIdentityCache,
  initializeLocalProject,
  LOCAL_PROJECT_METADATA_DIR,
  LOCAL_PROJECT_METADATA_FILE,
  localProjectIdFor,
  resolveLocalProjectIdentity,
} from "./local-identity.ts";

const temporaryDirectories: string[] = [];
const PROJECT_ID_PATTERN = /^p-[a-f0-9]{12}$/;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-local-identity-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  clearLocalIdentityCache();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("non-Git local project identity", () => {
  it("creates only the intended metadata file on initialization", () => {
    const root = createTemporaryDirectory();

    const identity = initializeLocalProject(root);
    expect(identity).toMatchObject({
      label: identity.label,
      root: identity.root,
      source: "local",
    });
    expect(identity.id).toBe(localProjectIdFor(identity.root));
    expect(identity.id).toMatch(PROJECT_ID_PATTERN);
    expect(
      existsSync(join(root, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE)),
    ).toBe(true);
    // no SQLite or other machine-state file appears in the repository
    expect(
      readdirRecursive(root).filter((path) => !path.endsWith("project.json")),
    ).toEqual([]);
  });

  it("resolves the same identity repeatedly for a directory and descendants", () => {
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const nested = join(root, "packages", "deep");

    const first = resolveLocalProjectIdentity(root);
    const second = resolveLocalProjectIdentity(nested);

    expect(first).not.toBeNull();
    expect(second?.id).toBe(first?.id);
    expect(second?.root).toBe(first?.root);
  });

  it("keeps unrelated directories isolated", () => {
    const parent = createTemporaryDirectory();
    const first = join(parent, "one");
    const second = join(parent, "two");
    mkdirSync(first, {
      recursive: true,
    });
    mkdirSync(second, {
      recursive: true,
    });
    initializeLocalProject(first);

    expect(resolveLocalProjectIdentity(first)?.id).toBe(
      localProjectIdFor(realpathSync(first)),
    );
    expect(resolveLocalProjectIdentity(second)).toBeNull();
  });

  it("returns no identity before explicit initialization", () => {
    const directory = createTemporaryDirectory();

    expect(resolveLocalProjectIdentity(directory)).toBeNull();
    expect(resolveLocalProjectIdentity(join(directory, "sub"))).toBeNull();
  });

  it("reads a persisted identity across cache clears", () => {
    const root = createTemporaryDirectory();
    const identity = initializeLocalProject(root);
    clearLocalIdentityCache();

    const reread = resolveLocalProjectIdentity(root);

    expect(reread).toMatchObject({
      id: identity.id,
      root: identity.root,
      source: "local",
    });
    const raw = JSON.parse(
      readFileSync(
        join(root, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE),
        "utf8",
      ),
    ) as Record<string, string>;
    expect(raw.id).toBe(identity.id);
  });

  it("treats a corrupt metadata file as uninitialized", () => {
    const root = createTemporaryDirectory();
    mkdirSync(join(root, LOCAL_PROJECT_METADATA_DIR), {
      recursive: true,
    });
    writeFileSync(
      join(root, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE),
      "{not-json",
    );

    expect(resolveLocalProjectIdentity(root)).toBeNull();
  });
});

function readdirRecursive(directory: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      entries.push(...readdirRecursive(path).map((child) => join(entry, child)));
    } else {
      entries.push(entry);
    }
  }
  return entries;
}
