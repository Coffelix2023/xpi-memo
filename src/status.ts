import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AuditEntry, AuditMetadata } from "./audit.js";
import type { ExactIdReadCapability } from "./banks.ts";
import type { L0Status } from "./cli/l0.js";
import type { EmbeddingMode } from "./config.js";
import type { MemoryDoctorReport } from "./doctor.js";
import type { MemoryEvent } from "./event-stream.js";
import type { FeedbackSummary } from "./feedback.js";
import { describeMemoryKindOrNull } from "./kinds.js";
import type { MentalModelStateCounts } from "./mental-model/evaluate.js";
import type { MentalModelRefreshOutcome } from "./mental-model/types.js";
import type { ObservabilitySnapshot } from "./observability.js";

export interface MemoryStatus {
  /** Body-free cross-layer consistency diagnostics. */
  consistency?: {
    lifecycle: {
      total: number;
      entries: Array<{
        bank?: string;
        kind?: string;
        operationId: string;
        reason: string;
        scope?: string;
        status: "failed" | "unresolved";
      }>;
    };
    memoryProjection: "complete" | "failed" | "pending" | "unknown";
  };
  counts: {
    global: number | null;
    project: number | null;
    session: number | null;
  };
  currentProject: {
    bank: string;
    id: string;
    label: string;
  } | null;
  diskBytes: number | null;
  /** Empty-memory diagnosis + evidence bundle (task 4.2/4.3). */
  doctor?: MemoryDoctorReport;
  /** The embedding switches xpi-memo hands its mnemosyne child processes.
   * `model: null` means the panel leaves mnemosyne's own default in place.
   * Answers "why is storing slow" and "which model is in use" without a
   * second CLI call; the config.yaml keys are not on mnemosyne's store path. */
  embedding: {
    model: string | null;
    mode: EmbeddingMode;
  };
  /** Body-free recent memory lifecycle events (task 2.2), oldest first.
   * Stored / candidate-created / rejected / recalled / injected / degraded
   * states are directly distinguishable; the backend field distinguishes
   * backend-not-run from queried-no-hits. */
  events?: MemoryEvent[];
  /** Exact-ID read capability verdict that forget is gated on (change
   * memory-forget-exact-id, task 3.3): a verdict plus a reason code / command
   * name, never a memory body. */
  exactIdRead?: ExactIdReadCapability;
  fallback: boolean | null;
  /** Bounded explicit/passive feedback and relation counters. */
  feedback?: FeedbackSummary;
  /**
   * Body-free mental-model projection states and bounded lifecycle counters
   * (change add-mental-model-projections, task 5.2).
   *
   * `counts` always carries all six states plus `skipped`, so a zero is never
   * read as "not measured"; `recent` is a bounded tail of refresh records.
   */
  mentalModels?: {
    counts: MentalModelStateCounts;
    definitions: string;
    enabled: boolean;
    injectedChars: number;
    injectedDecisions: number;
    omitted: number;
    outcomes: Partial<Record<MentalModelRefreshOutcome, number>>;
    recent: Array<{
      definitionId: string;
      outcome: MentalModelRefreshOutcome;
      ownerKey: string;
      scope: "global" | "project";
      sourceCount: number;
      status: "failed" | "refreshed" | "skipped";
    }>;
  };
  /** Near-duplicate pairs reported by mechanical sleep; never mutates storage. */
  nearDuplicates?: {
    count: number;
  };
  observability?: ObservabilitySnapshot;
  /** Gated offline extraction state; disabled unless explicitly configured. */
  offlineExtraction?: {
    enabled: boolean;
    /** Body-free lifecycle outcome code (task 3.3), never proposal text. */
    lastOutcome?: string;
    lastStatus?: string;
  };
  /** Read-only orphan project banks (task 6.4); never deleted automatically. */
  orphans?: Array<{
    bank: string;
    reason: string;
  }>;
  paused: boolean;
  pendingCandidates: number;
  provenance: string;
  recall: {
    /** Backend execution state (task 3.3): distinguishes backend-not-run
     * from backend-queried-no-hits / backend-queried-with-hits. */
    backendState?:
      | "backend-not-run"
      | "backend-queried-no-hits"
      | "backend-queried-with-hits";
    queriedBanks: string[];
    scope: "current-project-plus-global" | "global-only";
  };
  recentEntries?: Array<{
    action: string;
    bank?: string;
    kind?: string;
    label?: string;
    /** The audit entry's own (allow-listed, body-free) metadata block. */
    metadata?: AuditMetadata;
    role?: "standing" | "contextual";
    memoryScope?: "global" | "project" | "session";
    trustState?: string;
    scope?: string;
    status?: string;
    timestamp: string;
  }>;
  retrieval: {
    embeddingAvailable: boolean | null;
    mode: "fts5" | "hybrid";
  };
  /** Pluggable search backends (Phase 4): availability + active backend. */
  search?: {
    active: string | null;
    backends: Array<{
      capabilities: {
        fullText: boolean;
        semantic: boolean;
        vector: boolean;
      };
      installed: boolean;
      name: string;
    }>;
  };
  security?: {
    backendNoHitCount: number;
    backendNotRunCount: number;
    policyVersion?: string;
    recallBlocked: number;
    recallOmitted: number;
    routingRejectionCount: number;
    storageFailureCount: number;
  };
  sleep: {
    dedicatedModelSupported: boolean;
    enabled: boolean;
    /** Actual execution mode (task 3.4): dedicated / session-model /
     * mechanical / none / disabled. */
    mode: "dedicated" | "session-model" | "mechanical" | "none" | "disabled";
    /** Diagnostic state (task 3.4): SLEEP_DISABLED when no mode is usable. */
    state: "SLEEP_DISABLED" | "UNAVAILABLE" | "READY";
    reason?: string;
    sleepCommandSupported: boolean;
  };
  storage?: {
    dataDir: string;
    files: {
      audit: boolean;
      candidates: boolean;
      globalDb: boolean;
      projectDb: boolean;
    };
  };
  tiers: {
    L0: "external-session-trace";
    T1: "xpi-memo";
    T2: "deferred-ai-memory";
    T3: "deferred-memvid";
  };
  todayStored: number;
}

export function todayStored(entries: AuditEntry[], now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return entries.filter((entry) => {
    const stored =
      (entry.action === "write" || entry.action === "confirmation") &&
      entry.metadata.status === "stored";
    const timestamp = Date.parse(entry.timestamp);
    return stored && Number.isFinite(timestamp) && timestamp >= midnight.getTime();
  }).length;
}

function fileBytes(path: string): number | null {
  try {
    return statSync(path).isFile() ? statSync(path).size : null;
  } catch {
    return null;
  }
}

function directoryBytes(path: string): number | null {
  try {
    let total = 0;
    for (const entry of readdirSync(path, {
      withFileTypes: true,
    })) {
      const bytes = entry.isDirectory()
        ? directoryBytes(join(path, entry.name))
        : fileBytes(join(path, entry.name));
      if (bytes === null) return null;
      total += bytes;
    }
    return total;
  } catch {
    return null;
  }
}

export function visibleBankDiskBytes(
  dataDir: string,
  projectBank: string | null,
  exists: (path: string) => boolean = (path) => {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  },
): number | null {
  const globalDb = join(dataDir, "mnemosyne.db");
  const projectDir = projectBank ? join(dataDir, "banks", projectBank) : null;
  if (!exists(globalDb) || (projectDir && !exists(projectDir))) return null;
  const files = [
    globalDb,
    join(dataDir, "mnemosyne.db-wal"),
    join(dataDir, "mnemosyne.db-shm"),
  ].filter(exists);
  if (projectDir) {
    const projectBytes = directoryBytes(projectDir);
    if (projectBytes === null) return null;
    return (
      files.reduce((total, path) => total + (fileBytes(path) ?? 0), 0) + projectBytes
    );
  }
  return files.reduce((total, path) => total + (fileBytes(path) ?? 0), 0);
}
export function renderStatus(status: MemoryStatus): MemoryStatus {
  return {
    consistency: status.consistency
      ? {
          memoryProjection: status.consistency.memoryProjection,
          lifecycle: {
            entries: status.consistency.lifecycle.entries.map((entry) => ({
              ...(entry.bank
                ? {
                    bank: entry.bank,
                  }
                : {}),
              ...(entry.kind
                ? {
                    kind: entry.kind,
                  }
                : {}),
              operationId: entry.operationId,
              reason: entry.reason,
              ...(entry.scope
                ? {
                    scope: entry.scope,
                  }
                : {}),
              status: entry.status,
            })),
            total: status.consistency.lifecycle.total,
          },
        }
      : undefined,
    currentProject: status.currentProject
      ? {
          bank: status.currentProject.bank,
          id: status.currentProject.id,
          label: status.currentProject.label,
        }
      : null,
    diskBytes: status.diskBytes,
    doctor: status.doctor,
    events: status.events?.slice(-10),
    embedding: {
      mode: status.embedding.mode,
      model: status.embedding.model,
    },
    ...(status.exactIdRead
      ? {
          exactIdRead: {
            available: status.exactIdRead.available,
            ...(status.exactIdRead.command
              ? {
                  command: status.exactIdRead.command,
                }
              : {}),
            ...(status.exactIdRead.reason
              ? {
                  reason: status.exactIdRead.reason,
                }
              : {}),
          },
        }
      : {}),
    fallback: status.fallback,
    ...(status.mentalModels
      ? {
          mentalModels: {
            definitions: status.mentalModels.definitions,
            enabled: status.mentalModels.enabled,
            injectedChars: status.mentalModels.injectedChars,
            injectedDecisions: status.mentalModels.injectedDecisions,
            omitted: status.mentalModels.omitted,
            outcomes: status.mentalModels.outcomes,
            recent: status.mentalModels.recent.slice(0, 5).map((entry) => ({
              definitionId: entry.definitionId,
              outcome: entry.outcome,
              ownerKey: entry.ownerKey,
              scope: entry.scope,
              sourceCount: entry.sourceCount,
              status: entry.status,
            })),
            counts: {
              absent: status.mentalModels.counts.absent,
              disabled: status.mentalModels.counts.disabled,
              failed: status.mentalModels.counts.failed,
              fresh: status.mentalModels.counts.fresh,
              pending: status.mentalModels.counts.pending,
              skipped: status.mentalModels.counts.skipped,
              stale: status.mentalModels.counts.stale,
            },
          },
        }
      : {}),
    observability: status.observability,
    ...(status.feedback
      ? {
          feedback: {
            conflicts: status.feedback.conflicts,
            explicit: status.feedback.explicit,
            helpful: status.feedback.helpful,
            irrelevant: status.feedback.irrelevant,
            passive: status.feedback.passive,
            supersessions: status.feedback.supersessions,
            wrong: status.feedback.wrong,
          },
        }
      : {}),
    ...(status.security
      ? {
          security: {
            backendNoHitCount: status.security.backendNoHitCount,
            backendNotRunCount: status.security.backendNotRunCount,
            ...(status.security.policyVersion
              ? {
                  policyVersion: status.security.policyVersion,
                }
              : {}),
            recallBlocked: status.security.recallBlocked,
            recallOmitted: status.security.recallOmitted,
            routingRejectionCount: status.security.routingRejectionCount,
            storageFailureCount: status.security.storageFailureCount,
          },
        }
      : {}),
    ...(status.nearDuplicates
      ? {
          nearDuplicates: {
            count: status.nearDuplicates.count,
          },
        }
      : {}),
    ...(status.orphans
      ? {
          orphans: status.orphans.map((orphan) => ({
            bank: orphan.bank,
            reason: orphan.reason,
          })),
        }
      : {}),
    paused: status.paused,
    pendingCandidates: status.pendingCandidates,
    provenance: status.provenance,
    recentEntries: status.recentEntries?.map((entry) => ({
      action: entry.action,
      bank: entry.bank,
      kind: entry.kind,
      metadata: entry.metadata,
      ...(describeMemoryKindOrNull(entry.kind)
        ? {
            label: describeMemoryKindOrNull(entry.kind)?.label,
            memoryScope: describeMemoryKindOrNull(entry.kind)?.scope,
            role: describeMemoryKindOrNull(entry.kind)?.role,
            trustState: describeMemoryKindOrNull(entry.kind)?.trustState,
          }
        : {}),
      scope: entry.scope,
      status: entry.status,
      timestamp: entry.timestamp,
    })),
    storage: status.storage
      ? {
          dataDir: status.storage.dataDir,
          files: {
            audit: status.storage.files.audit,
            candidates: status.storage.files.candidates,
            globalDb: status.storage.files.globalDb,
            projectDb: status.storage.files.projectDb,
          },
        }
      : undefined,
    todayStored: status.todayStored,
    counts: {
      global: status.counts.global,
      project: status.counts.project,
      session: status.counts.session,
    },
    recall: {
      ...(status.recall.backendState
        ? {
            backendState: status.recall.backendState,
          }
        : {}),
      queriedBanks: status.recall.queriedBanks.slice(0, 2),
      scope: status.recall.scope,
    },
    retrieval: {
      embeddingAvailable: status.retrieval.embeddingAvailable,
      mode: status.retrieval.mode,
    },
    ...(status.offlineExtraction
      ? {
          offlineExtraction: {
            enabled: status.offlineExtraction.enabled,
            ...(status.offlineExtraction.lastOutcome
              ? {
                  lastOutcome: status.offlineExtraction.lastOutcome,
                }
              : {}),
            ...(status.offlineExtraction.lastStatus
              ? {
                  lastStatus: status.offlineExtraction.lastStatus,
                }
              : {}),
          },
        }
      : {}),
    ...(status.search
      ? {
          search: {
            active: status.search.active,
            backends: status.search.backends.map((backend) => ({
              installed: backend.installed,
              name: backend.name,
              capabilities: {
                fullText: backend.capabilities.fullText,
                semantic: backend.capabilities.semantic,
                vector: backend.capabilities.vector,
              },
            })),
          },
        }
      : {}),
    sleep: {
      dedicatedModelSupported: status.sleep.dedicatedModelSupported,
      enabled: status.sleep.enabled,
      mode: status.sleep.mode,
      state: status.sleep.state,
      ...(status.sleep.reason
        ? {
            reason: status.sleep.reason,
          }
        : {}),
      sleepCommandSupported: status.sleep.sleepCommandSupported,
    },
    tiers: {
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    },
  };
}

/**
 * Human-readable (indented) JSON status shared by /xpi-memo-status and the
 * console Status tab: rendered MemoryStatus plus an L0 session-trace summary.
 */
export function formatStatusJson(status: MemoryStatus, l0: L0Status): string {
  return JSON.stringify(
    {
      ...renderStatus(status),
      l0: {
        enabled: l0.enabled,
        sessionCount: l0.sessionCount,
        totalBytes: l0.totalBytes,
        totalEvents: l0.totalEvents,
      },
    },
    null,
    2,
  );
}
