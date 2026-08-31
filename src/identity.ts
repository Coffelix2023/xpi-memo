/**
 * Stable project identity derived from Git (task 1.4 spike + production logic).
 *
 * Identity precedence:
 *   1. canonical git common dir (stable across worktrees of one repository)
 *   2. normalized remote URL (used as registry alias for repair after moves)
 *   3. absolute root path (fallback for repositories without remotes)
 * Non-Git directories get no project identity and therefore no project bank.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const SCP_LIKE_PATTERN = /^([^@/]+)@([^:/]+):(.+)$/;
const GIT_SUFFIX_PATTERN = /\.git\/?$/;
const TRAILING_SLASH_PATTERN = /\/+$/;
const REMOTE_CREDENTIALS_PATTERN = /^([a-z]+:\/\/)[^@/]+@/i;
const REMOTE_HOST_PATTERN = /^([a-z]+:\/\/)([^/]+)(\/.*)$/i;
export interface ProjectIdentity {
  /** canonical main worktree root */
  canonicalRoot: string;
  /** canonical absolute path of the git common dir (realpath-resolved) */
  commonDir: string;
  /** stable id: `p-` + sha256(canonicalCommonDir)[:12] */
  id: string;
  /** true when `root` is a linked worktree, not the main worktree */
  isWorktree: boolean;
  /** display label: basename of canonical root */
  label: string;
  /** normalized remote URLs, deduped */
  remotes: string[];
  /** working-tree root the session started in (may be a worktree) */
  root: string;
}

function git(args: string[], cwd: string): string | null {
  try {
    return (
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: [
          "ignore",
          "pipe",
          "ignore",
        ],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** Normalize a git remote URL so https/ssh and trailing .git compare equal. */
export function normalizeRemote(url: string): string {
  let u = url.trim();
  // git@host:owner/repo.git -> ssh://git@host/owner/repo
  const scpLike = SCP_LIKE_PATTERN.exec(u);
  if (scpLike) u = `ssh://${scpLike[1]}@${scpLike[2]}/${scpLike[3]}`;
  u = u.replace(GIT_SUFFIX_PATTERN, "").replace(TRAILING_SLASH_PATTERN, "");
  // strip credentials, lowercase scheme+host
  u = u.replace(REMOTE_CREDENTIALS_PATTERN, "$1");
  const m = REMOTE_HOST_PATTERN.exec(u);
  if (m) u = m[1].toLowerCase() + m[2].toLowerCase() + m[3];
  return u;
}

export function projectIdFor(commonDir: string): string {
  const hash = createHash("sha256").update(commonDir).digest("hex");
  return `p-${hash.slice(0, 12)}`;
}

/**
 * Resolve the project identity for `cwd`, or null when cwd is not inside a
 * Git work tree (non-Git directories get global-only memory routing).
 */
export function resolveProjectIdentity(cwd: string): ProjectIdentity | null {
  const root = git(
    [
      "rev-parse",
      "--show-toplevel",
    ],
    cwd,
  );
  if (!root) return null;
  const commonRaw = git(
    [
      "rev-parse",
      "--git-common-dir",
    ],
    cwd,
  );
  if (!commonRaw) return null;
  // --git-common-dir may be relative to the worktree root
  const commonDir = real(resolve(root, commonRaw));

  // main worktree root = dirname of the common dir's ".git"
  const canonicalRoot = commonDir.endsWith("/.git")
    ? commonDir.slice(0, -"/.git".length)
    : root;

  const remoteOut = git(
    [
      "remote",
    ],
    root,
  );
  const remotes: string[] = [];
  if (remoteOut) {
    for (const name of remoteOut.split("\n")) {
      const url = git(
        [
          "remote",
          "get-url",
          name,
        ],
        root,
      );
      if (url) {
        const n = normalizeRemote(url);
        if (!remotes.includes(n)) remotes.push(n);
      }
    }
  }

  const realRoot = real(root);
  const realCanonical = real(canonicalRoot);

  return {
    id: projectIdFor(commonDir),
    commonDir,
    canonicalRoot: realCanonical,
    root: realRoot,
    remotes,
    isWorktree: realRoot !== realCanonical,
    label: realCanonical.split("/").pop() ?? realCanonical,
  };
}
