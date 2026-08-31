import { describe, expect, it } from "vitest";
import { createL0Event, L0_EVENT_TYPES, type L0Event } from "../l0/types.js";
import { generateDailyLogs } from "./daily-generator.js";
import { collectMemoryEntries, generateMemoryMarkdown } from "./memory-generator.js";
import { corruptEventLine, transformEvent } from "./transformer.js";

const SESSION = "session-a";

function event(
  type: L0Event["type"],
  position: number,
  payload: Record<string, unknown>,
  time = "2024-03-15T10:00:00.000Z",
): L0Event {
  return createL0Event(type, position, payload, time);
}

describe("transformer", () => {
  it("renders every L0 event type as human-readable prose without JSON dumps", () => {
    const samples: Record<L0Event["type"], Record<string, unknown>> = {
      assistant_message: {
        text: "done",
      },
      candidate_confirmed: {
        candidateId: "c1",
        kind: "global_preference",
      },
      candidate_created: {
        content: "draft",
        kind: "global_preference",
        reason: "high-impact",
      },
      candidate_rejected: {
        candidateId: "c1",
        kind: "global_preference",
        reason: "user-declined",
      },
      compaction: {
        reason: "context-limit",
      },
      file_change: {
        action: "edited",
        path: "/a/b.ts",
      },
      routing_decision: {
        bank: "default",
        kind: "session_context",
      },
      t1_memory_write: {
        content: "use pnpm",
        kind: "project_decision",
      },
      tool_call: {
        toolName: "read",
        arguments: {
          path: "/a/b",
        },
      },
      tool_result: {
        output: "contents",
        toolCallId: "t1",
      },
      user_message: {
        text: "fix the bug",
      },
    };
    for (const type of L0_EVENT_TYPES) {
      const line = transformEvent(event(type, 1, samples[type]), SESSION);
      expect(line.startsWith("- `") || line.startsWith("- `corrupt`")).toBe(true);
      expect(line).not.toContain('{"');
      expect(line).toContain(`session \`${SESSION}\` @ position 1`);
    }
  });

  it("truncates long content to keep entries single-line", () => {
    const line = transformEvent(
      event("user_message", 1, {
        text: `x`.repeat(500),
      }),
      SESSION,
    );
    expect(line.split("\n").length).toBe(1);
    expect(line).toContain("...");
  });

  it("emits a visible warning line for corrupt raw events", () => {
    expect(corruptEventLine("{oops")).toContain("unparseable L0 event");
  });
});

describe("memory generator", () => {
  it("groups memories into decisions/preferences/constraints/gotchas sections", () => {
    const doc = generateMemoryMarkdown([
      {
        sessionId: SESSION,
        events: [
          event("t1_memory_write", 1, {
            content: "pick X",
            kind: "project_decision",
          }),
          event("t1_memory_write", 2, {
            content: "prefer Y",
            kind: "global_preference",
          }),
          event("t1_memory_write", 3, {
            content: "never Z",
            kind: "project_constraint",
          }),
          event("t1_memory_write", 4, {
            content: "watch out",
            kind: "project_gotcha",
          }),
        ],
      },
    ]);
    expect(doc.markdown).toContain("## Decisions");
    expect(doc.markdown).toContain("## Preferences");
    expect(doc.markdown).toContain("## Constraints");
    expect(doc.markdown).toContain("## Gotchas");
    expect(doc.markdown.split("## ").length - 1).toBe(4);
  });

  it("keeps only the latest version of duplicate content (latest-wins)", () => {
    const entries = collectMemoryEntries([
      {
        sessionId: SESSION,
        events: [
          event("t1_memory_write", 1, {
            content: "deploy at  9am",
            kind: "project_decision",
          }),
          event("t1_memory_write", 2, {
            content: "deploy at 9am",
            kind: "project_decision",
          }),
        ],
      },
    ]);
    expect(entries.length).toBe(1);
    expect(entries[0]?.position).toBe(2);
  });

  it("renders an empty-state note when nothing was confirmed", () => {
    const doc = generateMemoryMarkdown([
      {
        events: [],
        sessionId: SESSION,
      },
    ]);
    expect(doc.markdown).toContain("No confirmed memories yet.");
  });
});

describe("daily generator", () => {
  it("creates one ISO 8601 dated log per day and marks handoffs", () => {
    const logs = generateDailyLogs([
      {
        sessionId: SESSION,
        events: [
          event(
            "user_message",
            1,
            {
              text: "morning",
            },
            "2024-03-15T09:00:00.000Z",
          ),
          event(
            "compaction",
            2,
            {
              reason: "context-limit",
            },
            "2024-03-15T09:05:00.000Z",
          ),
          event(
            "user_message",
            3,
            {
              text: "evening",
            },
            "2024-03-16T20:00:00.000Z",
          ),
        ],
      },
    ]);
    expect(logs.map((log) => log.date)).toEqual([
      "2024-03-15",
      "2024-03-16",
    ]);
    expect(logs[0]?.markdown).toContain("# 2024-03-15");
    expect(logs[0]?.markdown).toContain("Handoff:");
    expect(logs[1]?.markdown).toContain("evening");
  });

  it("produces no files for empty input", () => {
    expect(
      generateDailyLogs([
        {
          events: [],
          sessionId: SESSION,
        },
      ]),
    ).toEqual([]);
  });
});
