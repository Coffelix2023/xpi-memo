import { describe, expect, it } from "vitest";
import { describeMemoryKind, MEMORY_KINDS } from "../kinds.js";
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
      memory_deleted: {
        memoryId: "memory-1",
      },
      memory_failed: {
        kind: "project_decision",
        phase: "backend",
        reason: "backend-degraded",
      },
      memory_injected: {
        injectedMemoryIds: [],
      },
      routing_decision: {
        bank: "default",
        kind: "session_context",
      },
      routing_rejected: {
        kind: "project_decision",
        reason: "project-identity-required",
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

  it("renders one canonical section for every supported kind", () => {
    const doc = generateMemoryMarkdown([
      {
        events: MEMORY_KINDS.map((kind, position) =>
          event("t1_memory_write", position + 1, {
            content: `memory-${kind}`,
            kind,
          }),
        ),
        sessionId: SESSION,
      },
    ]);
    for (const kind of MEMORY_KINDS) {
      expect(doc.markdown).toContain(`## ${describeMemoryKind(kind).sectionTitle}`);
    }
    expect(doc.markdown).not.toContain("## Other");
  });

  it("groups every supported kind under its own canonical section, never Other", () => {
    const doc = generateMemoryMarkdown([
      {
        events: MEMORY_KINDS.map((kind, position) =>
          event("t1_memory_write", position + 1, {
            content: `memory-${kind}`,
            kind,
          }),
        ),
        sessionId: SESSION,
      },
    ]);
    const sectionTitles = MEMORY_KINDS.map(
      (kind) => describeMemoryKind(kind).sectionTitle,
    );
    // One section per kind, in canonical order, each with exactly one entry.
    expect(doc.sections.map((section) => section.title)).toEqual(sectionTitles);
    expect(doc.markdown.split("\n## ").length - 1).toBe(MEMORY_KINDS.length);
    expect(doc.markdown).not.toContain("## Other");
  });

  it("annotates every entry with its canonical scope (task 2.4)", () => {
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
            content: "session note",
            kind: "session_context",
          }),
        ],
      },
    ]);
    expect(doc.markdown).toContain("scope `project`");
    expect(doc.markdown).toContain("scope `global`");
    expect(doc.markdown).toContain("scope `session`");
  });
  it("marks exact duplicate content with supersededBy instead of dropping it", () => {
    const sources = [
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
    ];
    const entries = collectMemoryEntries(sources);
    expect(entries.length).toBe(2);
    const doc = generateMemoryMarkdown(sources);
    expect(doc.markdown).toContain("deploy at  9am");
    expect(doc.markdown).toContain("deploy at 9am");
    expect(doc.markdown).toContain("supersededBy `");
  });

  it("excludes entries whose backend memory id was deleted", () => {
    const sources = [
      {
        sessionId: SESSION,
        events: [
          event("t1_memory_write", 1, {
            content: "keep this memory",
            kind: "global_preference",
            memoryId: "memory-keep",
          }),
          event("t1_memory_write", 2, {
            content: "remove this memory",
            kind: "global_preference",
            memoryId: "memory-delete",
          }),
          event("memory_deleted", 3, {
            memoryId: "memory-delete",
          }),
        ],
      },
    ];
    expect(collectMemoryEntries(sources).map(({ content }) => content)).toEqual([
      "keep this memory",
    ]);
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
