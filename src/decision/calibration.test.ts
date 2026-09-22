import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCandidateStore } from "../candidate-lifecycle.ts";
import { DEFAULT_XPI_MEMO_CONFIG, type XpiMemoConfig } from "../config.ts";
import { createEvidenceRecord, type EvidenceRecord } from "../evidence.ts";
import type { MnemosyneAdapter, T1MemoryOperation } from "../operations.js";
import type { PendingCandidate } from "../pending-candidate.js";
import {
  applyCalibratedConfidence,
  calibrateEvidenceConfidence,
} from "./calibration.js";
import type { DecisionRunner } from "./types.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-decision-calibration-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

function evidence(confidence = 0.5, type: EvidenceRecord["type"] = "l0-conclusion") {
  return createEvidenceRecord({
    confidence,
    provenance: "activation:explicit-user-intent",
    source: "explicit-user-intent",
    timestamp: "2026-01-01T00:00:00.000Z",
    type,
  });
}

function yesAt(confidence: number): DecisionRunner {
  return async () => ({
    answers: [
      {
        confidence,
        questionId: "confidence",
        value: "yes",
      },
    ],
  });
}

describe("calibrated confidence annotation (task 4.1)", () => {
  it("writes the calibrated value and marks the source", () => {
    const calibrated = applyCalibratedConfidence(evidence(0.5), 0.82);
    expect(calibrated.confidence).toBe(0.82);
    expect(calibrated.provenance).toBe("activation:explicit-user-intent+calibrated");
  });

  it("never re-classifies the evidence type", () => {
    const calibrated = applyCalibratedConfidence(evidence(0.5), 0.82);
    expect(calibrated.type).toBe("l0-conclusion");
    expect(calibrated.type).not.toBe("explicit-user-statement");
  });

  it("does not fake a user statement when the source was a model conclusion", () => {
    const ai = applyCalibratedConfidence(evidence(0.5, "verified-tool-result"), 0.9);
    expect(ai.type).toBe("verified-tool-result");
  });

  it("clamps out-of-range numbers", () => {
    expect(applyCalibratedConfidence(evidence(0.5), 4).confidence).toBe(1);
    expect(applyCalibratedConfidence(evidence(0.5), -2).confidence).toBe(0);
  });

  it("is the identity when calibration is unavailable", () => {
    const original = evidence(0.5);
    expect(applyCalibratedConfidence(original, null)).toBe(original);
  });
});

describe("calibration consumer (task 4.2)", () => {
  it("returns the same record while the consumer is disabled", async () => {
    const original = evidence(0.5);
    const runner = vi.fn(yesAt(0.99));
    const result = await calibrateEvidenceConfidence(original, "remember this", {
      enabled: false,
      runner,
    });
    expect(result).toBe(original);
    expect(runner).not.toHaveBeenCalled();
  });

  it("keeps the original record when the runner fails", async () => {
    const original = evidence(0.5);
    const result = await calibrateEvidenceConfidence(original, "remember this", {
      enabled: true,
      runner: async () => {
        throw new Error("provider down");
      },
    });
    expect(result).toBe(original);
    expect(result.provenance).not.toContain("calibrated");
  });

  it("annotates a successful calibration", async () => {
    const result = await calibrateEvidenceConfidence(evidence(0.5), "remember this", {
      enabled: true,
      runner: yesAt(0.8),
    });
    expect(result.confidence).toBe(0.8);
    expect(result.provenance).toContain("+calibrated");
  });
});

function candidate(evidenceOverride: EvidenceRecord): PendingCandidate {
  return {
    conflictState: "none",
    content: "Prefer a calibrated confidence.",
    createdAt: new Date().toISOString(),
    evidence: evidenceOverride,
    evidenceSummary: "summary",
    id: "candidate-calibrated",
    kind: "project_decision",
    rationale: "This memory requires T1 write governance before persistence.",
    reason: "project-decision",
    status: "pending",
    targetBank: "project-p-0123456789ab",
    targetScope: "global",
  };
}

function operation(evidenceOverride: EvidenceRecord): T1MemoryOperation {
  return {
    confidence: evidenceOverride.confidence,
    content: "Prefer a calibrated confidence.",
    dataDir: "/tmp/xpi-memo-decision-calibration",
    kind: "project_decision",
    provenance: evidenceOverride.provenance,
    scope: "global",
    targetBank: "project-p-0123456789ab",
    source: {
      evidenceType: evidenceOverride.type,
      source: evidenceOverride.source,
      timestamp: evidenceOverride.timestamp,
    },
  };
}

function storeWith(config: Partial<XpiMemoConfig>, statePath: string) {
  const adapter: MnemosyneAdapter = {
    async store(op) {
      return {
        id: "memory-1",
        operation: op,
        output: "Stored: memory-1",
      };
    },
  };
  return createCandidateStore({
    adapter,
    config: {
      ...DEFAULT_XPI_MEMO_CONFIG,
      ...config,
    } as XpiMemoConfig,
    env: {},
    statePath,
  });
}

describe("admission preferences consume the calibrated value (task 4.2)", () => {
  it("blocks a calibrated candidate below the configured floor", async () => {
    const calibrated = applyCalibratedConfidence(evidence(0.5), 0.4);
    const store = storeWith(
      {
        admissionMinConfidence: 0.9,
      },
      join(temporaryDirectory(), "candidates.json"),
    );
    store.add(candidate(calibrated), operation(calibrated));
    const result = await store.admit("candidate-calibrated");
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("below-min-confidence");
  });

  it("admits the same candidate once the calibrated value clears the floor", async () => {
    const calibrated = applyCalibratedConfidence(evidence(0.5), 0.95);
    const store = storeWith(
      {
        admissionMinConfidence: 0.9,
      },
      join(temporaryDirectory(), "candidates.json"),
    );
    store.add(candidate(calibrated), operation(calibrated));
    const result = await store.admit("candidate-calibrated");
    expect(result.status).toBe("stored");
  });
});
