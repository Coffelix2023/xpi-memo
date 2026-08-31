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

  it.each([
    [
      "repository gene",
      "project_gene",
      "verified-repository-fact",
    ],
    [
      "repository constraint",
      "project_constraint",
      "verified-repository-fact",
    ],
    [
      "tool gene",
      "project_gene",
      "verified-tool-result",
    ],
    [
      "tool constraint",
      "project_constraint",
      "verified-tool-result",
    ],
  ] as const)("allows verified %s", (_label, kind, evidenceType) => {
    expect(
      shouldAutoStore({
        evidence: createEvidenceRecord({
          confidence: 0.9,
          provenance: "git:abc123",
          source: "package.json",
          type: evidenceType,
        }),
        kind,
        verified: true,
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
      "unverified gene",
      {
        contentLength: 500,
        kind: "project_gene" as const,
      },
    ],
    [
      "unverified constraint",
      {
        contentLength: 500,
        kind: "project_constraint" as const,
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
        verified: false,
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
});
