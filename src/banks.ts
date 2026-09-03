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
