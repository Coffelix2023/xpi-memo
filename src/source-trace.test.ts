import { describe, expect, it } from "vitest";

import { createL0Event } from "./l0/types.js";
import type { PendingCandidate } from "./pending-candidate.js";
import {
  formatSourceTrace,
  provenanceOf,
  traceCandidate,
  traceMemoryEvent,
} from "./source-trace.js";

const SESSION = "2026-09-02T10-00-00-000Z-abcd1234";

function memoryEvent(position: number, payload: Record<string, unknown> = {}) {
  return createL0Event(
    "t1_memory_write",
    position,
    {
      bank: "project-p-aaa",
      kind: "project_decision",
      ...payload,
    },
    "2026-09-02T10:00:00.000Z",
  );
}

function candidateEvent(
  position: number,
  candidateId: string,
  payload: Record<string, unknown> = {},
) {
  return createL0Event(
    "candidate_created",
    position,
    {
      bank: "project-p-aaa",
      candidateId,
      kind: "project_constraint",
      ...payload,
    },
    "2026-09-02T10:05:00.000Z",
  );
}

const candidate: PendingCandidate = {
  conflictState: "none",
  content: "must never run database migrations without a backup",
  createdAt: "2026-09-02T10:05:00.000Z",
  evidenceSummary:
    "explicit-user-statement from user-conversation (pi:xpi_memo_remember)",
  id: "candidate-1",
  kind: "project_constraint",
  rationale: "durable project rule",
  reason: "project-decision",
  status: "pending",
  targetBank: "project-p-aaa",
  targetScope: "session",
  evidence: {
    confidence: 0.9,
    provenance: "pi:xpi_memo_remember",
    source: "user-conversation",
    timestamp: "2026-09-02T10:05:00.000Z",
    type: "explicit-user-statement",
  },
};

describe("provenanceOf", () => {
  it("extracts only the bounded provenance reference fields", () => {
    expect(
      provenanceOf({
        content: "must not leak",
        source: "input:user",
        sourceEventPosition: 42,
        sourceSessionId: SESSION,
      }),
    ).toEqual({
      source: "input:user",
      sourceEventPosition: 42,
      sourceSessionId: SESSION,
    });
  });

  it("omits absent provenance fields", () => {
    expect(provenanceOf({})).toEqual({});
    expect(
      provenanceOf({
        source: "",
      }),
    ).toEqual({});
  });
});

describe("traceMemoryEvent", () => {
  it("traces a stored memory to its confirming event with taxonomy labels", () => {
    const events = [
      memoryEvent(3, {
        source: "input:user",
        sourceEventPosition: 2,
        sourceSessionId: SESSION,
      }),
    ];
    const trace = traceMemoryEvent(events, SESSION, 3);

    expect(trace).toMatchObject({
      bank: "project-p-aaa",
      eventType: "t1_memory_write",
      kind: "project_decision",
      label: "Decision",
      position: 3,
      scope: "project",
      sessionId: SESSION,
      target: "memory",
      trustState: "Review required",
      provenance: {
        source: "input:user",
        sourceEventPosition: 2,
        sourceSessionId: SESSION,
      },
    });
  });

  it("returns null when the position has no event", () => {
    expect(
      traceMemoryEvent(
        [
          memoryEvent(1),
        ],
        SESSION,
        99,
      ),
    ).toBeNull();
    expect(traceMemoryEvent([], SESSION, 1)).toBeNull();
  });
});

describe("traceCandidate", () => {
  it("traces a pending candidate with review state and provenance reference", () => {
    const trace = traceCandidate(
      [
        candidate,
      ],
      [
        candidateEvent(7, candidate.id, {
          source: "tool_call",
          sourceEventPosition: 6,
          sourceSessionId: SESSION,
        }),
      ],
      candidate.id,
    );

    expect(trace).toMatchObject({
      bank: "project-p-aaa",
      candidateId: "candidate-1",
      kind: "project_constraint",
      label: "Constraint",
      reviewState: "pending",
      scope: "project",
      target: "candidate",
      trustState: "Review required",
      provenance: {
        source: "tool_call",
        sourceEventPosition: 6,
        sourceSessionId: SESSION,
      },
    });
  });

  it("reports review state with empty provenance when no L0 event exists", () => {
    const trace = traceCandidate(
      [
        candidate,
      ],
      [],
      candidate.id,
    );
    expect(trace).toMatchObject({
      candidateId: "candidate-1",
      provenance: {},
      reviewState: "pending",
      target: "candidate",
    });
  });

  it("returns null for an unknown candidate id", () => {
    expect(
      traceCandidate(
        [
          candidate,
        ],
        [],
        "nope",
      ),
    ).toBeNull();
  });
});

describe("formatSourceTrace", () => {
  it("renders a bounded body-free memory trace", () => {
    const memoryTrace = traceMemoryEvent(
      [
        memoryEvent(3, {
          source: "input:user",
        }),
      ],
      SESSION,
      3,
    );
    if (!memoryTrace) throw new Error("expected memory trace");
    const rendered = formatSourceTrace(memoryTrace);
    expect(rendered).toContain("target: memory");
    expect(rendered).toContain("session:");
    expect(rendered).toContain("position: 3");
    // Body-free: candidate/memory content must not appear.
    expect(rendered).not.toContain("content");
    expect(rendered).not.toContain("must not");
  });

  it("renders candidate review state and a source event reference", () => {
    const trace = traceCandidate(
      [
        candidate,
      ],
      [
        candidateEvent(7, candidate.id, {
          source: "tool_call",
          sourceEventPosition: 6,
          sourceSessionId: SESSION,
        }),
      ],
      candidate.id,
    );
    if (!trace) throw new Error("expected candidate trace");
    const rendered = formatSourceTrace(trace);

    expect(rendered).toContain("target: candidate");
    expect(rendered).toContain("review state: pending");
    expect(rendered).toContain(`source event: session ${SESSION} @ position 6`);
    // Candidate body stays out of the trace.
    expect(rendered).not.toContain(candidate.content);
  });

  it("reports unavailable source instead of guessing when provenance is missing", () => {
    const memoryTrace = traceMemoryEvent(
      [
        memoryEvent(1),
      ],
      SESSION,
      1,
    );
    if (!memoryTrace) throw new Error("expected memory trace");
    const rendered = formatSourceTrace(memoryTrace);
    expect(rendered).toContain("source event: unavailable");
  });
});
