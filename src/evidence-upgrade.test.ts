import { describe, expect, it } from "vitest";

import { createEvidenceRecord } from "./evidence.js";
import { EVIDENCE_UPGRADE_WHITELIST, upgradeEvidence } from "./evidence-upgrade.ts";
import type { PendingCandidate } from "./pending-candidate.js";
import type { VerificationResult } from "./types.js";

const NOT_ALLOWED_PATTERN = /Evidence upgrade not allowed/;
const DOWNGRADE_PATTERN = /Evidence upgrade not allowed: explicit-user-statement/;
function createCandidate(
  evidenceType: PendingCandidate["evidence"]["type"],
): PendingCandidate {
  const evidence = createEvidenceRecord({
    confidence: 0.7,
    provenance: "activation:offline-extraction",
    source: "session:s1#12",
    type: evidenceType,
  });
  return {
    conflictState: "none",
    content: "The extension loads src/index.ts directly.",
    createdAt: "2026-01-01T00:00:00.000Z",
    evidence,
    evidenceSummary: `${evidence.type} from ${evidence.source} (${evidence.provenance})`,
    id: "candidate-1",
    kind: "project_gene",
    rationale: "Proposed by offline extraction.",
    reason: "high-impact-durable",
    status: "pending",
    targetBank: "project-p-0123456789ab",
    targetScope: "project",
  };
}

function verified(): VerificationResult {
  return {
    filePath: "AGENTS.md",
    excerpt: "Pi 直接加载 src/index.ts TypeScript 源码。",
    line: 12,
    status: "verified",
    timestamp: "2026-01-02T00:00:00.000Z",
  };
}

describe("evidence upgrade whitelist (task 1.3)", () => {
  it("maps l0-conclusion to verified-repository-fact", () => {
    expect(EVIDENCE_UPGRADE_WHITELIST["l0-conclusion"]).toBe(
      "verified-repository-fact",
    );
  });

  it("contains only the sanctioned upgrade path", () => {
    expect(Object.keys(EVIDENCE_UPGRADE_WHITELIST)).toEqual([
      "l0-conclusion",
    ]);
  });

  it("throws for upgrade paths outside the whitelist", () => {
    for (const evidenceType of [
      "explicit-user-statement",
      "verified-tool-result",
      "user-confirmed-candidate",
      "t2-handoff",
      "repo-export",
    ] as const) {
      expect(() =>
        upgradeEvidence(createCandidate(evidenceType), verified()),
      ).toThrowError(NOT_ALLOWED_PATTERN);
    }
  });
});

describe("upgradeEvidence (task 4.1)", () => {
  it("upgrades l0-conclusion to verified-repository-fact on a passing verification", () => {
    const upgraded = upgradeEvidence(createCandidate("l0-conclusion"), verified());
    expect(upgraded.evidence.type).toBe("verified-repository-fact");
    expect(upgraded.evidenceSummary).toBe(
      "verified-repository-fact from session:s1#12 (activation:offline-extraction)",
    );
  });

  it("keeps the original evidence type when verification fails", () => {
    const candidate = createCandidate("l0-conclusion");
    const failed: VerificationResult = {
      reason: "no-match",
      status: "failed",
    };
    expect(upgradeEvidence(candidate, failed)).toBe(candidate);
  });

  it("keeps the original evidence type when verification is skipped", () => {
    const candidate = createCandidate("l0-conclusion");
    const skipped: VerificationResult = {
      reason: "policy:manual-confirm",
      status: "skipped",
    };
    expect(upgradeEvidence(candidate, skipped)).toBe(candidate);
  });
});

describe("upgradeEvidence metadata preservation (task 4.2)", () => {
  it("keeps provenance, source, timestamp, and confidence unchanged", () => {
    const original = createCandidate("l0-conclusion");
    const upgraded = upgradeEvidence(original, verified());
    expect(upgraded.evidence.source).toBe(original.evidence.source);
    expect(upgraded.evidence.provenance).toBe(original.evidence.provenance);
    expect(upgraded.evidence.timestamp).toBe(original.evidence.timestamp);
    expect(upgraded.evidence.confidence).toBe(original.evidence.confidence);
    expect(upgraded.id).toBe(original.id);
    expect(upgraded.kind).toBe(original.kind);
    expect(upgraded.content).toBe(original.content);
  });
});

describe("upgradeEvidence downgrade guard (task 4.3)", () => {
  it("refuses to downgrade an explicit-user-statement", () => {
    expect(() =>
      upgradeEvidence(createCandidate("explicit-user-statement"), verified()),
    ).toThrowError(DOWNGRADE_PATTERN);
  });
});
