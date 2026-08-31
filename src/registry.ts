/**
 * Local project registry (task 1.5).
 *
 * Persisted at <agentDir>/mnemosyne/projects.json (mode 0600). Maps stable
 * project ids to canonical roots, labels, remotes, known worktree roots and
 * bank names, so identity survives reopens, basename collisions and moves
 * (repair via remote match, never silent bank merges).
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectIdentity } from "./identity.ts";

export interface RegistryEntry {
  bank: string;
  canonicalRoot: string;
  createdAt: string;
  id: string;
  label: string;
  remotes: string[];
  updatedAt: string;
  worktreeRoots: string[];
}

export interface Registry {
  projects: Record<string, RegistryEntry>;
  version: 1;
}

export function emptyRegistry(): Registry {
  return {
    projects: {},
    version: 1,
  };
}

export function loadRegistry(path: string): Registry {
  if (!existsSync(path)) return emptyRegistry();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Registry;
    if (parsed.version !== 1 || typeof parsed.projects !== "object") {
      return emptyRegistry();
    }
    return parsed;
  } catch {
    // corrupt registry: start empty rather than crash routing; the file is
    // left untouched so an operator can inspect it
    return emptyRegistry();
  }
}

export function saveRegistry(path: string, registry: Registry): void {
  mkdirSync(dirname(path), {
    mode: 0o700,
    recursive: true,
  });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best effort on platforms without posix modes */
  }
}

export function bankNameFor(id: string): string {
  return `project-${id}`;
}

/**
 * Record (or refresh) a project identity. Returns the entry. An existing
 * entry matched by id keeps its bank; a remote-only match after a move
 * updates canonicalRoot in place (reported via `moved`) instead of creating
 * a second bank.
 */
export function upsertIdentity(
  registry: Registry,
  identity: ProjectIdentity,
): {
  entry: RegistryEntry;
  moved: boolean;
} {
  const now = new Date().toISOString();
  let entry = registry.projects[identity.id];
  let moved = false;

  if (!entry && identity.remotes.length > 0) {
    // repair path: same remotes, different common-dir hash (repo was moved
    // or remote list changed first visit ordering)
    for (const candidate of Object.values(registry.projects)) {
      if (candidate.remotes.some((r) => identity.remotes.includes(r))) {
        entry = candidate;
        moved = true;
        break;
      }
    }
  }

  if (!entry) {
    entry = {
      bank: bankNameFor(identity.id),
      canonicalRoot: identity.canonicalRoot,
      createdAt: now,
      id: identity.id,
      label: identity.label,
      remotes: identity.remotes,
      updatedAt: now,
      worktreeRoots: [],
    };
    registry.projects[identity.id] = entry;
  } else {
    if (entry.canonicalRoot !== identity.canonicalRoot) moved = true;
    entry.canonicalRoot = identity.canonicalRoot;
    entry.label = identity.label;
    entry.remotes = [
      ...new Set([
        ...entry.remotes,
        ...identity.remotes,
      ]),
    ];
    entry.updatedAt = now;
    if (moved) {
      // re-key under the fresh id while keeping the same bank name
      delete registry.projects[entry.id];
      entry.id = identity.id;
      registry.projects[identity.id] = entry;
    }
  }

  if (identity.isWorktree && !entry.worktreeRoots.includes(identity.root)) {
    entry.worktreeRoots.push(identity.root);
    entry.updatedAt = now;
  }
  return {
    entry,
    moved,
  };
}

/** Default registry path inside the Pi agent dir. */
export function registryPath(agentDir: string): string {
  return join(agentDir, "mnemosyne", "projects.json");
}
