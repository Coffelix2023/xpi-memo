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
import {
  ARCHIVED_STATUS,
  archiveExpiry,
  isArchiveExpired,
  MS_PER_DAY,
} from "./candidate-archive.js";
import { DEFAULT_XPI_MEMO_CONFIG, type XpiMemoConfig } from "./config.js";
import { classifyProhibitedContent } from "./content-policy.js";
import type { EvidenceRecord } from "./evidence.js";
import { upgradeEvidence } from "./evidence-upgrade.js";
import {
  type AdmissionPreferences,
  admissionPreferences,
  autoAdmitEnabled,
} from "./kind-routing.js";
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
    | "candidate-archive-purged"
    | "candidate-archived"
    | "candidate-confirmed"
    | "candidate-corrected"
    | "candidate-rejected"
    | "candidate-restored"
    | "conflict-reported";
  candidateId: string;
  timestamp: string;
}

export interface CandidateLifecycleResult {
  memoryId?: string;
  reason?: string;
  status: "conflict" | "rejected" | "skipped" | "stored" | "unresolved";
}

/**
 * `dryRun` answers the admission question — `stored` or `skipped` — without
 * writing anything: no T1 write, no L0 event, no state file. Verification only
 * enriches evidence, so skipping it changes no outcome
 * (change rescan-visibility-and-throughput, task 1.1).
 */
export interface AdmitOptions {
  dryRun?: boolean;
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
  admit(candidateId: string, options?: AdmitOptions): Promise<CandidateLifecycleResult>;
  /**
   * Move a candidate out of the review queue without losing it: the record
   * keeps its content and gets a retention deadline.
   */
  archive(candidateId: string): CandidateLifecycleResult;
  /**
   * Coalesce the state writes inside `run` into one at the end
   * (rescan-visibility-and-throughput, task 3.1). The walk stays in memory and
   * the file is written from `finally`, so a throw still persists what already
   * happened. Nested calls join the outermost batch.
   */
  batch<T>(run: () => Promise<T>): Promise<T>;
  confirm(candidateId: string): Promise<CandidateLifecycleResult>;
  correct(
    candidateId: string,
    operation: T1MemoryOperation,
  ): Promise<CandidateLifecycleResult>;
  list(): PendingCandidate[];
  listArchived(): PendingCandidate[];
  /** Drop archived candidates whose retention window has passed. */
  purgeExpired(now?: Date): string[];
  reject(candidateId: string): Promise<CandidateLifecycleResult>;
  reportConflict(candidateId: string): CandidateLifecycleResult;
  /** Bring an archived candidate back into the review queue. */
  restore(candidateId: string): CandidateLifecycleResult;
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
  /** Current project bank, for the `current-project` source scope. */
  currentProjectBank?: string | null;
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
      Object.entries(parsed.candidates)
        .filter(
          ([, stored]) =>
            typeof stored === "object" &&
            stored !== null &&
            typeof stored.candidate === "object" &&
            stored.candidate !== null &&
            typeof stored.operation === "object" &&
            stored.operation !== null,
        )
        // Records written before archiving existed carry no status; they are
        // pending, never silently archived.
        .map(([id, stored]) => [
          id,
          {
            ...stored,
            candidate: {
              ...stored.candidate,
              status:
                stored.candidate.status === ARCHIVED_STATUS
                  ? ARCHIVED_STATUS
                  : ("pending" as const),
            },
          },
        ]),
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

/**
 * Hard rails (change admission-preferences-and-pending-rescan, design
 * Decision 1): never configurable, and checked before any preference so a
 * liberal setting cannot let them through. Returns the blocking reason, or
 * `null` when the candidate passes.
 */
function hardRailReason(candidate: PendingCandidate): string | null {
  if (candidate.content.trim().length === 0) return "empty-content";
  const classification = classifyProhibitedContent({
    content: candidate.content,
  });
  if (classification) return `prohibited-content:${classification}`;
  if (candidate.conflictState !== "none") return "unresolved-conflict";
  return null;
}

/**
 * Whether `createdAt` is older than `maxAgeDays`. An unparseable timestamp
 * counts as fresh: the age window exists to skip stale candidates, and a
 * malformed date is no evidence of staleness.
 */
function olderThanDays(createdAt: string, maxAgeDays: number, now: Date): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created > maxAgeDays * MS_PER_DAY;
}

/**
 * The preference half of the admission decision: pure in-memory checks, no
 * file read and no tool call. Returns the blocking reason, or `null` when the
 * candidate may enter T1.
 */
function preferenceBlockReason(input: {
  candidate: PendingCandidate;
  currentProjectBank: string | null;
  evidenceType: EvidenceRecord["type"];
  now: Date;
  preferences: AdmissionPreferences;
}): string | null {
  const { candidate, currentProjectBank, evidenceType, preferences } = input;
  const { confidence } = candidate.evidence;
  if (typeof confidence === "number" && confidence < preferences.minConfidence)
    return "below-min-confidence";
  if (
    preferences.sourceScope === "current-project" &&
    (currentProjectBank === null || candidate.targetBank !== currentProjectBank)
  )
    return "outside-source-scope";
  if (olderThanDays(candidate.createdAt, preferences.maxAgeDays, input.now))
    return "stale-candidate";
  if (
    preferences.evidenceFloor === "repository-fact" &&
    evidenceType !== "verified-repository-fact"
  )
    return "below-evidence-floor";
  return null;
}

export function createCandidateStore({
  adapter,
  auditLog,
  beforeStore,
  commit,
  currentProjectBank,
  config,
  env,
  l0,
  verifiers,
  statePath,
}: CreateCandidateStoreOptions): CandidateStore {
  const state = loadState(statePath);

  // ponytail: one flag, not a write queue. Every mutation is a whole-file
  // snapshot, so the only thing a batch saves is the number of stringify+rename
  // passes. Ceiling: the state lives in memory only until the batch closes.
  let batching = false;
  let writePending = false;

  /** One file write, or a promise to make one when the batch closes. */
  function persistState(): void {
    if (batching) {
      writePending = true;
      return;
    }
    saveState(statePath, state);
  }

  async function batch<T>(run: () => Promise<T>): Promise<T> {
    const outermost = !batching;
    batching = true;
    try {
      return await run();
    } finally {
      if (outermost) {
        batching = false;
        if (writePending) {
          writePending = false;
          saveState(statePath, state);
        }
      }
    }
  }
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
    persistState();
    return {
      status: "stored",
    };
  }

  function list(): PendingCandidate[] {
    return Object.values(state.candidates)
      .map(({ candidate }) => candidate)
      .filter((candidate) => candidate.status !== ARCHIVED_STATUS);
  }

  function listArchived(): PendingCandidate[] {
    return Object.values(state.candidates)
      .map(({ candidate }) => candidate)
      .filter((candidate) => candidate.status === ARCHIVED_STATUS);
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
    persistState();
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
   * Single admission decision (change admission-preferences-and-pending-rescan,
   * design Decision 1). The order is fixed and deliberate:
   *
   * 1. hard rails — content policy, unresolved conflict, empty content. Never
   *    configurable, and first so a liberal preference cannot pass them.
   * 2. preferences — pure in-memory checks, run before any file or tool access
   *    so the default liberal path skips verification it does not need.
   * 3. verification — evidence enrichment only; a failure no longer gates.
   * 4. write, or leave the candidate in the review queue.
   */
  async function admit(
    candidateId: string,
    options: AdmitOptions = {},
  ): Promise<CandidateLifecycleResult> {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    const candidate = stored.candidate;
    const loadedConfig = config ?? DEFAULT_XPI_MEMO_CONFIG;

    // 1. Hard rails.
    const rail = hardRailReason(candidate);
    if (rail) {
      if (!options.dryRun)
        l0?.recordSafe("candidate_refused", {
          bank: candidate.targetBank,
          candidateId,
          decision: "refused",
          kind: candidate.kind,
          reason: rail,
          scope: candidate.targetScope,
        });
      return {
        reason: rail,
        status: "rejected",
      };
    }

    // 2. Preferences. The rollout switch and the per-kind switch resolve
    //    together in `autoAdmitEnabled` (kill switch → env → config → kind).
    // `paused` is a runtime gate that outranks every preference: while memory
    // work is stopped, nothing is admitted automatically.
    let blocked: string | null;
    if (loadedConfig.paused) {
      blocked = "paused";
    } else if (!autoAdmitEnabled(loadedConfig, env, candidate.kind)) {
      blocked = "auto-admit-disabled";
    } else {
      blocked = preferenceBlockReason({
        candidate,
        currentProjectBank: currentProjectBank ?? null,
        evidenceType: candidate.evidence.type,
        now: new Date(),
        preferences: admissionPreferences(loadedConfig),
      });
    }
    if (blocked) {
      // Not admitted, not lost: the candidate stays for review with a bounded
      // reason on the trace. A dry run reports that reason without recording it.
      if (!options.dryRun)
        l0?.recordSafe("candidate_held", {
          bank: candidate.targetBank,
          candidateId,
          decision: "pending",
          kind: candidate.kind,
          reason: blocked,
          scope: candidate.targetScope,
        });
      return {
        reason: blocked,
        status: "skipped",
      };
    }
    // A dry run stops here. The judgment above is the whole answer: the write,
    // the verification and the audit are effects, and a preview has none of them.
    // Verification only enriches evidence, so skipping it decides nothing.
    if (options.dryRun)
      return {
        reason: "admitted",
        status: "stored",
      };

    // 3. Verification is enrichment, not a gate: run it only for kinds that
    //    have a verifier, and keep going either way.
    const verification = await verifyCandidateIfNeeded(
      {
        content: candidate.content,
        kind: candidate.kind,
        repositoryFact: candidate.repositoryFact,
      },
      {
        env,
        verifiers,
      },
    );
    if (verification.status === "failed") {
      // Visible on both traces, and no longer a reason to hold the candidate:
      // the preference decision above already admitted it.
      l0?.recordSafe("tool_verification_failed", {
        bank: candidate.targetBank,
        candidateId,
        decision: "auto-admitted",
        kind: candidate.kind,
        reason: verification.reason,
        scope: candidate.targetScope,
      });
      auditLog?.record("tool-verification-failed", {
        candidateId,
        decision: "auto-admitted",
        kind: candidate.kind,
        reason: verification.reason,
        scope: candidate.targetScope,
      });
    }
    // Evidence upgrade guard (task 2.4): only a verified `l0-conclusion` is
    // upgraded; every other evidence type keeps its semantics, so the
    // whitelist can never throw here.
    const upgraded =
      verification.status === "verified" && candidate.evidence.type === "l0-conclusion"
        ? upgradeEvidence(candidate, verification)
        : candidate;
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

    // 4. Write.
    const result = await persistConfirmed(operation, candidateId);
    if (result.status !== "stored") return result;
    // The filterable auto mark (task 2.5): every write through this path is
    // automatic, so one decision marker covers them all.
    auditLog?.record("candidate-auto-admitted", {
      candidateId,
      decision: "auto-admitted",
      kind: candidate.kind,
      scope: candidate.targetScope,
    });
    if (verification.status === "verified")
      auditLog?.record("tool-verified", {
        candidateId,
        decision: "auto-stored",
        excerpt: verification.excerpt,
        filePath: verification.filePath,
        kind: candidate.kind,
        line: verification.line,
        scope: candidate.targetScope,
        status: "stored",
      });
    l0?.recordSafe("candidate_auto_admitted", {
      bank: candidate.targetBank,
      candidateId,
      evidenceType: upgraded.evidence.type,
      kind: candidate.kind,
      scope: candidate.targetScope,
    });
    l0?.recordSafe("candidate_confirmed", {
      bank: candidate.targetBank,
      candidateId,
      evidenceType: upgraded.evidence.type,
      kind: candidate.kind,
      scope: candidate.targetScope,
    });
    return result;
  }

  async function reject(candidateId: string): Promise<CandidateLifecycleResult> {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    delete state.candidates[candidateId];
    audit(state, "candidate-rejected", candidateId);
    persistState();
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
    persistState();
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
    persistState();
    return {
      reason: "candidate-conflict-reported",
      status: "conflict",
    };
  }

  /**
   * Move a record out of the review queue while keeping it recoverable. The
   * queue stops growing; the content stays until the retention window ends.
   */
  function archive(candidateId: string): CandidateLifecycleResult {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    const now = new Date();
    stored.candidate = {
      ...stored.candidate,
      archivedAt: now.toISOString(),
      expiresAt: archiveExpiry(
        now,
        (config ?? DEFAULT_XPI_MEMO_CONFIG).archiveRetentionDays,
      ),
      status: ARCHIVED_STATUS,
    };
    audit(state, "candidate-archived", candidateId);
    persistState();
    return {
      reason: "candidate-archived",
      status: "skipped",
    };
  }

  /** Bring an archived record back into the review queue. */
  function restore(candidateId: string): CandidateLifecycleResult {
    const stored = state.candidates[candidateId];
    if (!stored) return notFound();
    const {
      archivedAt: _archivedAt,
      expiresAt: _expiresAt,
      ...candidate
    } = stored.candidate;
    stored.candidate = {
      ...candidate,
      status: "pending",
    };
    audit(state, "candidate-restored", candidateId);
    persistState();
    return {
      reason: "candidate-restored",
      status: "skipped",
    };
  }

  /**
   * Drop archived records whose retention window has passed. Only archived
   * records are candidates for deletion, and each one is audited before it
   * goes. T1 memories are never touched here.
   */
  function purgeExpired(now: Date = new Date()): string[] {
    const removed = Object.entries(state.candidates)
      .filter(([, stored]) => isArchiveExpired(stored.candidate, now))
      .map(([id]) => id);
    if (removed.length === 0) return removed;
    for (const id of removed) {
      audit(state, "candidate-archive-purged", id);
      delete state.candidates[id];
    }
    persistState();
    return removed;
  }

  return {
    add,
    admit,
    archive,
    batch,
    confirm,
    correct,
    list,
    listArchived,
    purgeExpired,
    reject,
    reportConflict,
    restore,
  };
}
