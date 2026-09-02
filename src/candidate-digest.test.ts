import { describe, expect, it } from "vitest";

import {
  buildCandidateDigest,
  oldestPendingAgeMinutes,
  REVIEW_SURFACE_HINT,
  renderCandidateDigest,
} from "./candidate-digest.js";
import type { PendingCandidate } from "./pending-candidate.js";

function candidate(
  kind: PendingCandidate["kind"],
  createdAt: string,
  content = `body-for-${kind}`,
): PendingCandidate {
  return {
    conflictState: "none",
    content,
    createdAt,
    evidenceSummary: "l0-conclusion from event-1",
    id: `candidate-${kind}-${createdAt}`,
    evidence: {
      confidence: 0.8,
      provenance: "activation:offline-extraction",
      source: "event-1",
      timestamp: createdAt,
      type: "l0-conclusion",
    },
    kind,
    rationale: "requires governance",
    reason: "high-impact-durable",
    status: "pending",
    targetBank: "default",
    targetScope: "global",
  };
}

describe("candidate digest (task 4.1)", () => {
  it("builds a bounded digest with pending count, categories, and oldest age", () => {
    const digest = buildCandidateDigest([
      candidate("global_preference", "2026-09-02T08:00:00.000Z"),
      candidate("project_decision", "2026-09-02T09:00:00.000Z"),
      candidate("project_decision", "2026-09-02T10:00:00.000Z"),
      candidate("global_workflow", "2026-09-02T11:00:00.000Z"),
    ]);

    expect(digest.pending).toBe(4);
    expect(digest.categories).toEqual({
      global_preference: 1,
      global_workflow: 1,
      project_decision: 2,
    });
    expect(digest.oldestPendingCreatedAt).toBe("2026-09-02T08:00:00.000Z");
    expect(digest.reviewSurface).toBe(REVIEW_SURFACE_HINT);
  });

  it("returns an empty digest for no pending candidates", () => {
    const digest = buildCandidateDigest([]);
    expect(digest.pending).toBe(0);
    expect(digest.categories).toEqual({});
    expect(digest.oldestPendingCreatedAt).toBeNull();
  });

  it("computes the oldest pending age in minutes", () => {
    const digest = buildCandidateDigest([
      candidate("global_preference", "2026-09-02T08:00:00.000Z"),
    ]);
    const age = oldestPendingAgeMinutes(digest, new Date("2026-09-02T08:30:00.000Z"));
    expect(age).toBe(30);
  });

  it("returns null age when no pending candidate exists", () => {
    const digest = buildCandidateDigest([]);
    expect(oldestPendingAgeMinutes(digest)).toBeNull();
  });

  it("renders a one-line summary without candidate body text", () => {
    const digest = buildCandidateDigest([
      candidate(
        "global_preference",
        "2026-09-02T08:00:00.000Z",
        "secret-preference-body",
      ),
      candidate("project_decision", "2026-09-02T09:00:00.000Z", "secret-decision-body"),
    ]);
    const line = renderCandidateDigest(digest);

    expect(line).toContain("2 pending memory reviews");
    expect(line).toContain("oldest");
    expect(line).toContain(REVIEW_SURFACE_HINT);
    expect(line).not.toContain("secret-preference-body");
    expect(line).not.toContain("secret-decision-body");
  });
});
