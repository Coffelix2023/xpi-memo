import { describe, expect, it } from "vitest";
import { describeMemoryKind, MEMORY_KINDS, type MemoryKind } from "../kinds.js";
import { createL0Event, L0_EVENT_TYPES, type L0Event } from "../l0/types.js";
import type { BankMemoryRow } from "./bank-state.js";
import { generateDailyLogs } from "./daily-generator.js";
import {
  collectMemoryAnnotations,
  generateMemoryMarkdown,
  type MemorySource,
  projectMemoryEntries,
  UNCLASSIFIED_KIND,
} from "./memory-generator.js";
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

interface RowSpec {
  content: string;
  id: string;
  /** Omit to model a bank row with no L0 provenance. */
  kind?: MemoryKind;
  position?: number;
  sessionId?: string;
  timestamp?: string;
}

/**
 * Build the projection's two inputs from one spec list: the bank's current
 * rows, plus the L0 events that annotate the rows which have provenance.
 */
function memoryInput(specs: RowSpec[]): {
  rows: BankMemoryRow[];
  sources: MemorySource[];
} {
  const rows: BankMemoryRow[] = [];
  const events: L0Event[] = [];
  for (const spec of specs) {
    rows.push({
      bank: "default",
      content: spec.content,
      id: spec.id,
      ...(spec.timestamp
        ? {
            timestamp: spec.timestamp,
          }
        : {}),
    });
    if (!spec.kind) continue;
    events.push(
      event(
        "t1_memory_write",
        spec.position ?? events.length + 1,
        {
          content: spec.content,
          kind: spec.kind,
          memoryId: spec.id,
        },
        spec.timestamp,
      ),
    );
  }
  return {
    rows,
    sources: [
      {
        events,
        sessionId: SESSION,
      },
    ],
  };
}

describe("transformer", () => {
  it("renders every L0 event type as human-readable prose without JSON dumps", () => {
    const samples: Record<L0Event["type"], Record<string, unknown>> = {
      assistant_message: {
        text: "done",
      },
      candidate_auto_verified: {
        candidateId: "c1",
        filePath: "AGENTS.md",
        kind: "project_gene",
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
      memory_delete_requested: {
        memoryId: "memory-1",
        operationId: "operation-1",
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
      tool_verification_failed: {
        candidateId: "c1",
        kind: "project_gene",
        reason: "no-match",
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
    const input = memoryInput([
      {
        content: "pick X",
        id: "row-1",
        kind: "project_decision",
        position: 1,
      },
      {
        content: "prefer Y",
        id: "row-2",
        kind: "global_preference",
        position: 2,
      },
      {
        content: "never Z",
        id: "row-3",
        kind: "project_constraint",
        position: 3,
      },
      {
        content: "watch out",
        id: "row-4",
        kind: "project_gotcha",
        position: 4,
      },
    ]);
    const doc = generateMemoryMarkdown(input.rows, input.sources);
    expect(doc.markdown).toContain("## Decisions");
    expect(doc.markdown).toContain("## Preferences");
    expect(doc.markdown).toContain("## Constraints");
    expect(doc.markdown).toContain("## Gotchas");
    expect(doc.markdown.split("## ").length - 1).toBe(4);
  });

  it("renders one canonical section for every supported kind", () => {
    const input = memoryInput(
      MEMORY_KINDS.map((kind, position) => ({
        content: `memory-${kind}`,
        id: `row-${kind}`,
        kind,
        position: position + 1,
      })),
    );
    const doc = generateMemoryMarkdown(input.rows, input.sources);
    for (const kind of MEMORY_KINDS) {
      expect(doc.markdown).toContain(`## ${describeMemoryKind(kind).sectionTitle}`);
    }
    expect(doc.markdown).not.toContain("## Other");
  });

  it("groups every supported kind under its own canonical section, never Other", () => {
    const input = memoryInput(
      MEMORY_KINDS.map((kind, position) => ({
        content: `memory-${kind}`,
        id: `row-${kind}`,
        kind,
        position: position + 1,
      })),
    );
    const doc = generateMemoryMarkdown(input.rows, input.sources);
    const sectionTitles = MEMORY_KINDS.map(
      (kind) => describeMemoryKind(kind).sectionTitle,
    );
    // One section per kind, in canonical order, each with exactly one entry.
    expect(doc.sections.map((section) => section.title)).toEqual(sectionTitles);
    expect(doc.markdown.split("\n## ").length - 1).toBe(MEMORY_KINDS.length);
    expect(doc.markdown).not.toContain("## Other");
  });

  it("annotates every entry with its canonical scope (task 2.4)", () => {
    const input = memoryInput([
      {
        content: "pick X",
        id: "row-1",
        kind: "project_decision",
        position: 1,
      },
      {
        content: "prefer Y",
        id: "row-2",
        kind: "global_preference",
        position: 2,
      },
      {
        content: "session note",
        id: "row-3",
        kind: "session_context",
        position: 3,
      },
    ]);
    const doc = generateMemoryMarkdown(input.rows, input.sources);
    expect(doc.markdown).toContain("scope `project`");
    expect(doc.markdown).toContain("scope `global`");
    expect(doc.markdown).toContain("scope `session`");
  });
  it("marks exact duplicate content with supersededBy instead of dropping it", () => {
    const input = memoryInput([
      {
        content: "deploy at  9am",
        id: "row-a",
        kind: "project_decision",
        position: 1,
      },
      {
        content: "deploy at 9am",
        id: "row-b",
        kind: "project_decision",
        position: 2,
      },
    ]);
    const entries = projectMemoryEntries(
      input.rows,
      collectMemoryAnnotations(input.sources),
    );
    expect(entries.length).toBe(2);
    const doc = generateMemoryMarkdown(input.rows, input.sources);
    expect(doc.markdown).toContain("deploy at  9am");
    expect(doc.markdown).toContain("deploy at 9am");
    expect(doc.markdown).toContain("supersededBy `");
  });

  it("projects only rows the bank still holds, without needing a deletion event", () => {
    const rows: BankMemoryRow[] = [
      {
        bank: "default",
        content: "keep this memory",
        id: "memory-keep",
      },
    ];
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
    expect(
      projectMemoryEntries(rows, collectMemoryAnnotations(sources)).map(
        ({ content }) => content,
      ),
    ).toEqual([
      "keep this memory",
    ]);
  });

  it("keeps bank rows without L0 provenance and marks them source missing without guessing", () => {
    const rows: BankMemoryRow[] = [
      {
        bank: "default",
        content: "legacy memory",
        id: "legacy-row",
        timestamp: "2024-03-15T10:00:00.000Z",
      },
    ];
    const sources = [
      {
        sessionId: SESSION,
        events: [
          event("memory_deleted", 2, {
            memoryId: "unrelated-id",
          }),
        ],
      },
    ];
    const entries = projectMemoryEntries(rows, collectMemoryAnnotations(sources));
    expect(entries.map(({ content }) => content)).toEqual([
      "legacy memory",
    ]);
    expect(entries[0]?.kind).toBe(UNCLASSIFIED_KIND);
    const doc = generateMemoryMarkdown(rows, sources);
    expect(doc.markdown).toContain("## Unclassified");
    expect(doc.markdown).toContain("source `missing`");
    // No fabricated provenance: no session reference for an unannotated row.
    expect(doc.markdown).not.toContain("session `");
  });

  it("ignores annotations whose bank row no longer exists", () => {
    const rows: BankMemoryRow[] = [
      {
        bank: "default",
        content: "still here",
        id: "row-keep",
      },
    ];
    const sources = [
      {
        sessionId: SESSION,
        events: [
          event("t1_memory_write", 1, {
            content: "still here",
            kind: "global_preference",
            memoryId: "row-keep",
          }),
          event("t1_memory_write", 2, {
            content: "gone from the bank",
            kind: "global_preference",
            memoryId: "row-gone",
          }),
        ],
      },
    ];
    const entries = projectMemoryEntries(rows, collectMemoryAnnotations(sources));
    expect(entries.map(({ content }) => content)).toEqual([
      "still here",
    ]);
    expect(entries[0]?.sessionId).toBe(SESSION);
  });

  it("orders annotated rows by L0 position and unannotated rows last by memory id", () => {
    const rows: BankMemoryRow[] = [
      {
        bank: "default",
        content: "unannotated Z",
        id: "row-z",
      },
      {
        bank: "default",
        content: "second write",
        id: "row-2",
      },
      {
        bank: "default",
        content: "unannotated A",
        id: "row-a",
      },
      {
        bank: "default",
        content: "first write",
        id: "row-1",
      },
    ];
    const sources = [
      {
        sessionId: SESSION,
        events: [
          event("t1_memory_write", 1, {
            content: "first write",
            kind: "project_decision",
            memoryId: "row-1",
          }),
          event("t1_memory_write", 2, {
            content: "second write",
            kind: "project_decision",
            memoryId: "row-2",
          }),
        ],
      },
    ];
    const ordered = projectMemoryEntries(rows, collectMemoryAnnotations(sources)).map(
      ({ content }) => content,
    );
    expect(ordered).toEqual([
      "first write",
      "second write",
      "unannotated A",
      "unannotated Z",
    ]);
  });

  it("produces byte-identical output for identical state and annotations", () => {
    const rows: BankMemoryRow[] = [
      {
        bank: "default",
        content: "second write",
        id: "row-2",
      },
      {
        bank: "default",
        content: "unannotated",
        id: "row-x",
      },
      {
        bank: "default",
        content: "first write",
        id: "row-1",
      },
    ];
    const sources = [
      {
        sessionId: SESSION,
        events: [
          event("t1_memory_write", 2, {
            content: "second write",
            kind: "project_decision",
            memoryId: "row-2",
          }),
          event("t1_memory_write", 1, {
            content: "first write",
            kind: "project_decision",
            memoryId: "row-1",
          }),
        ],
      },
    ];
    const shuffled = [
      ...rows,
    ].reverse();
    const first = generateMemoryMarkdown(rows, sources).markdown;
    expect(generateMemoryMarkdown(rows, sources).markdown).toBe(first);
    expect(generateMemoryMarkdown(shuffled, sources).markdown).toBe(first);
  });

  it("renders an empty-state note when nothing was confirmed", () => {
    const doc = generateMemoryMarkdown([], []);
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
