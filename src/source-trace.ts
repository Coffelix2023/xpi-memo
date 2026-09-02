/**
 * Bounded source trace (task 6.2).
 *
 * Answers "why does this memory exist?" by linking a stored memory or a
 * pending candidate back to its originating L0 session/event or review state.
 *
 * Trace output is bounded and body-free by default: session id, position,
 * event type, timestamp, kind label, scope, trust text, bank, and the
 * recorded provenance reference. It never includes memory or candidate body
 * text, queries, reasons, or secrets.
 */

import { describeMemoryKindOrNull, type MemoryKind } from "./kinds.js";
import type { L0Event } from "./l0/types.js";
import type { PendingCandidate } from "./pending-candidate.js";

export interface SourceTraceProvenance {
  source?: string;
  sourceEventPosition?: number;
  sourceSessionId?: string;
}

export type SourceTrace =
  | {
      /** Where the trace points: a stored memory event or a pending candidate. */
      target: "memory";
      kind: MemoryKind | null;
      label: string;
      scope: string;
      trustState: string;
      bank?: string;
      eventType: string;
      sessionId: string | null;
      position: number | null;
      timestamp: string | null;
      provenance: SourceTraceProvenance;
    }
  | {
      target: "candidate";
      kind: MemoryKind | null;
      label: string;
      scope: string;
      trustState: string;
      bank?: string;
      candidateId: string;
      reviewState: string;
      createdAt: string;
      provenance: SourceTraceProvenance;
    };

/** Extract the bounded provenance reference embedded in an L0 payload. */
export function provenanceOf(payload: Record<string, unknown>): SourceTraceProvenance {
  const source =
    typeof payload.source === "string" && payload.source ? payload.source : undefined;
  const sourceEventPosition =
    typeof payload.sourceEventPosition === "number"
      ? payload.sourceEventPosition
      : undefined;
  const sourceSessionId =
    typeof payload.sourceSessionId === "string" && payload.sourceSessionId
      ? payload.sourceSessionId
      : undefined;
  return {
    ...(source
      ? {
          source,
        }
      : {}),
    ...(sourceEventPosition !== undefined
      ? {
          sourceEventPosition,
        }
      : {}),
    ...(sourceSessionId
      ? {
          sourceSessionId,
        }
      : {}),
  };
}

/**
 * Trace a stored memory by its confirming L0 event. `events` is the bounded
 * window (read via `readRange`) for the target session; `sessionId` may be
 * null when the caller only knows the event stream.
 */
export function traceMemoryEvent(
  events: readonly L0Event[],
  sessionId: string | null,
  position: number | null,
): SourceTrace | null {
  const event =
    position === null
      ? undefined
      : events.find((candidate) => candidate.position === position);
  if (!event) return null;

  const kind =
    typeof event.payload.kind === "string" ? (event.payload.kind as MemoryKind) : null;
  const description = describeMemoryKindOrNull(kind ?? undefined);
  const bank = typeof event.payload.bank === "string" ? event.payload.bank : undefined;

  return {
    target: "memory",
    kind,
    label: description?.label ?? kind ?? "unknown",
    scope: description?.scope ?? "unknown",
    trustState: description?.trustState ?? "unknown",
    ...(bank
      ? {
          bank,
        }
      : {}),
    eventType: event.type,
    sessionId,
    position: event.position,
    provenance: provenanceOf(event.payload),
    timestamp: event.timestamp,
  };
}

/**
 * Trace a pending candidate by id. `candidates` is the pending queue;
 * `events` is the bounded `candidate_created` window used to locate the
 * provenance reference. When no L0 event references the candidate, the
 * trace reports the review state with provenance empty rather than guessing.
 */
export function traceCandidate(
  candidates: readonly PendingCandidate[],
  events: readonly L0Event[],
  candidateId: string,
): SourceTrace | null {
  const candidate = candidates.find((entry) => entry.id === candidateId);
  if (!candidate) return null;

  const description = describeMemoryKindOrNull(candidate.kind);
  const creatingEvent = events.find(
    (event) =>
      event.type === "candidate_created" && event.payload.candidateId === candidateId,
  );

  return {
    bank: candidate.targetBank,
    kind: candidate.kind,
    label: description?.label ?? candidate.kind,
    scope: description?.scope ?? "unknown",
    target: "candidate",
    trustState: description?.trustState ?? "unknown",
    candidateId,
    createdAt: candidate.createdAt,
    provenance: creatingEvent ? provenanceOf(creatingEvent.payload) : {},
    reviewState: candidate.status,
  };
}

/** Human-readable, bounded, body-free trace rendering. */
export function formatSourceTrace(trace: SourceTrace): string {
  const lines = [
    `target: ${trace.target}`,
    `kind: ${trace.label} (${trace.kind ?? "unknown"})`,
    `scope: ${trace.scope}`,
    `trust: ${trace.trustState}`,
  ];
  if (trace.bank) lines.push(`bank: ${trace.bank}`);
  if (trace.target === "memory") {
    lines.push(`event: ${trace.eventType}`);
    lines.push(`session: ${trace.sessionId ?? "unavailable"}`);
    lines.push(`position: ${trace.position ?? "unavailable"}`);
    lines.push(`timestamp: ${trace.timestamp ?? "unavailable"}`);
  } else {
    lines.push(`candidate: ${trace.candidateId}`);
    lines.push(`review state: ${trace.reviewState}`);
    lines.push(`created: ${trace.createdAt}`);
  }
  const provenance = trace.provenance;
  const source = provenance.source ?? "unavailable";
  if (provenance.sourceSessionId || provenance.sourceEventPosition) {
    lines.push(
      `source event: session ${provenance.sourceSessionId ?? "unknown"} @ position ${
        provenance.sourceEventPosition ?? "unknown"
      } (${source})`,
    );
  } else {
    lines.push(`source event: unavailable (${source})`);
  }
  return lines.join("\n");
}
