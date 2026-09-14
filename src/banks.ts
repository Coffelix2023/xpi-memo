/**
 * Bank resolution (tasks 2.3–2.4).
 *
 * The global bank is Mnemosyne's default database (no MNEMOSYNE_BANK set).
 * Project banks live at <dataDir>/banks/project-<id>/. A project bank is
 * created lazily — only when a write targets it — so recall against a
 * project that has no memory yet never materializes empty bank dirs.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { runMnemosyne } from "./cli.ts";
import type { MnemosyneRunner } from "./operations.ts";

export const GLOBAL_BANK = "default" as const;

export interface RoutingContext {
  dataDir: string;
  /** Environment identity state at the routing boundary (task 3.1):
   * git / local (explicitly initialized) / none (uninitialized). */
  identity?: "git" | "local" | "none";
  /** current project bank name, or null for non-Git / unrecognized dirs */
  projectBank: string | null;
}

export function bankDbPath(dataDir: string, bank: string): string {
  if (bank === GLOBAL_BANK) return join(dataDir, "mnemosyne.db");
  return join(dataDir, "banks", bank, "mnemosyne.db");
}

export function bankExists(dataDir: string, bank: string): boolean {
  if (bank === GLOBAL_BANK) return true;
  return existsSync(join(dataDir, "banks", bank));
}

/**
 * Exact-ID read capability (change memory-forget-exact-id, design D2).
 *
 * Mnemosyne 3.15.1 exposes no "read one memory by id" subcommand, so the
 * adapter must probe for it at runtime instead of assuming it. The probe is a
 * real call with an id that cannot exist: a structured record OR a structured
 * not-found both prove the command exists and is machine-readable, while an
 * unknown-command failure or an unclassifiable response means unavailable.
 *
 * A false negative ("unavailable" for a command that does exist) is the safe
 * direction: forget then deletes without a recovery snapshot instead of
 * refusing to delete.
 */
export interface ExactIdReadCapability {
  available: boolean;
  /** Detected exact-ID read subcommand, when available. */
  command?: string;
  /** Bounded, body-free reason code when unavailable. */
  reason?: string;
}

/** No exact-ID read subcommand is exposed by the installed CLI. */
export const EXACT_ID_READ_UNAVAILABLE = "upstream-exact-id-read-unavailable";
/** The subcommand exists but its output cannot be classified. */
export const EXACT_ID_READ_UNPARSEABLE = "upstream-exact-id-read-unparseable";

export type ExactIdReadOutcome =
  | {
      kind: "not-found";
    }
  | {
      kind: "record";
      memory: ExactIdReadRecord;
    }
  | {
      kind: "unparseable";
    };

export interface ExactIdReadRecord {
  content: string;
  id: string;
  source?: string;
  timestamp?: string;
}

/** Candidate subcommands, cheapest-to-verify first (design D2). */
const EXACT_ID_READ_COMMANDS = [
  "get",
];
/** Syntactically valid hex id that must not exist in any bank. */
const PROBE_MEMORY_ID = "0".repeat(32);
const UNKNOWN_COMMAND_PATTERN = /unknown command/i;
const NOT_FOUND_PATTERN = /\bnot found\b|no such memory|does not exist|unknown memory/i;

const capabilityCache = new Map<string, Promise<ExactIdReadCapability>>();

/** Test-only: drop the per-process capability cache. */
export function resetExactIdReadCapabilityCache(): void {
  capabilityCache.clear();
}

/**
 * Classify one exact-ID read response. Only a structured record or a
 * structured not-found counts as parseable; anything else (usage text, prose
 * dump, empty output) is unparseable and therefore unavailable.
 */
export function parseExactIdReadOutcome(output: string): ExactIdReadOutcome {
  const text = output.trim();
  if (!text)
    return {
      kind: "unparseable",
    };
  const memory = parseExactIdReadRecord(text);
  if (memory)
    return {
      kind: "record",
      memory,
    };
  if (NOT_FOUND_PATTERN.test(text))
    return {
      kind: "not-found",
    };
  return {
    kind: "unparseable",
  };
}

/**
 * Probe (and cache per process per data dir) whether the installed CLI can
 * read one memory by exact id. Never throws: any failure is a verdict.
 */
export async function probeExactIdReadCapability(
  run: MnemosyneRunner = runMnemosyne,
  dataDir?: string,
): Promise<ExactIdReadCapability> {
  const key = dataDir ?? "default-data-dir";
  const cached = capabilityCache.get(key);
  if (cached) return cached;
  const pending = probeExactIdRead(run, dataDir);
  capabilityCache.set(key, pending);
  return pending;
}

async function probeExactIdRead(
  run: MnemosyneRunner,
  dataDir?: string,
): Promise<ExactIdReadCapability> {
  for (const command of EXACT_ID_READ_COMMANDS) {
    let output: string;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: candidates are probed in a fixed order.
      output = await run(
        [
          command,
          PROBE_MEMORY_ID,
        ],
        dataDir
          ? {
              dataDir,
            }
          : {},
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      // Absent subcommand: try the next candidate name.
      if (UNKNOWN_COMMAND_PATTERN.test(message)) continue;
      // Present and classified: the backend answered about the id itself.
      if (NOT_FOUND_PATTERN.test(message))
        return {
          available: true,
          command,
        };
      return {
        available: false,
        reason: EXACT_ID_READ_UNPARSEABLE,
      };
    }
    if (parseExactIdReadOutcome(output).kind !== "unparseable")
      return {
        available: true,
        command,
      };
    return {
      available: false,
      reason: EXACT_ID_READ_UNPARSEABLE,
    };
  }
  return {
    available: false,
    reason: EXACT_ID_READ_UNAVAILABLE,
  };
}

/**
 * `mnemosyne delete <missing id>` exits non-zero with "Memory not found: <id>".
 * Only that outcome means "this bank does not hold the target"; every other
 * failure is a real failure (change memory-forget-exact-id, task 2.3).
 */
export function isMemoryNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return NOT_FOUND_PATTERN.test(message);
}

/** JSON.parse at the boundary: only a complete record shape is accepted. */
function parseExactIdReadRecord(text: string): ExactIdReadRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !row.id ||
    typeof row.content !== "string" ||
    !row.content
  )
    return null;
  return {
    content: row.content,
    id: row.id,
    ...(typeof row.source === "string"
      ? {
          source: row.source,
        }
      : {}),
    ...(typeof row.timestamp === "string"
      ? {
          timestamp: row.timestamp,
        }
      : {}),
  };
}

/**
 * Ensure a project bank exists. Only called from write paths.
 * Returns false when creation failed (caller falls back to global bank with
 * an audit event rather than crashing the session).
 */
export async function ensureProjectBank(
  ctx: RoutingContext,
  run: MnemosyneRunner = runMnemosyne,
): Promise<boolean> {
  if (!ctx.projectBank) return false;
  if (bankExists(ctx.dataDir, ctx.projectBank)) return true;
  try {
    await run(
      [
        "bank",
        "create",
        ctx.projectBank,
      ],
      {
        dataDir: ctx.dataDir,
      },
    );
    return true;
  } catch {
    return false;
  }
}
