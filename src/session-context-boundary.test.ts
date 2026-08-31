import { describe, expect, it } from "vitest";

import { shouldAutoStore } from "./auto-store-policy.js";
import { classifyProhibitedContent } from "./content-policy.js";
import { createEvidenceRecord } from "./evidence.js";
import { describeL0Boundary } from "./l0-boundary.js";
import { routeMemoryKind } from "./routing.js";

describe("T1 session_context versus L0 trace", () => {
  const evidence = createEvidenceRecord({
    confidence: 0.8,
    provenance: "task:session-1",
    source: "current task summary",
    type: "explicit-user-statement",
  });

  it("allows only bounded current-task context for automatic storage", () => {
    expect(
      shouldAutoStore({
        contentLength: 500,
        evidence,
        kind: "session_context",
      }),
    ).toBe(true);
    expect(
      shouldAutoStore({
        contentLength: 501,
        evidence,
        kind: "session_context",
      }),
    ).toBe(false);
  });

  it("routes session context only to the current project session scope", () => {
    expect(
      routeMemoryKind("session_context", {
        dataDir: "/tmp/xpi-memo-session-context",
        projectBank: "project-p-0123456789ab",
      }),
    ).toEqual({
      bank: "project-p-0123456789ab",
      kind: "session_context",
      scope: "session",
    });
  });

  it.each([
    "event_type: tool_result\nraw L0 event",
    "role: user\nhello\nrole: assistant\nworld",
    "Tool output:\nraw stdout",
  ])("rejects raw session material as T1 session context: %s", (content) => {
    expect(
      classifyProhibitedContent({
        content,
      }),
    ).not.toBeNull();
  });

  it("keeps the L0 trace contract separate from T1 session context", () => {
    const boundary = describeL0Boundary();

    expect(boundary.ownsRawEvents).toBe(true);
    expect(boundary.persistsRawEventsInT1).toBe(false);
    expect(boundary.selectableAsMemoryEngine).toBe(false);
  });
});
