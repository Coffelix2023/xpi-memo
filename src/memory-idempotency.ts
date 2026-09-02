import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * Durable idempotency ledger for T1 memory writes.
 *
 * Both the explicit activation loop and the `xpi_memo_remember` tool route
 * through the same store, so replaying one L0 event (or a simultaneous
 * remember call for the same content and kind) cannot create a duplicate T1
 * row or candidate. Keys include session, event position, kind, and content
 * fingerprint; the content tuple is also checked to coalesce cross-path writes.
 */

export function contentFingerprint(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}

export interface IdempotencyClaimInput {
  content: string;
  eventPosition: number;
  kind: string;
  sessionId: string;
  source: string;
}

export interface IdempotencyEntry {
  createdAt: string;
  eventPosition: number;
  fingerprint: string;
  key: string;
  kind: string;
  sessionId: string;
  source: string;
}

export type IdempotencyClaimResult =
  | {
      claimed: true;
      fingerprint: string;
      key: string;
    }
  | {
      claimed: false;
      existing: IdempotencyEntry;
      fingerprint: string;
      key: string;
    };

export interface MemoryIdempotencyStore {
  claim(input: IdempotencyClaimInput): IdempotencyClaimResult;
  list(): IdempotencyEntry[];
}

interface IdempotencyState {
  entries: IdempotencyEntry[];
  version: 1;
}

interface CreateMemoryIdempotencyStoreOptions {
  maxEntries?: number;
  statePath: string;
}

const DEFAULT_MAX_ENTRIES = 500;

function keyFor(
  sessionId: string,
  eventPosition: number,
  kind: string,
  fingerprint: string,
): string {
  return `${sessionId}:${eventPosition}:${kind}:${fingerprint}`;
}

function emptyState(): IdempotencyState {
  return {
    entries: [],
    version: 1,
  };
}

function loadState(path: string): IdempotencyState {
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<IdempotencyState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyState();
    const entries = parsed.entries.filter(
      (entry): entry is IdempotencyEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.key === "string" &&
        typeof entry.sessionId === "string" &&
        typeof entry.fingerprint === "string" &&
        typeof entry.kind === "string" &&
        typeof entry.source === "string" &&
        typeof entry.createdAt === "string" &&
        typeof entry.eventPosition === "number",
    );
    return {
      entries,
      version: 1,
    };
  } catch {
    return emptyState();
  }
}

function saveState(path: string, state: IdempotencyState): void {
  mkdirSync(dirname(path), {
    mode: 0o700,
    recursive: true,
  });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
}

export function createMemoryIdempotencyStore({
  maxEntries = DEFAULT_MAX_ENTRIES,
  statePath,
}: CreateMemoryIdempotencyStoreOptions): MemoryIdempotencyStore {
  const state = loadState(statePath);
  const limit =
    Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;

  function claim(input: IdempotencyClaimInput): IdempotencyClaimResult {
    const fingerprint = contentFingerprint(input.content);
    const key = keyFor(input.sessionId, input.eventPosition, input.kind, fingerprint);
    const existing = state.entries.find(
      (entry) =>
        entry.key === key ||
        (entry.sessionId === input.sessionId &&
          entry.kind === input.kind &&
          entry.fingerprint === fingerprint),
    );
    if (existing) {
      return {
        claimed: false,
        existing,
        fingerprint,
        key,
      };
    }
    const entry: IdempotencyEntry = {
      createdAt: new Date().toISOString(),
      eventPosition: input.eventPosition,
      fingerprint,
      key,
      kind: input.kind,
      sessionId: input.sessionId,
      source: input.source,
    };
    state.entries.push(entry);
    if (state.entries.length > limit) {
      state.entries.splice(0, state.entries.length - limit);
    }
    saveState(statePath, state);
    return {
      claimed: true,
      fingerprint,
      key,
    };
  }

  function list(): IdempotencyEntry[] {
    return state.entries.map((entry) => ({
      ...entry,
    }));
  }

  return {
    claim,
    list,
  };
}
