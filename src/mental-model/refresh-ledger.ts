/**
 * Per-session refresh ledger (change add-mental-model-projections, task 3.1).
 *
 * A tiny, count-only, atomically written state file that answers "has this
 * (definition, source digest) already been attempted this session?" and "is
 * any of the session budgets spent?". It is keyed by definition *and* digest,
 * so compact and shutdown can both run without refreshing the same unchanged
 * definition twice, while a changed source set stays eligible for retry.
 *
 * The ledger stores no bodies: definition ids, digest strings, and counters
 * only. A state file from another session resets to empty, so budget
 * exhaustion can never leak across sessions.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export interface MentalModelRefreshLedgerLimits {
  /** Shared attempt budget across all definitions this session. */
  maxAttemptsPerSession: number;
  /** Shared generated-output budget across all definitions this session. */
  maxCharsPerSession: number;
}

export const DEFAULT_MENTAL_MODEL_REFRESH_LIMITS: MentalModelRefreshLedgerLimits = {
  maxAttemptsPerSession: 8,
  maxCharsPerSession: 12_000,
};

/** Bounded state file growth: digests kept per definition. */
const MAX_DIGESTS_PER_DEFINITION = 8;
/** Bounded state file growth: definitions kept. */
const MAX_DEFINITIONS = 32;

export interface MentalModelRefreshLedger {
  attemptAllowed(
    definitionId: string,
    digest: string,
    limits: MentalModelRefreshLedgerLimits,
  ): boolean;
  attempts(): number;
  chars(): number;
  recordAttempt(definitionId: string, digest: string, chars: number): void;
}

interface MentalModelRefreshLedgerState {
  chars: number;
  definitions: Record<string, string[]>;
  sessionId: string;
  totalAttempts: number;
  version: 1;
}

interface CreateMentalModelRefreshLedgerOptions {
  sessionId: string;
  statePath: string;
}

function emptyState(sessionId: string): MentalModelRefreshLedgerState {
  return {
    chars: 0,
    definitions: {},
    sessionId,
    totalAttempts: 0,
    version: 1,
  };
}

function loadState(path: string, sessionId: string): MentalModelRefreshLedgerState {
  if (!existsSync(path)) return emptyState(sessionId);
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<MentalModelRefreshLedgerState>;
    // A stale session's file resets safely; a malformed file resets too.
    if (
      parsed.version !== 1 ||
      parsed.sessionId !== sessionId ||
      typeof parsed.totalAttempts !== "number" ||
      typeof parsed.chars !== "number" ||
      typeof parsed.definitions !== "object" ||
      parsed.definitions === null ||
      Array.isArray(parsed.definitions)
    ) {
      return emptyState(sessionId);
    }
    return {
      chars: parsed.chars,
      definitions: parsed.definitions,
      sessionId,
      totalAttempts: parsed.totalAttempts,
      version: 1,
    };
  } catch {
    return emptyState(sessionId);
  }
}

function saveState(path: string, state: MentalModelRefreshLedgerState): void {
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

export function createMentalModelRefreshLedger({
  sessionId,
  statePath,
}: CreateMentalModelRefreshLedgerOptions): MentalModelRefreshLedger {
  const state = loadState(statePath, sessionId);

  return {
    attemptAllowed(definitionId, digest, limits) {
      if (state.totalAttempts >= limits.maxAttemptsPerSession) return false;
      if (state.chars >= limits.maxCharsPerSession) return false;
      const attempted = state.definitions[definitionId] ?? [];
      return !attempted.includes(digest);
    },
    attempts() {
      return state.totalAttempts;
    },
    chars() {
      return state.chars;
    },
    recordAttempt(definitionId, digest, chars) {
      const attempted = state.definitions[definitionId] ?? [];
      if (!attempted.includes(digest)) attempted.push(digest);
      state.definitions[definitionId] = attempted.slice(-MAX_DIGESTS_PER_DEFINITION);
      const ids = Object.keys(state.definitions);
      if (ids.length > MAX_DEFINITIONS) {
        for (const id of ids.slice(0, ids.length - MAX_DEFINITIONS))
          delete state.definitions[id];
      }
      state.totalAttempts += 1;
      state.chars += chars;
      saveState(statePath, state);
    },
  };
}
