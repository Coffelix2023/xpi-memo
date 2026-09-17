/**
 * Explicit non-Git project initialization (task 1.3).
 *
 * A recognized Git identity remains the default project identity. Non-Git
 * directories get a local project identity only after explicit initialization,
 * which writes `<root>/.pi/xpi-memo/project.json`, AND only when the current
 * Pi context trusts the project: resolution takes an explicit `trusted`
 * verdict supplied by the runtime boundary (never read from global settings
 * here). Resolution walks up from a directory to its nearest initialized
 * ancestor, so descendants of an initialized root share one stable identity
 * while unrelated directories stay isolated (uninitialized → null). Every
 * metadata file must self-certify: its directory is the identity root, so
 * `root` must equal it and `id` must be derived from it; forged or untrusted
 * metadata is treated as uninitialized.
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
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

export interface LocalProjectRevokeResult {
  archivePath?: string;
  bank: string;
}

/** Archive a local project's bank, then remove its identity metadata. */
export function revokeLocalProject(
  identity: LocalProjectIdentity,
  dataDir: string,
  now = new Date(),
): LocalProjectRevokeResult | null {
  if (identity.id !== localProjectIdFor(identity.root))
    throw new Error("invalid-local-project-identity");
  const bank = `project-${identity.id}`;
  const bankPath = join(dataDir, "banks", bank);
  const metadata = metadataPath(identity.root);
  if (!existsSync(metadata)) return null;
  let archivePath: string | undefined;
  if (existsSync(bankPath)) {
    const archiveRoot = join(dataDir, "banks-archived");
    mkdirSync(archiveRoot, {
      mode: 0o700,
      recursive: true,
    });
    archivePath = join(
      archiveRoot,
      `${bank}-${now.toISOString().replaceAll(":", "-")}`,
    );
    renameSync(bankPath, archivePath);
  }
  rmSync(metadata);
  clearLocalIdentityCache();
  return {
    bank,
    ...(archivePath
      ? {
          archivePath,
        }
      : {}),
  };
}

function readVerifiedIdentityFile(
  path: string,
  candidateRoot: string,
): LocalProjectIdentity | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<LocalProjectIdentity>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.root !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    // Self-certifying identity: the metadata can only prove the identity of
    // the directory that contains it. `root` must resolve to that directory
    // and `id` must be derived from it; anything else is untrusted input and
    // the walk continues upward. The display label is never taken from the
    // file, so a forged `label` cannot influence routing or UI text.
    if (real(parsed.root) !== candidateRoot) return null;
    if (parsed.id !== localProjectIdFor(candidateRoot)) return null;
    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
      label: parse(candidateRoot).base,
      root: candidateRoot,
      source: "local",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the nearest initialized local project identity for `cwd`, walking up
 * ancestors. Returns null when no initialized root encloses the directory or
 * when `trusted` is false — repository-local metadata participates in routing
 * only when the current Pi context trusts this project, and untrusted
 * contexts never read the metadata file at all.
 */
export function resolveLocalProjectIdentity(
  cwd: string,
  trusted: boolean,
): LocalProjectIdentity | null {
  if (!trusted) return null;
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
      const identity = readVerifiedIdentityFile(metadataPath(current), current);
      localCache.set(current, identity);
      if (identity) {
        for (const directory of pathStack) localCache.set(directory, identity);
        return identity;
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    pathStack.push(current);
    // Re-realpath every ancestor: when the starting cwd does not exist (or
    // is reached through a symlink) intermediate directories must resolve to
    // their canonical form so they stay comparable with the metadata `root`.
    current = real(parent);
  }
}
