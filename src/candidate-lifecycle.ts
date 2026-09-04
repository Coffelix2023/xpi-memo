import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { classifyProhibitedContent } from "./content-policy.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import type { PendingCandidate } from "./pending-candidate.js";

interface StoredCandidate {
  candidate: PendingCandidate;
  operation: T1MemoryOperation;
}

interface CandidateState {
  audit: CandidateAudit[];
  candidates: Record<string, StoredCandidate>;
  version: 1;
}

interface CandidateAudit {
  action:
    | "candidate-confirmed"
    | "candidate-corrected"
    | "candidate-rejected"
    | "conflict-reported";
  candidateId: string;
  timestamp: string;
}

export interface CandidateLifecycleResult {
  reason?: string;
  status: "conflict" | "rejected" | "stored";
}

export interface CandidateStore {
  add(
    candidate: PendingCandidate,
    operation: T1MemoryOperation,
  ): CandidateLifecycleResult;
  confirm(candidateId: string): Promise<CandidateLifecycleResult>;
  correct(
    candidateId: string,
    operation: T1MemoryOperation,
  ): Promise<CandidateLifecycleResult>;
  list(): PendingCandidate[];
  reject(candidateId: string): Promise<CandidateLifecycleResult>;
  reportConflict(candidateId: string): CandidateLifecycleResult;
}

interface CreateCandidateStoreOptions {
  adapter: MnemosyneAdapter;
  afterStore?: (operation: T1MemoryOperation) => void;
  beforeStore?: (operation: T1MemoryOperation) => void;
  statePath: string;
}

function emptyState(): CandidateState {
  return {
    audit: [],
    candidates: {},
    version: 1,
  };
}

function loadState(path: string): CandidateState {
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CandidateState;
    if (
      parsed.version !== 1 ||
      typeof parsed.candidates !== "object" ||
      parsed.candidates === null ||
      !Array.isArray(parsed.audit)
    ) {
      return emptyState();
    }
    const candidates = Object.fromEntries(
      Object.entries(parsed.candidates).filter(
        ([, stored]) =>
          typeof stored === "object" &&
          stored !== null &&
          typeof stored.candidate === "object" &&
          stored.candidate !== null &&
          typeof stored.operation === "object" &&
          stored.operation !== null,
      ),
    );
    return {
      ...parsed,
      candidates,
    };
  } catch {
    return emptyState();
  }
}

function saveState(path: string, state: CandidateState): void {
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

function audit(
  state: CandidateState,
  action: CandidateAudit["action"],
  candidateId: string,
): void {
  state.audit.push({
    action,
    candidateId,
    timestamp: new Date().toISOString(),
  });
}

function notFound(): CandidateLifecycleResult {
  return {
    reason: "candidate-not-found",
    status: "rejected",
  };
}

export function createCandidateStore({
  adapter,
  beforeStore,
  afterStore,
  statePath,
}: CreateCandidateStoreOptions): CandidateStore {
  const state = loadState(statePath);

  function add(
    candidate: PendingCandidate,
    operation: T1MemoryOperation,
  ): CandidateLifecycleResult {
    const classification = classifyProhibitedContent({
      content: candidate.content,
    });
    if (classification) {
      return {
        reason: `prohibited-content:${classification}`,
        status: "rejected",
      };
    }
    state.candidates[candidate.id] = {
      candidate,
      operation,
    };
    saveState(statePath, state);
    return {
      status: "stored",
    };
  }

  function list(): PendingCandidate[] {
    return Object.values(state.candidates).map(({ candidate }) => candidate);
  }

  async function confirm(candidateId: string): Promise<CandidateLifecycleResult> {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    if (stored.candidate.conflictState === "reported") {
      return {
        reason: "candidate-conflict-reported",
        status: "conflict",
      };
    }
    const classification = classifyProhibitedContent({
      content: stored.operation.content,
    });
    if (classification) {
      return {
        reason: `prohibited-content:${classification}`,
        status: "rejected",
      };
    }
    beforeStore?.(stored.operation);
    await adapter.store(stored.operation);
    delete state.candidates[candidateId];
    audit(state, "candidate-confirmed", candidateId);
    try {
      afterStore?.(stored.operation);
    } catch {
      // Post-store hooks are best effort and must not undo a confirmed write.
    }
    saveState(statePath, state);
    return {
      status: "stored",
    };
  }

  async function reject(candidateId: string): Promise<CandidateLifecycleResult> {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    delete state.candidates[candidateId];
    audit(state, "candidate-rejected", candidateId);
    saveState(statePath, state);
    return {
      reason: "user-rejected-candidate",
      status: "rejected",
    };
  }

  async function correct(
    candidateId: string,
    operation: T1MemoryOperation,
  ): Promise<CandidateLifecycleResult> {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    const classification = classifyProhibitedContent({
      content: operation.content,
    });
    if (classification) {
      return {
        reason: `prohibited-content:${classification}`,
        status: "rejected",
      };
    }
    await adapter.store(operation);
    delete state.candidates[candidateId];
    audit(state, "candidate-corrected", candidateId);
    saveState(statePath, state);
    return {
      status: "stored",
    };
  }

  function reportConflict(candidateId: string): CandidateLifecycleResult {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    stored.candidate = {
      ...stored.candidate,
      conflictState: "reported",
    };
    audit(state, "conflict-reported", candidateId);
    saveState(statePath, state);
    return {
      reason: "candidate-conflict-reported",
      status: "conflict",
    };
  }

  return {
    add,
    confirm,
    correct,
    list,
    reject,
    reportConflict,
  };
}
