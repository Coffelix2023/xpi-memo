import { describe, expect, it } from "vitest";
import type { AuditEntry } from "./audit.js";
import {
  buildObservabilitySnapshot,
  serializeObservabilitySnapshot,
} from "./observability.js";

function entry(
  action: AuditEntry["action"],
  metadata: AuditEntry["metadata"] = {},
): AuditEntry {
  return {
    action,
    metadata,
    timestamp: "2026-09-02T10:00:00.000Z",
  };
}

describe("provenance-safe observability snapshot", () => {
  it("counts capture, candidate, storage, recall, injection, and rejection outcomes", () => {
    const snapshot = buildObservabilitySnapshot(
      [
        entry("candidate"),
        entry("write"),
        entry("confirmation"),
        entry("recall"),
        entry("rejection"),
        entry("fallback"),
      ],
      {
        injection: 3.8,
      },
    );

    expect(snapshot).toEqual({
      taxonomyCounts: {},
      version: 1,
      activation: {
        candidate: 1,
        extraction: 0,
        fallback: 1,
        recall: 1,
        recalledHits: 0,
        rejection: 1,
        storage: 2,
      },
      counts: {
        candidate: 1,
        capture: 3,
        injection: 3,
        recall: 1,
        rejection: 1,
        storage: 2,
      },
      recent: [
        {
          action: "write",
          timestamp: "2026-09-02T10:00:00.000Z",
        },
        {
          action: "confirmation",
          timestamp: "2026-09-02T10:00:00.000Z",
        },
        {
          action: "recall",
          timestamp: "2026-09-02T10:00:00.000Z",
        },
        {
          action: "rejection",
          timestamp: "2026-09-02T10:00:00.000Z",
        },
        {
          action: "fallback",
          timestamp: "2026-09-02T10:00:00.000Z",
        },
      ],
    });
  });

  it("keeps only bounded metadata and excludes bodies, queries, reasons, and secrets", () => {
    const body = "remember this private memory body";
    const secret = "api_key=must-not-appear";
    const snapshot = buildObservabilitySnapshot([
      entry("rejection", {
        bank: `\n${"b".repeat(200)}`,
        content: body,
        kind: "project_decision",
        query: "secret query must-not-appear",
        rawPayload: secret,
        reason: body,
        scope: "global",
        status: "rejected",
        token: secret,
      } as AuditEntry["metadata"] & Record<string, unknown>),
    ]);
    const serialized = serializeObservabilitySnapshot(snapshot);

    expect(snapshot.recent).toEqual([
      {
        action: "rejection",
        bank: "b".repeat(80),
        kind: "project_decision",
        scope: "global",
        status: "rejected",
        timestamp: "2026-09-02T10:00:00.000Z",
      },
    ]);
    expect(serialized).not.toContain(body);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("secret query");
    expect(serialized).not.toContain("reason");
  });

  it("keeps the recent metadata window bounded", () => {
    const snapshot = buildObservabilitySnapshot(
      Array.from(
        {
          length: 7,
        },
        (_, index) =>
          entry("recall", {
            bank: `bank-${index}`,
          }),
      ),
    );

    expect(snapshot.recent).toHaveLength(5);
    expect(snapshot.recent[0]?.bank).toBe("bank-2");
    expect(snapshot.recent.at(-1)?.bank).toBe("bank-6");
  });
  it("derives body-free taxonomy counts and activation metrics (task 6.1)", () => {
    const snapshot = buildObservabilitySnapshot([
      entry("write", {
        kind: "global_preference",
      }),
      entry("write", {
        kind: "global_preference",
      }),
      entry("confirmation", {
        kind: "project_decision",
      }),
      entry("candidate", {
        kind: "project_constraint",
      }),
      entry("recall", {
        resultCount: 4,
      }),
      entry("recall", {
        resultCount: 0,
      }),
      entry("rejection", {
        kind: "project_gene",
      }),
      entry("fallback"),
      entry("extraction"),
    ]);

    expect(snapshot.taxonomyCounts).toEqual({
      global_preference: 2,
      project_decision: 1,
    });
    expect(snapshot.activation).toEqual({
      candidate: 1,
      extraction: 1,
      fallback: 1,
      recall: 2,
      recalledHits: 4,
      rejection: 1,
      storage: 3,
    });
    expect(snapshot.counts.storage).toBe(3);
    expect(snapshot.counts.recall).toBe(2);
    // Body-free: no kind name leaks into a body-like field, no content anywhere.
    expect(JSON.stringify(snapshot)).not.toContain("content");
    expect(JSON.stringify(snapshot)).not.toContain("reason");
  });

  it("reflects Store / Later / Reject outcomes in the counts without a second queue", () => {
    // Store: candidate created then confirmed → storage count rises,
    // the candidate record leaves the pending queue (no duplicate count).
    const stored = buildObservabilitySnapshot([
      entry("candidate", {
        kind: "project_decision",
        status: "stored",
      }),
      entry("confirmation", {
        kind: "project_decision",
        status: "stored",
      }),
    ]);
    expect(stored.counts).toMatchObject({
      candidate: 1,
      storage: 1,
    });

    // Reject: candidate created then rejected → rejection count rises.
    const rejected = buildObservabilitySnapshot([
      entry("candidate", {
        kind: "global_preference",
      }),
      entry("rejection", {
        kind: "global_preference",
        reason: "user-rejected-candidate",
        status: "rejected",
      }),
    ]);
    expect(rejected.counts).toMatchObject({
      candidate: 1,
      rejection: 1,
      storage: 0,
    });

    // Later: candidate stays pending → only the candidate count rises,
    // no storage or rejection side effect.
    const later = buildObservabilitySnapshot([
      entry("candidate", {
        kind: "global_workflow",
      }),
    ]);
    expect(later.counts).toMatchObject({
      candidate: 1,
      rejection: 0,
      storage: 0,
    });
  });
});
