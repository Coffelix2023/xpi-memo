export const EVIDENCE_TYPES = [
  "explicit-user-statement",
  "verified-repository-fact",
  "verified-tool-result",
  "user-confirmed-candidate",
  "l0-conclusion",
  "t2-handoff",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * Provenance-safe evidence classification (task 2.4). Only provenance that
 * points at a recorded L0 user event (`input:` prefix, set by the input hook)
 * supports `explicit-user-statement`. Agent tool input, model inference,
 * derived content, and missing provenance stay `verified-tool-result`.
 */
export function evidenceTypeForProvenance(
  provenance:
    | {
        source: string;
      }
    | undefined,
): EvidenceType {
  return provenance?.source.startsWith("input:")
    ? "explicit-user-statement"
    : "verified-tool-result";
}

export interface EvidenceRecordInput {
  confidence: number;
  provenance: string;
  revision?: string;
  source: string;
  timestamp?: string;
  type: EvidenceType;
}

export interface EvidenceRecord {
  confidence: number;
  provenance: string;
  revision?: string;
  source: string;
  timestamp: string;
  type: EvidenceType;
}

function isEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === "string" && EVIDENCE_TYPES.includes(value as EvidenceType);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedTimestamp(timestamp: string | undefined): string {
  if (timestamp === undefined) return new Date().toISOString();
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) throw new Error("Invalid evidence record: timestamp");
  return new Date(parsed).toISOString();
}

export function createEvidenceRecord(input: EvidenceRecordInput): EvidenceRecord {
  if (
    !isEvidenceType(input.type) ||
    !isNonEmptyString(input.source) ||
    !isNonEmptyString(input.provenance) ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new Error("Invalid evidence record");
  }

  const revision = input.revision?.trim();
  if (input.revision !== undefined && !revision) {
    throw new Error("Invalid evidence record: revision");
  }

  return {
    confidence: input.confidence,
    provenance: input.provenance.trim(),
    ...(revision
      ? {
          revision,
        }
      : {}),
    source: input.source.trim(),
    timestamp: normalizedTimestamp(input.timestamp),
    type: input.type,
  };
}

export function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    !isEvidenceType(record.type) ||
    !isNonEmptyString(record.source) ||
    !isNonEmptyString(record.provenance) ||
    typeof record.timestamp !== "string" ||
    Number.isNaN(Date.parse(record.timestamp)) ||
    typeof record.confidence !== "number" ||
    !Number.isFinite(record.confidence) ||
    record.confidence < 0 ||
    record.confidence > 1
  ) {
    return false;
  }
  return record.revision === undefined || isNonEmptyString(record.revision);
}
