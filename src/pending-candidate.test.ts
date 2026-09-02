import { describe, expect, it } from "vitest";

import { createEvidenceRecord } from "./evidence.ts";
import {
  generatePendingCandidate,
  type PendingCandidateInput,
} from "./pending-candidate.js";

const UUID_PATTERN = /^[0-9a-f-]{36}$/;
describe("T1 pending candidate generation", () => {
  const evidence = createEvidenceRecord({
    confidence: 0.8,
    provenance: "session:42",
    source: "reviewed conversation",
    type: "explicit-user-statement",
  });

  it.each([
    [
      "project decision",
      "project_decision",
      "project-decision",
    ],
    [
      "broad gotcha",
      "project_gotcha",
      "broad-gotcha",
    ],
    [
      "cross-project relevance",
      "project_constraint",
      "cross-project-relevance",
    ],
  ] as const)("creates a pending candidate for %s", (_label, kind, reason) => {
    const input: PendingCandidateInput = {
      content: "Use a bounded, reviewed conclusion for this project.",
      context: {
        dataDir: "/tmp/xpi-memo-candidates",
        projectBank: "project-p-0123456789ab",
      },
      evidence,
      kind,
      rationale: "This may affect future work and needs user confirmation.",
      reason,
    };

    const candidate = generatePendingCandidate(input);
    if (!candidate) throw new Error("candidate was not created");

    expect(candidate).toMatchObject({
      conflictState: "none",
      content: input.content,
      evidence,
      evidenceSummary:
        "explicit-user-statement from reviewed conversation (session:42)",
      kind,
      rationale: input.rationale,
      reason,
      status: "pending",
      targetBank: "project-p-0123456789ab",
      targetScope: "global",
    });
    expect(candidate.id).toMatch(UUID_PATTERN);
  });

  it("routes an ambiguous global preference to the global bank", () => {
    const candidate = generatePendingCandidate({
      content: "Prefer concise status updates.",
      context: {
        dataDir: "/tmp/xpi-memo-candidates",
        projectBank: null,
      },
      evidence,
      kind: "global_preference",
      rationale: "The preference is inferred rather than explicitly stated as durable.",
      reason: "ambiguous-preference",
    });

    expect(candidate).toMatchObject({
      kind: "global_preference",
      targetBank: "default",
      targetScope: "global",
    });
  });

  it("does not create a candidate for an automatically eligible memory", () => {
    const input: PendingCandidateInput = {
      content: "The repository uses pnpm.",
      evidence: createEvidenceRecord({
        confidence: 0.95,
        provenance: "git:abc123",
        source: "package.json",
        type: "verified-repository-fact",
      }),
      kind: "project_gene",
      rationale: "This is deterministic repository evidence.",
      reason: "high-impact-durable",
      verified: true,
      context: {
        dataDir: "/tmp/xpi-memo-candidates",
        projectBank: "project-p-0123456789ab",
      },
    };

    expect(generatePendingCandidate(input)).toBeNull();
  });

  it("forces candidate creation when allowAutoStore is false even for auto-eligible memory", () => {
    const candidate = generatePendingCandidate({
      allowAutoStore: false,
      content: "The repository uses pnpm.",
      evidence: createEvidenceRecord({
        confidence: 0.95,
        provenance: "git:abc123",
        source: "package.json",
        type: "verified-repository-fact",
      }),
      kind: "project_gene",
      rationale: "Offline extraction requires review before persistence.",
      reason: "high-impact-durable",
      verified: true,
      context: {
        dataDir: "/tmp/xpi-memo-candidates",
        projectBank: "project-p-0123456789ab",
      },
    });
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("project_gene");
    expect(candidate?.status).toBe("pending");
  });
});
