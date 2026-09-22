import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Per-session budget ledger for gated offline extraction (task 3.3).
 *
 * Persisted like the idempotency ledger: one state file, session-scoped.
 * A stale file from another session resets to zero so budget exhaustion can
 * never leak across sessions. The ledger itself stores only counts — never
 * memory bodies, proposals, or event content — so it stays provenance-safe.
 */

export interface ExtractionBudgetLimits {
  maxCharsPerSession: number;
  maxExecutionsPerSession: number;
  maxProposalsPerSession: number;
}

export interface ExtractionBudgetConsumption {
  chars: number;
  executions: number;
  proposals: number;
}

export interface ExtractionBudgetLedger {
  consumedThrough(): number;
  consumption(): ExtractionBudgetConsumption;
  executionAllowed(limits: ExtractionBudgetLimits): boolean;
  recordConsumedThrough(position: number): void;
  recordExecution(): void;
  /**
   * Record the lifecycle outcome of one attempt (the task 3.3 codes), so the
   * result outlives the audit window. Written on every terminal path,
   * including the budget-exhausted early return.
   */
  recordOutcome(outcome: string, status: string): void;
  recordProposals(count: number, chars: number): void;
}

interface ExtractionBudgetState {
  chars: number;
  consumedThrough: number;
  executions: number;
  /**
   * Codes of the last recorded attempt. Kept here rather than only in the
   * audit so the status surface can still answer "was the last extraction
   * healthy?" after the 200-entry audit window has rotated it away.
   */
  lastOutcome?: string;
  lastStatus?: string;
  proposals: number;
  sessionId: string;
  version: 1;
}

interface CreateExtractionBudgetLedgerOptions {
  sessionId: string;
  statePath: string;
}

function emptyState(sessionId: string): ExtractionBudgetState {
  return {
    chars: 0,
    consumedThrough: 0,
    executions: 0,
    proposals: 0,
    sessionId,
    version: 1,
  };
}

function loadState(path: string, sessionId: string): ExtractionBudgetState {
  if (!existsSync(path)) return emptyState(sessionId);
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<ExtractionBudgetState>;
    if (
      parsed.version !== 1 ||
      parsed.sessionId !== sessionId ||
      typeof parsed.executions !== "number" ||
      typeof parsed.proposals !== "number" ||
      typeof parsed.chars !== "number"
    ) {
      return emptyState(sessionId);
    }
    return {
      chars: parsed.chars,
      consumedThrough:
        typeof parsed.consumedThrough === "number" ? parsed.consumedThrough : 0,
      executions: parsed.executions,
      proposals: parsed.proposals,
      sessionId,
      version: 1,
      ...(typeof parsed.lastOutcome === "string"
        ? {
            lastOutcome: parsed.lastOutcome,
          }
        : {}),
      ...(typeof parsed.lastStatus === "string"
        ? {
            lastStatus: parsed.lastStatus,
          }
        : {}),
    };
  } catch {
    return emptyState(sessionId);
  }
}

function saveState(path: string, state: ExtractionBudgetState): void {
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

export function createExtractionBudgetLedger({
  sessionId,
  statePath,
}: CreateExtractionBudgetLedgerOptions): ExtractionBudgetLedger {
  const state = loadState(statePath, sessionId);

  function consumption(): ExtractionBudgetConsumption {
    return {
      chars: state.chars,
      executions: state.executions,
      proposals: state.proposals,
    };
  }

  function executionAllowed(limits: ExtractionBudgetLimits): boolean {
    return state.executions < limits.maxExecutionsPerSession;
  }

  function recordExecution(): void {
    state.executions += 1;
    saveState(statePath, state);
  }

  function recordProposals(count: number, chars: number): void {
    state.proposals += count;
    state.chars += chars;
    saveState(statePath, state);
  }

  function recordOutcome(outcome: string, status: string): void {
    state.lastOutcome = outcome;
    state.lastStatus = status;
    saveState(statePath, state);
  }

  function consumedThrough(): number {
    return state.consumedThrough;
  }

  function recordConsumedThrough(position: number): void {
    if (position <= state.consumedThrough) return;
    state.consumedThrough = position;
    saveState(statePath, state);
  }

  return {
    consumption,
    consumedThrough,
    executionAllowed,
    recordConsumedThrough,
    recordExecution,
    recordProposals,
    recordOutcome,
  };
}

/** File name of the single ledger, relative to the data dir. */
export const EXTRACTION_BUDGET_FILE = "extraction-budget.json";

/** The ledger's path under a data dir; one file, session-scoped inside it. */
export function extractionBudgetPath(dataDir: string): string {
  return join(dataDir, EXTRACTION_BUDGET_FILE);
}

/**
 * The last recorded outcome, read *without* the session-scoped reset that
 * `loadState` applies.
 *
 * The budget itself must not leak across sessions — see this module's header —
 * which is exactly why `loadState` discards a foreign file. The *result* of the
 * last run is a different question: a session that has not extracted yet should
 * still see how the previous one ended, and the reset would hide that. Reading
 * the file raw answers "was the last extraction healthy?" without weakening the
 * budget, because only reads bypass the reset.
 */
export function readExtractionLastOutcome(statePath: string):
  | {
      lastOutcome?: string;
      lastStatus?: string;
      sessionId?: string;
    }
  | undefined {
  if (!existsSync(statePath)) return undefined;
  try {
    const parsed = JSON.parse(
      readFileSync(statePath, "utf8"),
    ) as Partial<ExtractionBudgetState>;
    if (parsed.version !== 1) return undefined;
    return {
      ...(typeof parsed.lastOutcome === "string"
        ? {
            lastOutcome: parsed.lastOutcome,
          }
        : {}),
      ...(typeof parsed.lastStatus === "string"
        ? {
            lastStatus: parsed.lastStatus,
          }
        : {}),
      ...(typeof parsed.sessionId === "string"
        ? {
            sessionId: parsed.sessionId,
          }
        : {}),
    };
  } catch {
    return undefined;
  }
}
