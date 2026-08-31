import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCandidateStore } from "./candidate-lifecycle.ts";
import { classifyProhibitedContent } from "./content-policy.ts";
import { createEvidenceRecord } from "./evidence.ts";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.ts";
import type { PendingCandidate } from "./pending-candidate.ts";
import { type PromotionRequest, validatePromotion } from "./promotion-policy.ts";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-l0-rejection-"));
  temporaryDirectories.push(directory);
  return directory;
}

function candidate(content: string): PendingCandidate {
  return {
    conflictState: "none",
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
    evidence: createEvidenceRecord({
      confidence: 0.8,
      provenance: "l0:event-42",
      source: "session trace",
      type: "l0-conclusion",
    }),
    evidenceSummary: "l0-conclusion from session trace (l0:event-42)",
    id: "candidate-l0-1",
    kind: "project_decision",
    rationale: "Must not bypass write governance.",
    reason: "project-decision",
    status: "pending",
    targetBank: "project-p-0123456789ab",
    targetScope: "global",
  };
}

function operation(content: string): T1MemoryOperation {
  return {
    confidence: 0.8,
    content,
    dataDir: "/tmp/xpi-memo-l0-rejection",
    kind: "project_decision",
    provenance: "l0:event-42",
    scope: "global",
    targetBank: "project-p-0123456789ab",
    source: {
      evidenceType: "l0-conclusion",
      source: "session trace",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
  };
}

function createAdapter(): {
  adapter: MnemosyneAdapter;
  calls: T1MemoryOperation[];
} {
  const calls: T1MemoryOperation[] = [];
  return {
    calls,
    adapter: {
      async store(value) {
        calls.push(value);
        return {
          id: "memory-1",
          operation: value,
          output: "Stored: memory-1",
        };
      },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("L0 raw material rejection", () => {
  it.each([
    [
      "raw L0 event",
      "event_type: tool_result\nraw event payload",
    ],
    [
      "complete transcript",
      "role: user\nhello\nrole: assistant\nworld",
    ],
    [
      "raw tool output",
      'Tool output:\n{"stdout":"raw"}',
    ],
    [
      "model reasoning",
      "chain of thought: hidden reasoning",
    ],
  ])("rejects %s before any T1 persistence path", (_label, content) => {
    expect(
      classifyProhibitedContent({
        content,
      }),
    ).toBeTruthy();

    const dataDir = createTemporaryDirectory();
    const { adapter, calls } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });

    expect(store.add(candidate(content), operation(content)).status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(() => readFileSync(join(dataDir, "candidates.json"), "utf8")).toThrow();
  });

  it("rejects a raw L0 event even when promotion flags and evidence look valid", () => {
    const content = "event_type: tool_result\nraw event payload";
    const request: PromotionRequest = {
      content,
      evidence: createEvidenceRecord({
        confidence: 0.9,
        provenance: "l0:event-42",
        source: "reviewed session conclusion",
        type: "l0-conclusion",
      }),
      explicitPromotion: true,
      kind: "project_decision",
      reviewedConclusion: true,
      sourceLayer: "L0",
      targetLayer: "T1",
      targetScope: "global",
      userConfirmed: true,
      context: {
        dataDir: "/tmp/xpi-memo-l0-rejection",
        projectBank: "project-p-0123456789ab",
      },
    };

    expect(validatePromotion(request)).toEqual({
      accepted: false,
      reason: "content-not-concise",
    });
  });

  it("does not allow confirmation to bypass raw-content checks", async () => {
    const dataDir = createTemporaryDirectory();
    const { adapter, calls } = createAdapter();
    const store = createCandidateStore({
      adapter,
      statePath: join(dataDir, "candidates.json"),
    });
    const stored = candidate("safe-looking conclusion");
    store.add(stored, operation("Tool output:\nraw result"));

    const result = await store.confirm(stored.id);

    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(store.list()).toEqual([
      stored,
    ]);
  });
});
