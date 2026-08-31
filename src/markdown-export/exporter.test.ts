import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createEventLogWriter } from "../l0/event-log-writer.js";
import { sessionDirFor } from "../l0/session-manager.js";
import { createL0Event, type L0Event, type L0EventType } from "../l0/types.js";
import { exportMarkdown, markdownDirFor, validateExport } from "./exporter.js";

let dataDir: string;
const TODAY = new Date().toISOString().slice(0, 10);
const SESSION_ID = "2024-03-15T10-00-00-00000000-abcd";

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "xpi-memo-export-"));
});

/** Append one raw event line with a deterministic timestamp into a session log. */
function writeRawEvent(sessionId: string, event: L0Event): void {
  const dir = sessionDirFor(dataDir, sessionId);
  mkdirSync(dir, {
    recursive: true,
  });
  appendFileSync(join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`);
}

function writeEvents(
  events: Array<{
    type: L0EventType;
    payload: Record<string, unknown>;
  }>,
): void {
  const writer = createEventLogWriter({
    sessionDir: sessionDirFor(dataDir, SESSION_ID),
  });
  for (const event of events) writer.append(event.type, event.payload);
}

function readDaily(date = TODAY): string {
  return readFileSync(join(markdownDirFor(dataDir), "daily", `${date}.md`), "utf8");
}

describe("markdown export", () => {
  it("exports events to daily log and MEMORY.md with source traceability", async () => {
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "user_message",
        1,
        {
          text: "hello world",
        },
        "2024-03-15T08:00:00.000Z",
      ),
    );
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "t1_memory_write",
        2,
        {
          content: "Use pnpm workspaces",
          kind: "project_decision",
        },
        "2024-03-15T08:01:00.000Z",
      ),
    );
    const result = await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    expect(result.sessions[0]?.exportedEvents).toBe(2);
    expect(result.memoryMd).toBe(true);

    const daily = readDaily("2024-03-15");
    expect(daily).toContain("User: hello world");
    expect(daily).toContain("Memory stored");
    expect(daily).toContain(`session \`${SESSION_ID}\` @ position 1`);

    const memory = readFileSync(join(markdownDirFor(dataDir), "MEMORY.md"), "utf8");
    expect(memory).toContain("## Decisions");
    expect(memory).toContain("Use pnpm workspaces");
  });

  it("uses ISO 8601 date filenames from event timestamps", async () => {
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "user_message",
        1,
        {
          text: "hi",
        },
        "2024-03-15T08:30:00.000Z",
      ),
    );
    await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    expect(readDaily("2024-03-15")).toContain("hi");
  });

  it("merges multiple sessions into one daily file with session boundaries", async () => {
    const idA = "2024-03-15T10-00-00-00000000-aaaa";
    const idB = "2024-03-15T11-00-00-00000000-bbbb";
    writeRawEvent(
      idA,
      createL0Event(
        "user_message",
        1,
        {
          text: "from A",
        },
        "2024-03-15T10:00:00.000Z",
      ),
    );
    writeRawEvent(
      idB,
      createL0Event(
        "user_message",
        1,
        {
          text: "from B",
        },
        "2024-03-15T11:00:00.000Z",
      ),
    );
    await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    const daily = readDaily("2024-03-15");
    expect(daily).toContain("from A");
    expect(daily).toContain("from B");
    expect(daily).toContain(`## Session \`${idA}\``);
    expect(daily).toContain(`## Session \`${idB}\``);
  });

  it("is incremental: second export processes no events and does not duplicate entries", async () => {
    writeEvents([
      {
        type: "user_message",
        payload: {
          text: "first run",
        },
      },
    ]);
    const first = await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    expect(first.sessions[0]?.exportedEvents).toBe(1);
    const second = await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    expect(second.sessions[0]?.exportedEvents).toBe(0);
    expect(readDaily().split("first run").length - 1).toBe(1);
  });

  it("validation reports missing exports, then passes after export", async () => {
    writeEvents([
      {
        type: "user_message",
        payload: {
          text: "not exported yet",
        },
      },
    ]);
    const before = await validateExport(dataDir);
    expect(before.ok).toBe(false);
    expect(before.missing).toBe(1);
    await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    expect((await validateExport(dataDir)).ok).toBe(true);
  });

  it("marks handoff entries with Handoff: prefix and session id", async () => {
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "compaction",
        1,
        {
          reason: "context-limit",
          summary: "session context compacted",
        },
        "2024-03-15T09:00:00.000Z",
      ),
    );
    await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    const daily = readDaily("2024-03-15");
    expect(daily).toContain("Handoff:");
    expect(daily).toContain(`session \`${SESSION_ID}\``);
  });

  it("skips corrupt lines with a visible warning and continues", async () => {
    const dir = sessionDirFor(dataDir, SESSION_ID);
    mkdirSync(dir, {
      recursive: true,
    });
    writeFileSync(
      join(dir, "events.jsonl"),
      `${JSON.stringify(
        createL0Event(
          "user_message",
          1,
          {
            text: "ok",
          },
          "2024-03-15T10:00:00.000Z",
        ),
      )}\n{not json}\n`,
    );
    const result = await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    expect(result.warnings.join("\n")).toContain("corrupt event line");
    expect(readDaily("2024-03-15")).toContain("unparseable L0 event");
  });

  it("respects excludeToolResults config: tool_result entries are omitted", async () => {
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "tool_result",
        1,
        {
          output: "big output",
          toolCallId: "t1",
        },
        "2024-03-15T08:00:00.000Z",
      ),
    );
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "user_message",
        2,
        {
          text: "keep me",
        },
        "2024-03-15T08:01:00.000Z",
      ),
    );
    const result = await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_EXCLUDE_TOOL_RESULTS: "true",
      },
    });
    const daily = readDaily("2024-03-15");
    expect(daily).not.toContain("Tool t1");
    expect(daily).toContain("keep me");
    expect(result.sessions[0]?.exportedEvents).toBe(2);
  });

  it("redacts sensitive content when privacy config is enabled", async () => {
    writeRawEvent(
      SESSION_ID,
      createL0Event(
        "user_message",
        1,
        {
          text: "key is sk-abcdef1234567890 ok",
        },
        "2024-03-15T08:00:00.000Z",
      ),
    );
    await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
        XPI_MEMO_PRIVACY: "true",
      },
    });
    const daily = readDaily("2024-03-15");
    expect(daily).toContain("[REDACTED]");
    expect(daily).not.toContain("sk-abcdef1234567890");
  });

  it("dedupes duplicate memory content keeping only the latest version", async () => {
    const writer = createEventLogWriter({
      sessionDir: sessionDirFor(dataDir, SESSION_ID),
    });
    writer.append("t1_memory_write", {
      content: "Deploy at 9am",
      kind: "project_decision",
    });
    writer.append("t1_memory_write", {
      content: "Deploy at 10am",
      kind: "project_decision",
    });
    writer.append("t1_memory_write", {
      content: "Deploy at  9am",
      kind: "project_decision",
    });
    await exportMarkdown({
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    const memory = readFileSync(join(markdownDirFor(dataDir), "MEMORY.md"), "utf8");
    expect(memory).toContain("Deploy at 10am");
    expect(memory).not.toContain("Deploy at 9am");
    expect((memory.match(/Deploy at/g) ?? []).length).toBe(2);
  });

  it("exports a single session when sessionId is provided", async () => {
    const idA = "2024-03-15T10-00-00-00000000-aaaa";
    const idB = "2024-03-15T11-00-00-00000000-bbbb";
    writeRawEvent(
      idA,
      createL0Event(
        "user_message",
        1,
        {
          text: "only A",
        },
        "2024-03-15T10:00:00.000Z",
      ),
    );
    writeRawEvent(
      idB,
      createL0Event(
        "user_message",
        1,
        {
          text: "only B",
        },
        "2024-03-15T11:00:00.000Z",
      ),
    );
    await exportMarkdown({
      sessionId: idA,
      env: {
        XPI_MEMO_DATA_DIR: dataDir,
      },
    });
    const daily = readDaily("2024-03-15");
    expect(daily).toContain("only A");
    expect(daily).not.toContain("only B");
  });
});
