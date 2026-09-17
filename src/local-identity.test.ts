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
import { join, parse } from "node:path";

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

  it("writes project.json with mode 0600", () => {
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const mode =
      statSync(join(root, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE))
        .mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("resolves the same identity repeatedly for a directory and descendants", () => {
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const nested = join(root, "packages", "deep");

    const first = resolveLocalProjectIdentity(root, true);
    const second = resolveLocalProjectIdentity(nested, true);

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

    expect(resolveLocalProjectIdentity(first, true)?.id).toBe(
      localProjectIdFor(realpathSync(first)),
    );
    expect(resolveLocalProjectIdentity(second, true)).toBeNull();
  });

  it("returns no identity before explicit initialization", () => {
    const directory = createTemporaryDirectory();

    expect(resolveLocalProjectIdentity(directory, true)).toBeNull();
    expect(resolveLocalProjectIdentity(join(directory, "sub"), true)).toBeNull();
  });

  it("reads a persisted identity across cache clears", () => {
    const root = createTemporaryDirectory();
    const identity = initializeLocalProject(root);
    clearLocalIdentityCache();

    const reread = resolveLocalProjectIdentity(root, true);

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

    expect(resolveLocalProjectIdentity(root, true)).toBeNull();
  });

  it("ignores valid metadata in an untrusted context without reading it", () => {
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const metadataPath = join(
      root,
      LOCAL_PROJECT_METADATA_DIR,
      LOCAL_PROJECT_METADATA_FILE,
    );
    expect(existsSync(metadataPath)).toBe(true);

    expect(resolveLocalProjectIdentity(root, false)).toBeNull();
    expect(resolveLocalProjectIdentity(join(root, "sub"), false)).toBeNull();
  });

  it("rejects metadata whose id does not match the directory-derived id", () => {
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const metadataPath = join(
      root,
      LOCAL_PROJECT_METADATA_DIR,
      LOCAL_PROJECT_METADATA_FILE,
    );
    const forged = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<
      string,
      string
    >;
    forged.id = "p-ffffffffffff";
    writeFileSync(metadataPath, JSON.stringify(forged, null, 2));
    clearLocalIdentityCache();

    expect(resolveLocalProjectIdentity(root, true)).toBeNull();
  });

  it("rejects metadata whose root points at another directory", () => {
    const parent = createTemporaryDirectory();
    const root = join(parent, "project");
    const stolen = join(parent, "other");
    mkdirSync(join(root, LOCAL_PROJECT_METADATA_DIR), {
      recursive: true,
    });
    mkdirSync(stolen, {
      recursive: true,
    });
    const stolenIdentity = initializeLocalProject(stolen);

    // A valid-looking file with a foreign root/id must not route memory to
    // the stolen bank.
    writeFileSync(
      join(root, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE),
      JSON.stringify(stolenIdentity, null, 2),
    );
    clearLocalIdentityCache();

    expect(resolveLocalProjectIdentity(root, true)).toBeNull();
  });

  it("never adopts a forged label even when the identity is valid", () => {
    const root = createTemporaryDirectory();
    initializeLocalProject(root);
    const metadataPath = join(
      root,
      LOCAL_PROJECT_METADATA_DIR,
      LOCAL_PROJECT_METADATA_FILE,
    );
    const forged = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<
      string,
      string
    >;
    forged.label = "totally-unrelated-display-name";
    writeFileSync(metadataPath, JSON.stringify(forged, null, 2));
    clearLocalIdentityCache();

    const resolved = resolveLocalProjectIdentity(root, true);
    expect(resolved).not.toBeNull();
    expect(resolved?.label).toBe(parse(realpathSync(root)).base);
  });

  it("resolves a valid ancestor identity past a forged file in the walk-up chain", () => {
    const parent = createTemporaryDirectory();
    initializeLocalProject(parent);

    const forgedDir = join(parent, "forged", "deep");
    mkdirSync(join(forgedDir, LOCAL_PROJECT_METADATA_DIR), {
      recursive: true,
    });
    writeFileSync(
      join(forgedDir, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE),
      JSON.stringify({
        createdAt: "x",
        id: "p-aaaaaaaaaaaa",
        root: parent,
      }),
    );
    clearLocalIdentityCache();

    const resolved = resolveLocalProjectIdentity(join(forgedDir, "sub"), true);
    expect(resolved?.id).toBe(localProjectIdFor(realpathSync(parent)));
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
