import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AuditEntry } from "./audit.js";
import type { L0Status } from "./cli/l0.js";
import type { MemoryDoctorReport } from "./doctor.js";
export interface MemoryStatus {
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
  fallback: boolean | null;
  paused: boolean;
  pendingCandidates: number;
  provenance: string;
  recall: {
    queriedBanks: string[];
    scope: "current-project-plus-global" | "global-only";
  };
  recentEntries?: Array<{
    action: string;
    bank?: string;
    kind?: string;
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
  sleep: {
    dedicatedModelSupported: boolean;
    enabled: boolean;
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
    currentProject: status.currentProject
      ? {
          bank: status.currentProject.bank,
          id: status.currentProject.id,
          label: status.currentProject.label,
        }
      : null,
    diskBytes: status.diskBytes,
    doctor: status.doctor,
    fallback: status.fallback,
    paused: status.paused,
    pendingCandidates: status.pendingCandidates,
    provenance: status.provenance,
    recentEntries: status.recentEntries?.map((entry) => ({
      action: entry.action,
      bank: entry.bank,
      kind: entry.kind,
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
      queriedBanks: status.recall.queriedBanks.slice(0, 2),
      scope: status.recall.scope,
    },
    retrieval: {
      embeddingAvailable: status.retrieval.embeddingAvailable,
      mode: status.retrieval.mode,
    },
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
