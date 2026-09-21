/**
 * Bounded bank state read for the MEMORY.md projection
 * (change markdown-state-projection, task 1.2; design D1/D5).
 *
 * `mnemosyne export <file>` is the only installed CLI surface that enumerates
 * a bank's current state (survey: `openspec/changes/markdown-state-projection/survey-bank-state-read.md`).
 * The command writes a file, so every read goes to a private temporary
 * directory and that directory is removed on every outcome. Reads are bounded
 * by a fixed timeout and a fixed payload size cap; any failure is returned as
 * a failure so the caller keeps the previous projection and retries later
 * instead of writing an empty or partial one.
 *
 * Only the two memory sections are parsed; embeddings, triples, annotations
 * and canonical facts are discarded (design D1).
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bankDbPath, GLOBAL_BANK } from "../banks.js";
import { type CliOptions, runMnemosyne } from "../cli.js";
import type { MnemosyneRunner } from "../operations.js";

/** Fixed per-bank read timeout (design D1; measured worst case 0.305 s). */
export const BANK_STATE_TIMEOUT_MS = 5_000;
/** Fixed per-bank export size cap; measured worst case 27 KB (design D1). */
export const BANK_STATE_MAX_BYTES = 5 * 1024 * 1024;
/** Temporary directory prefix; used by tests to prove cleanup. */
export const BANK_STATE_TEMP_PREFIX = "xpi-memo-bank-state-";

export interface BankMemoryRow {
  /** Physical bank the row was read from. */
  bank: string;
  content: string;
  /** Bank memory id: the projection's merge key (design D2). */
  id: string;
  /** Storage-layer session discriminator; not the L0 session id. */
  sessionId?: string;
  /** Raw `source` column (xpi-memo metadata or external text). */
  source?: string;
  supersededBy?: string;
  timestamp?: string;
}

export type BankStateRead =
  | {
      banks: string[];
      ok: true;
      rows: BankMemoryRow[];
    }
  | {
      ok: false;
      reason: string;
    };

export interface BankStateReadOptions {
  /**
   * Restrict the read to these banks (default: every bank under `dataDir`).
   * A bounded per-owner read (mental-model projections) must not pull every
   * unrelated project bank into memory just to filter afterwards.
   */
  banks?: readonly string[];
  dataDir: string;
  /** Test seam for the size-cap test; defaults to BANK_STATE_MAX_BYTES. */
  maxBytes?: number;
  /** Directory the temporary export file is written to; defaults to os.tmpdir(). */
  tempRoot?: string;
  /** Test seam for the timeout test; defaults to BANK_STATE_TIMEOUT_MS. */
  timeoutMs?: number;
}

export type BankStateReader = (options: BankStateReadOptions) => Promise<BankStateRead>;

/** Banks that physically exist under one data root: default first, then project banks. */
export function listBankNames(dataDir: string): string[] {
  const names: string[] = [];
  if (existsSync(bankDbPath(dataDir, GLOBAL_BANK))) names.push(GLOBAL_BANK);
  const banksDir = join(dataDir, "banks");
  if (!existsSync(banksDir)) return names;
  for (const name of readdirSync(banksDir).sort()) {
    if (name.startsWith(".")) continue;
    if (!existsSync(bankDbPath(dataDir, name))) continue;
    names.push(name);
  }
  return names;
}

/**
 * Parse the two memory sections at the boundary. `null` means "not the export
 * shape we know" — including a missing section, so upstream schema drift fails
 * closed instead of silently projecting half the state.
 */
export function parseBankStateExport(
  output: string,
  bank: string,
): BankMemoryRow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  const payload = parsed as {
    episodic_memory?: unknown;
    working_memory?: unknown;
  };
  if (!Array.isArray(payload.working_memory)) return null;
  if (!Array.isArray(payload.episodic_memory)) return null;
  const rows: BankMemoryRow[] = [];
  for (const raw of [
    ...payload.working_memory,
    ...payload.episodic_memory,
  ]) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    if (typeof row.content !== "string" || row.content.length === 0) continue;
    rows.push({
      bank,
      content: row.content,
      id: row.id,
      ...(typeof row.session_id === "string"
        ? {
            sessionId: row.session_id,
          }
        : {}),
      ...(typeof row.source === "string"
        ? {
            source: row.source,
          }
        : {}),
      ...(typeof row.superseded_by === "string"
        ? {
            supersededBy: row.superseded_by,
          }
        : {}),
      ...(typeof row.timestamp === "string"
        ? {
            timestamp: row.timestamp,
          }
        : {}),
    });
  }
  return rows;
}

/** Read options with every optional field resolved (`banks` excluded). */
type ResolvedBankStateReadOptions = Required<Omit<BankStateReadOptions, "banks">>;

/** Read one bank with `mnemosyne export` into a private temp directory. */
async function readOneBank(
  run: MnemosyneRunner,
  options: ResolvedBankStateReadOptions,
  bank: string,
): Promise<BankMemoryRow[]> {
  const directory = mkdtempSync(join(options.tempRoot, BANK_STATE_TEMP_PREFIX));
  const exportPath = join(directory, "export.json");
  try {
    const cliOptions: CliOptions = {
      dataDir: options.dataDir,
      timeoutMs: options.timeoutMs,
    };
    if (bank !== GLOBAL_BANK) cliOptions.bank = bank;
    await run(
      [
        "export",
        exportPath,
      ],
      cliOptions,
    );
    const { size } = statSync(exportPath);
    if (size > options.maxBytes)
      throw new Error(`bank-export-too-large:${bank}:${size}>${options.maxBytes}`);
    const rows = parseBankStateExport(readFileSync(exportPath, "utf8"), bank);
    if (rows === null) throw new Error(`bank-export-unparseable:${bank}`);
    return rows;
  } finally {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
}

/**
 * Default reader: every bank that physically exists under the data root, read
 * through the official `mnemosyne export`. Never throws; one bank failing
 * fails the whole read, so no partial state can reach the projection.
 */
export function createCliBankStateReader(
  run: MnemosyneRunner = runMnemosyne,
): BankStateReader {
  return async (options) => {
    const resolved: ResolvedBankStateReadOptions = {
      dataDir: options.dataDir,
      maxBytes: options.maxBytes ?? BANK_STATE_MAX_BYTES,
      tempRoot: options.tempRoot ?? tmpdir(),
      timeoutMs: options.timeoutMs ?? BANK_STATE_TIMEOUT_MS,
    };
    const available = listBankNames(resolved.dataDir);
    // An explicit bank list narrows the read; unknown names are dropped so a
    // caller can never force a read of a bank that does not exist.
    const banks =
      options.banks === undefined
        ? available
        : available.filter((bank) => options.banks?.includes(bank) === true);
    // No bank file yet: an empty state, not a read failure.
    if (banks.length === 0)
      return {
        banks: [],
        ok: true,
        rows: [],
      };
    try {
      const perBank = await Promise.all(
        banks.map(async (bank) => ({
          bank,
          rows: await readOneBank(run, resolved, bank),
        })),
      );
      return {
        banks,
        ok: true,
        rows: perBank.flatMap((entry) => entry.rows),
      };
    } catch (error) {
      return {
        ok: false,
        reason: bankStateFailureReason(error),
      };
    }
  };
}

function bankStateFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.trim().slice(0, 200) || "bank-state-read-failed";
}
