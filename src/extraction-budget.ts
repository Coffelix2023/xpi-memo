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
  recordProposals(count: number, chars: number): void;
}

interface ExtractionBudgetState {
  chars: number;
  consumedThrough: number;
  executions: number;
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
  };
}
