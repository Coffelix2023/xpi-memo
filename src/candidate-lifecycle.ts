import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import type { AuditLog } from "./audit.js";
import { DEFAULT_XPI_MEMO_CONFIG, type XpiMemoConfig } from "./config.js";
import { classifyProhibitedContent } from "./content-policy.js";
import { upgradeEvidence } from "./evidence-upgrade.js";
import { autoAdmitEnabled } from "./kind-routing.js";
import type { MemoryKind } from "./kinds.js";
import type { L0Event, L0EventType } from "./l0/types.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import type { PendingCandidate } from "./pending-candidate.js";
import { type VerifierFn, verifyCandidateIfNeeded } from "./tool-verification.js";

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
  memoryId?: string;
  reason?: string;
  status: "conflict" | "rejected" | "skipped" | "stored" | "unresolved";
}

export interface CandidateStore {
  add(
    candidate: PendingCandidate,
    operation: T1MemoryOperation,
  ): CandidateLifecycleResult;
  /**
   * The single admission decision (stabilize-candidate-auto-admission):
   * kind policy -> verification -> permitted evidence upgrade -> rollout.
   * Returns `stored` for auto-stored candidates, `skipped` (pending or
   * shadow-verified) otherwise; the candidate is never lost.
   */
  admit(candidateId: string): Promise<CandidateLifecycleResult>;
  confirm(candidateId: string): Promise<CandidateLifecycleResult>;
  correct(
    candidateId: string,
    operation: T1MemoryOperation,
  ): Promise<CandidateLifecycleResult>;
  list(): PendingCandidate[];
  reject(candidateId: string): Promise<CandidateLifecycleResult>;
  reportConflict(candidateId: string): CandidateLifecycleResult;
}

/** Minimal L0 surface for lifecycle events; recording is fail-open (task 5.3). */
interface L0EventRecorder {
  recordSafe(type: L0EventType, payload: Record<string, unknown>): L0Event | null;
}

interface CreateCandidateStoreOptions {
  adapter: MnemosyneAdapter;
  /** Audit log for tool-verification entries (tasks 7.3/7.4); optional. */
  auditLog?: AuditLog;
  beforeStore?: (operation: T1MemoryOperation) => void;
  commit?: (operation: T1MemoryOperation) => Promise<{
    reason?: string;
    memoryId?: string;
    status: "failed" | "stored" | "unresolved";
  }>;
  /** Loaded config; its `autoAdmit` decides when the env var is unset. */
  config?: XpiMemoConfig;
  /** Admission-policy env override (XPI_MEMO_AUTO_VERIFY); defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** L0 recorder for auto-verification events (task 5.3); optional, fail-open. */
  l0?: L0EventRecorder;
  statePath: string;
  /** Verifier registry override (tests); defaults to VERIFIERS. */
  verifiers?: ReadonlyMap<MemoryKind, VerifierFn>;
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
  auditLog,
  beforeStore,
  commit,
  config,
  env,
  l0,
  verifiers,
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
    return persistConfirmed(stored.operation, candidateId);
  }

  /**
   * Shared persistence tail for both confirmation paths: runs the store
   * hooks, deletes the candidate from the queue on success, and records the
   * queue-level audit entry.
   */
  async function persistConfirmed(
    operation: T1MemoryOperation,
    candidateId: string,
  ): Promise<CandidateLifecycleResult> {
    beforeStore?.(operation);
    const outcome = commit
      ? await commit(operation)
      : await adapter.store(operation).then(() => ({
          memoryId: undefined,
          status: "stored" as const,
        }));
    if (outcome.status === "unresolved") {
      // Backend processed the write but L0 could not confirm a terminal
      // event: the candidate stays pending and the outcome is not a user
      // rejection.
      return {
        ...(outcome.memoryId
          ? {
              memoryId: outcome.memoryId,
            }
          : {}),
        ...(outcome.reason
          ? {
              reason: outcome.reason,
            }
          : {}),
        status: "unresolved",
      };
    }
    if (outcome.status !== "stored") {
      return {
        ...(outcome.reason
          ? {
              reason: outcome.reason,
            }
          : {}),
        status: "rejected",
      };
    }
    delete state.candidates[candidateId];
    audit(state, "candidate-confirmed", candidateId);
    saveState(statePath, state);
    return {
      ...(outcome.memoryId
        ? {
            memoryId: outcome.memoryId,
          }
        : {}),
      status: "stored",
    };
  }

  /**
   * Single admission decision (change stabilize-candidate-auto-admission):
   * verify a pending candidate through its kind policy, upgrade its evidence
   * only along the sanctioned path, and store only under the explicit
   * rollout. Anything else (policy skip, verification failure, shadow mode,
   * persistence failure) leaves the candidate pending with its original
   * evidence.
   */
  async function admit(candidateId: string): Promise<CandidateLifecycleResult> {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    // Kind policy first (t1-governance decision order): accumulate and
    // manual-confirm kinds never reach the verifier.
    const verification = await verifyCandidateIfNeeded(
      {
        content: stored.candidate.content,
        kind: stored.candidate.kind,
        repositoryFact: stored.candidate.repositoryFact,
      },
      {
        env,
        verifiers,
      },
    );
    if (verification.status !== "verified") {
      if (verification.status === "failed") {
        // Spec (t1-governance): failed verification is visible in the L0
        // trace; the candidate itself stays pending for manual review.
        l0?.recordSafe("tool_verification_failed", {
          bank: stored.candidate.targetBank,
          candidateId,
          decision: "pending",
          kind: stored.candidate.kind,
          reason: verification.reason,
          scope: stored.candidate.targetScope,
        });
        auditLog?.record("tool-verification-failed", {
          candidateId,
          decision: "pending",
          kind: stored.candidate.kind,
          reason: verification.reason,
          scope: stored.candidate.targetScope,
        });
      }
      return {
        reason: verification.reason,
        status: "skipped",
      };
    }
    // Evidence upgrade guard (task 2.4): only l0-conclusion conclusions are
    // upgraded; every other evidence type (including verified-tool-result)
    // keeps its semantics and never reaches upgradeEvidence, so the
    // whitelist can never throw here.
    const upgraded =
      stored.candidate.evidence.type === "l0-conclusion"
        ? upgradeEvidence(stored.candidate, verification)
        : stored.candidate;
    const operation = {
      ...stored.operation,
      confidence: upgraded.evidence.confidence,
      provenance: upgraded.evidence.provenance,
      source: {
        ...stored.operation.source,
        evidenceType: upgraded.evidence.type,
        source: upgraded.evidence.source,
        timestamp: upgraded.evidence.timestamp,
      },
    };
    // Rollout (design Decisions 2/4): auto-storage is on unless the env var or
    // the config file turns it off, and applies to project_gene only —
    // project_constraint stays shadow even with a registered verifier.
    // Anything else is a bounded shadow outcome.
    if (
      stored.candidate.kind === "project_gene" &&
      autoAdmitEnabled(config ?? DEFAULT_XPI_MEMO_CONFIG, env)
    ) {
      const result = await persistConfirmed(operation, candidateId);
      if (result.status !== "stored") return result;
      auditLog?.record("tool-verified", {
        candidateId,
        decision: "auto-stored",
        excerpt: verification.excerpt,
        filePath: verification.filePath,
        kind: stored.candidate.kind,
        line: verification.line,
        scope: stored.candidate.targetScope,
        status: "stored",
      });
      l0?.recordSafe("candidate_auto_verified", {
        bank: stored.candidate.targetBank,
        candidateId,
        evidenceType: upgraded.evidence.type,
        filePath: verification.filePath,
        kind: stored.candidate.kind,
        scope: stored.candidate.targetScope,
      });
      l0?.recordSafe("candidate_confirmed", {
        bank: stored.candidate.targetBank,
        candidateId,
        evidenceType: upgraded.evidence.type,
        kind: stored.candidate.kind,
        scope: stored.candidate.targetScope,
      });
      return result;
    }
    // Shadow mode: verified, recorded, candidate kept pending — never a
    // silent skip and never a T1 write.
    auditLog?.record("tool-verified", {
      candidateId,
      decision: "shadow-verified",
      excerpt: verification.excerpt,
      filePath: verification.filePath,
      kind: stored.candidate.kind,
      line: verification.line,
      scope: stored.candidate.targetScope,
      status: "shadow",
    });
    l0?.recordSafe("tool_verification_shadow", {
      bank: stored.candidate.targetBank,
      candidateId,
      evidenceType: stored.candidate.evidence.type,
      filePath: verification.filePath,
      kind: stored.candidate.kind,
      scope: stored.candidate.targetScope,
    });
    return {
      reason: "shadow-verified",
      status: "skipped",
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
    admit,
    confirm,
    correct,
    list,
    reject,
    reportConflict,
  };
}
