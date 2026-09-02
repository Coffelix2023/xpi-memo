import { describe, expect, it } from "vitest";

import {
  createEvidenceRecord,
  EVIDENCE_TYPES,
  type EvidenceRecordInput,
  evidenceTypeForProvenance,
  isEvidenceRecord,
} from "./evidence.ts";

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.*Z$/;

describe("T1 evidence records", () => {
  it("recognizes the four supported evidence sources", () => {
    expect(EVIDENCE_TYPES).toEqual([
      "explicit-user-statement",
      "verified-repository-fact",
      "verified-tool-result",
      "user-confirmed-candidate",
      "l0-conclusion",
      "t2-handoff",
    ]);
  });

  it("creates a complete record and normalizes metadata", () => {
    const record = createEvidenceRecord({
      confidence: 0.91,
      provenance: "  session:42  ",
      revision: " abc123 ",
      source: "  package.json  ",
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "verified-repository-fact",
    });

    expect(record).toEqual({
      confidence: 0.91,
      provenance: "session:42",
      revision: "abc123",
      source: "package.json",
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "verified-repository-fact",
    });
    expect(isEvidenceRecord(record)).toBe(true);
  });

  it("assigns an ISO timestamp when the caller omits one", () => {
    const record = createEvidenceRecord({
      confidence: 1,
      provenance: "user:session-1",
      source: "user message",
      type: "explicit-user-statement",
    });

    expect(record.timestamp).toMatch(ISO_TIMESTAMP_PATTERN);
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
  });

  it.each([
    [
      "user input provenance",
      "input:interactive",
      "explicit-user-statement",
    ],
    [
      "agent tool input",
      "tool_call",
      "verified-tool-result",
    ],
    [
      "direct tool execution",
      "direct-tool-execution",
      "verified-tool-result",
    ],
    [
      "missing provenance",
      undefined,
      "verified-tool-result",
    ],
  ] as const)("classifies %s", (_label, source, expected) => {
    expect(
      evidenceTypeForProvenance(
        source
          ? {
              source,
            }
          : undefined,
      ),
    ).toBe(expected);
  });

  it.each([
    "explicit-user-statement",
    "verified-repository-fact",
    "verified-tool-result",
    "user-confirmed-candidate",
  ] as const)("accepts %s records", (type) => {
    const input: EvidenceRecordInput = {
      confidence: 0.5,
      provenance: "source:event-1",
      source: "verified source",
      type,
    };

    expect(createEvidenceRecord(input).type).toBe(type);
  });

  it.each([
    [
      "empty source",
      {
        source: "",
      },
    ],
    [
      "empty provenance",
      {
        provenance: " ",
      },
    ],
    [
      "negative confidence",
      {
        confidence: -0.1,
      },
    ],
    [
      "overconfident record",
      {
        confidence: 1.1,
      },
    ],
    [
      "non-finite confidence",
      {
        confidence: Number.NaN,
      },
    ],
    [
      "invalid timestamp",
      {
        timestamp: "not-a-date",
      },
    ],
    [
      "empty revision",
      {
        revision: "  ",
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    expect(() =>
      createEvidenceRecord({
        confidence: 0.5,
        provenance: "source:event-1",
        source: "verified source",
        type: "verified-tool-result",
        ...overrides,
      } as EvidenceRecordInput),
    ).toThrow("Invalid evidence record");
  });

  it("rejects unsupported runtime records", () => {
    expect(
      isEvidenceRecord({
        confidence: 0.9,
        provenance: "source:event-1",
        source: "source",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "raw-transcript",
      }),
    ).toBe(false);
    expect(isEvidenceRecord(null)).toBe(false);
  });
});
