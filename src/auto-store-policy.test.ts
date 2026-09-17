import { describe, expect, it } from "vitest";

import { shouldAutoStore } from "./auto-store-policy.ts";
import { createEvidenceRecord } from "./evidence.ts";

describe("T1 auto-store policy", () => {
  it.each([
    [
      "explicit global preference",
      "global_preference",
      "explicit-user-statement",
    ],
    [
      "explicit global workflow",
      "global_workflow",
      "explicit-user-statement",
    ],
  ] as const)("allows %s", (_label, kind, evidenceType) => {
    expect(
      shouldAutoStore({
        evidence: createEvidenceRecord({
          confidence: 0.9,
          provenance: "user:session-1",
          source: "user message",
          type: evidenceType,
        }),
        explicitStable: true,
        kind,
      }),
    ).toBe(true);
  });

  it("allows bounded session context", () => {
    expect(
      shouldAutoStore({
        contentLength: 500,
        evidence: createEvidenceRecord({
          confidence: 0.7,
          provenance: "session:42",
          source: "current task",
          type: "explicit-user-statement",
        }),
        kind: "session_context",
      }),
    ).toBe(true);
  });

  it("does not auto-store a verified-repository-fact decision (task 6.3)", () => {
    expect(
      shouldAutoStore({
        evidence: createEvidenceRecord({
          confidence: 0.9,
          provenance: "activation:offline-extraction",
          source: "session:s1#12",
          type: "verified-repository-fact",
        }),
        kind: "project_decision",
      }),
    ).toBe(false);
  });

  it.each([
    [
      "unbounded session context",
      {
        contentLength: 501,
        kind: "session_context" as const,
      },
    ],
    [
      "unconfirmed preference",
      {
        contentLength: 500,
        kind: "global_preference" as const,
      },
    ],
    [
      "unconfirmed workflow",
      {
        contentLength: 500,
        kind: "global_workflow" as const,
      },
    ],
    [
      "project decision",
      {
        contentLength: 500,
        kind: "project_decision" as const,
      },
    ],
    [
      "project gotcha",
      {
        contentLength: 500,
        kind: "project_gotcha" as const,
      },
    ],
  ])("does not auto-store %s", (_label, input) => {
    expect(
      shouldAutoStore({
        contentLength: input.contentLength,
        evidence: createEvidenceRecord({
          confidence: 0.8,
          provenance: "source:event-1",
          source: "source",
          type: "explicit-user-statement",
        }),
        explicitStable:
          input.kind === "global_preference" || input.kind === "global_workflow"
            ? false
            : undefined,
        kind: input.kind,
      }),
    ).toBe(false);
  });

  it("uses the conservative session limit when content length is omitted", () => {
    expect(
      shouldAutoStore({
        evidence: createEvidenceRecord({
          confidence: 0.7,
          provenance: "session:42",
          source: "current task",
          type: "explicit-user-statement",
        }),
        kind: "session_context",
      }),
    ).toBe(false);
  });

  // Task 1.3 regression: the removed project-fact branch must not change the
  // preserved direct-store paths. Even verified project facts are never
  // decided here — they go through the candidate store admission decision.
  it("keeps session context and explicit preference paths unchanged without verified input", () => {
    const sessionEvidence = createEvidenceRecord({
      confidence: 0.7,
      provenance: "session:42",
      source: "current task",
      type: "l0-conclusion",
    });
    const preferenceEvidence = createEvidenceRecord({
      confidence: 0.9,
      provenance: "user:session-1",
      source: "user message",
      type: "explicit-user-statement",
    });
    expect(
      shouldAutoStore({
        contentLength: 400,
        evidence: sessionEvidence,
        kind: "session_context",
      }),
    ).toBe(true);
    expect(
      shouldAutoStore({
        evidence: preferenceEvidence,
        explicitStable: true,
        kind: "global_preference",
      }),
    ).toBe(true);
    expect(
      shouldAutoStore({
        evidence: preferenceEvidence,
        explicitStable: true,
        kind: "project_gene",
      }),
    ).toBe(false);
  });
});
