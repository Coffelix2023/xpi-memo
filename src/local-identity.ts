/**
 * Explicit non-Git project initialization (task 1.3).
 *
 * A recognized Git identity remains the default project identity. Non-Git
 * directories get a local project identity only after explicit initialization,
 * which writes `<root>/.pi/xpi-memo/project.json`. Resolution walks up from a
 * directory to its nearest initialized ancestor, so descendants of an
 * initialized root share one stable identity while unrelated directories stay
 * isolated (uninitialized → null).
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

export const LOCAL_PROJECT_METADATA_DIR = join(".pi", "xpi-memo");
export const LOCAL_PROJECT_METADATA_FILE = "project.json";

export interface LocalProjectIdentity {
  /** ISO timestamp of initialization */
  createdAt: string;
  /** stable id: `p-` + sha256(root)[:12] (same shape as Git project ids) */
  id: string;
  /** display label: basename of the initialized root */
  label: string;
  /** initialized root (the metadata file's directory) */
  root: string;
  source: "local";
}

export function localProjectIdFor(root: string): string {
  const hash = createHash("sha256").update(resolve(root)).digest("hex");
  return `p-${hash.slice(0, 12)}`;
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function metadataPath(root: string): string {
  return join(root, LOCAL_PROJECT_METADATA_DIR, LOCAL_PROJECT_METADATA_FILE);
}

const localCache = new Map<string, LocalProjectIdentity | null>();

export function clearLocalIdentityCache(): void {
  localCache.clear();
}

/** Explicitly initialize a non-Git project identity at `root`. */
export function initializeLocalProject(root: string): LocalProjectIdentity {
  const resolvedRoot = real(root);
  const identity: LocalProjectIdentity = {
    createdAt: new Date().toISOString(),
    id: localProjectIdFor(resolvedRoot),
    label: parse(resolvedRoot).base,
    root: resolvedRoot,
    source: "local",
  };
  const target = metadataPath(resolvedRoot);
  mkdirSync(dirname(target), {
    recursive: true,
  });
  const temporaryPath = `${target}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(identity, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, target);
  try {
    chmodSync(target, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
  clearLocalIdentityCache();
  localCache.set(resolvedRoot, identity);
  return identity;
}

function readIdentityFile(path: string): LocalProjectIdentity | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<LocalProjectIdentity>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.root === "string" &&
      typeof parsed.createdAt === "string"
    ) {
      return {
        createdAt: parsed.createdAt,
        id: parsed.id,
        label:
          typeof parsed.label === "string" ? parsed.label : parse(parsed.root).base,
        root: parsed.root,
        source: "local",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the nearest initialized local project identity for `cwd`, walking up
 * ancestors. Returns null when no initialized root encloses the directory.
 */
export function resolveLocalProjectIdentity(cwd: string): LocalProjectIdentity | null {
  let current = real(cwd);
  const pathStack: string[] = [];
  for (;;) {
    const cached = localCache.get(current);
    if (cached !== undefined) {
      if (cached) {
        for (const directory of pathStack) localCache.set(directory, cached);
        return cached;
      }
      // cached miss: keep walking up
    } else {
      const identity = readIdentityFile(metadataPath(current));
      localCache.set(current, identity);
      if (identity) {
        for (const directory of pathStack) localCache.set(directory, identity);
        return identity;
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    pathStack.push(current);
    current = parent;
  }
}
