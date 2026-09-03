import type { AuditAction, AuditEntry } from "./audit.js";
import { isMemoryKind, type MemoryKind } from "./kinds.js";

const MAX_METADATA_ENTRIES = 5;
const MAX_METADATA_TEXT = 80;
export interface ObservabilityMetadata {
  action: AuditAction;
  bank?: string;
  evidenceType?: string;
  kind?: string;
  scope?: string;
  status?: string;
  timestamp: string;
}

export interface ObservabilitySnapshot {
  /** Body-free activation + recall outcome counts (task 6.1). */
  activation: {
    candidate: number;
    extraction: number;
    fallback: number;
    recall: number;
    recalledHits: number;
    rejection: number;
    storage: number;
  };
  counts: {
    /** Backend executed with zero results (task 3.3). */
    backendNoHits: number;
    /** No backend executed (task 3.3). */
    backendNotRun: number;
    capture: number;
    candidate: number;
    /** Controlled degradation / storage failure (task 3.3). */
    degraded: number;
    injection: number;
    recall: number;
    rejection: number;
    /** Pre-candidate routing rejection (task 3.3). */
    routingRejected: number;
    storage: number;
  };
  recent: ObservabilityMetadata[];
  /** Body-free per-kind stored counts derived from the canonical taxonomy. */
  taxonomyCounts: Partial<Record<MemoryKind, number>>;
  version: 1;
}

export interface ObservabilitySnapshotOverrides {
  injection?: number;
}

function boundedText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const singleLine = [
    ...value,
  ]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return singleLine ? singleLine.slice(0, MAX_METADATA_TEXT) : undefined;
}

function isCaptureAction(action: AuditAction): boolean {
  return action === "candidate" || action === "rejection" || action === "write";
}

function metadataOf(entry: AuditEntry): ObservabilityMetadata {
  const bank = boundedText(entry.metadata.bank);
  const evidenceType = boundedText(entry.metadata.evidenceType);
  const kind = boundedText(entry.metadata.kind);
  const scope = boundedText(entry.metadata.scope);
  const status = boundedText(entry.metadata.status);
  return {
    action: entry.action,
    ...(bank
      ? {
          bank,
        }
      : {}),
    ...(evidenceType
      ? {
          evidenceType,
        }
      : {}),
    ...(kind
      ? {
          kind,
        }
      : {}),
    ...(scope
      ? {
          scope,
        }
      : {}),
    ...(status
      ? {
          status,
        }
      : {}),
    timestamp: entry.timestamp,
  };
}

/**
 * Build the bounded, body-free observability view from the audit trail.
 * `reason`, content, queries, and arbitrary metadata never cross this boundary.
 */
export function buildObservabilitySnapshot(
  entries: readonly AuditEntry[],
  overrides: ObservabilitySnapshotOverrides = {},
): ObservabilitySnapshot {
  const counts = {
    backendNoHits: 0,
    backendNotRun: 0,
    candidate: 0,
    capture: 0,
    degraded: 0,
    injection: Math.max(0, Math.trunc(overrides.injection ?? 0)),
    recall: 0,
    rejection: 0,
    routingRejected: 0,
    storage: 0,
  };
  const activation = {
    candidate: 0,
    extraction: 0,
    fallback: 0,
    recall: 0,
    recalledHits: 0,
    rejection: 0,
    storage: 0,
  };
  const taxonomyCounts: Partial<Record<MemoryKind, number>> = {};

  for (const entry of entries) {
    if (isCaptureAction(entry.action)) counts.capture += 1;
    if (entry.action === "candidate") {
      counts.candidate += 1;
      activation.candidate += 1;
    }
    if (entry.action === "write" || entry.action === "confirmation") {
      counts.storage += 1;
      activation.storage += 1;
      const kind = entry.metadata.kind;
      if (kind && isMemoryKind(kind))
        taxonomyCounts[kind] = (taxonomyCounts[kind] ?? 0) + 1;
    }
    if (entry.action === "recall") {
      counts.recall += 1;
      activation.recall += 1;
      const hits = entry.metadata.resultCount;
      if (typeof hits === "number" && Number.isFinite(hits) && hits > 0)
        activation.recalledHits += Math.trunc(hits);
      if (entry.metadata.status === "no-backend") counts.backendNotRun += 1;
      else if (entry.metadata.status === "no-hits" || hits === 0)
        counts.backendNoHits += 1;
    }
    if (entry.action === "rejection") {
      counts.rejection += 1;
      activation.rejection += 1;
      if (entry.metadata.status === "routing_rejected") counts.routingRejected += 1;
    }
    if (entry.action === "fallback") {
      activation.fallback += 1;
      if (entry.metadata.status === "degraded") counts.degraded += 1;
    }
    if (entry.action === "extraction") activation.extraction += 1;
  }

  return {
    version: 1,
    counts,
    activation,
    taxonomyCounts,
    recent: entries.slice(-MAX_METADATA_ENTRIES).map(metadataOf),
  };
}

export function serializeObservabilitySnapshot(
  snapshot: ObservabilitySnapshot,
): string {
  return JSON.stringify(snapshot);
}
