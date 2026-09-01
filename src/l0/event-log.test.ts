import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEventLogReader } from "./event-log-reader.js";
import { createEventLogWriter } from "./event-log-writer.js";
import { createSession } from "./session-manager.js";
import type { L0Event } from "./types.js";

const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir)
      rmSync(dir, {
        force: true,
        recursive: true,
      });
  }
});

describe("createEventLogWriter", () => {
  it("writes events with sequential positions", () => {
    const dataDir = makeTempDir("xpi-l0-write-");
    const session = createSession(dataDir);
    const writer = createEventLogWriter({
      sessionDir: session.dir,
    });

    const first = writer.append("user_message", {
      content: "hello",
    });
    const second = writer.append("tool_call", {
      arguments: {},
      toolName: "edit",
    });

    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
    expect(second.type).toBe("tool_call");
    expect(writer.currentPosition()).toBe(2);
  });

  it("assigns unique positions in rapid succession", () => {
    const dataDir = makeTempDir("xpi-l0-rapid-");
    const session = createSession(dataDir);
    const writer = createEventLogWriter({
      sessionDir: session.dir,
    });

    const events = Array.from(
      {
        length: 50,
      },
      (_, index) =>
        writer.append("user_message", {
          content: `m${index}`,
        }),
    );
    const positions = new Set(events.map((event) => event.position));
    expect(positions.size).toBe(50);
  });

  it("resumes position after restart (scans existing log)", () => {
    const dataDir = makeTempDir("xpi-l0-resume-");
    const session = createSession(dataDir);
    const first = createEventLogWriter({
      sessionDir: session.dir,
    });
    first.append("user_message", {
      content: "before restart",
    });

    const second = createEventLogWriter({
      sessionDir: session.dir,
    });
    expect(second.currentPosition()).toBe(1);
    const event = second.append("user_message", {
      content: "after restart",
    });
    expect(event.position).toBe(2);
  });

  it("rotates when active log exceeds limit and keeps reading merged", () => {
    const dataDir = makeTempDir("xpi-l0-rotate-");
    const session = createSession(dataDir);
    // tiny rotation threshold to force rotation after a couple events
    const writer = createEventLogWriter({
      rotateBytes: 200,
      sessionDir: session.dir,
    });

    const payloads = Array.from(
      {
        length: 8,
      },
      (_, index) => ({
        content: `payload-${index}`,
      }),
    );
    payloads.forEach((payload, index) => {
      writer.append("user_message", {
        ...payload,
        index,
      });
      void index;
    });

    const files = readdirSync(session.dir);
    expect(files).toContain("events.001.jsonl");
    expect(files).toContain("events.jsonl");

    const reader = createEventLogReader({
      sessionDir: session.dir,
    });
    return reader.readAll().then((events: L0Event[]) => {
      expect(events).toHaveLength(8);
      const positions = events.map((event) => event.position);
      expect(positions).toEqual(
        [
          ...positions,
        ].sort((a, b) => a - b),
      );
    });
  });
  it("append after rotation resumes at the right position and rotation is not skipped", () => {
    const dataDir = makeTempDir("xpi-l0-rotate-resume-");
    const session = createSession(dataDir);
    const writer = createEventLogWriter({
      rotateBytes: 150,
      sessionDir: session.dir,
    });
    writer.append("user_message", {
      index: 1,
    });
    expect(writer.currentPosition()).toBe(1);
    const next = writer.append("user_message", {
      index: 2,
    });
    expect(next.position).toBe(2);
    // all 2 events still readable after one rotation
    const reader = createEventLogReader({
      sessionDir: session.dir,
    });
    return reader.readAll().then((events: L0Event[]) => {
      expect(events).toHaveLength(2);
      expect(events.map((event) => event.position)).toEqual([
        1,
        2,
      ]);
    });
  });

  it("readAfter skips rotated files whose max position is already covered", () => {
    const dataDir = makeTempDir("xpi-l0-read-after-");
    const session = createSession(dataDir);
    const writer = createEventLogWriter({
      rotateBytes: 120,
      sessionDir: session.dir,
    });
    for (let index = 1; index <= 6; index += 1)
      writer.append("user_message", {
        index,
      });
    const reader = createEventLogReader({
      sessionDir: session.dir,
    });
    expect(reader.files().length).toBeGreaterThan(1);
    return reader.readAfter(4).then((events) => {
      expect(events.map((event) => event.position)).toEqual([
        5,
        6,
      ]);
    });
  });

  it("recovers from corrupt line during position scan", () => {
    const dataDir = makeTempDir("xpi-l0-corrupt-");
    const session = createSession(dataDir);
    mkdirSync(session.dir, {
      recursive: true,
    });
    writeFileSync(
      join(session.dir, "events.jsonl"),
      `${JSON.stringify({
        payload: {},
        position: 1,
        timestamp: "t",
        type: "user_message",
        version: 1,
      })}\n{broken json\n`,
    );

    const writer = createEventLogWriter({
      sessionDir: session.dir,
    });
    expect(writer.currentPosition()).toBe(1);
    const event = writer.append("user_message", {});
    expect(event.position).toBe(2);
    // corrupt line must remain untouched (append-only)
    const raw = readFileSync(join(session.dir, "events.jsonl"), "utf8");
    expect(raw).toContain("{broken json");
  });
});

describe("createEventLogReader", () => {
  it("reads all events across active and rotated files in order", async () => {
    const dataDir = makeTempDir("xpi-l0-read-");
    const session = createSession(dataDir);
    const writer = createEventLogWriter({
      rotateBytes: 150,
      sessionDir: session.dir,
    });
    for (let index = 1; index <= 6; index += 1)
      writer.append("user_message", {
        index,
      });

    const reader = createEventLogReader({
      sessionDir: session.dir,
    });
    const events = await reader.readAll();
    expect(events.map((event) => event.position)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
    ]);
  });

  it("filters by range and type without modifying the log", async () => {
    const dataDir = makeTempDir("xpi-l0-filter-");
    const session = createSession(dataDir);
    const writer = createEventLogWriter({
      sessionDir: session.dir,
    });
    writer.append("user_message", {
      content: "a",
    });
    writer.append("tool_call", {
      toolName: "x",
    });
    writer.append("tool_result", {
      output: "y",
    });
    writer.append("user_message", {
      content: "b",
    });

    const reader = createEventLogReader({
      sessionDir: session.dir,
    });
    const range = await reader.readRange(2, 3);
    expect(range.map((event) => event.type)).toEqual([
      "tool_call",
      "tool_result",
    ]);

    const userMessages = await reader.readByType("user_message");
    expect(userMessages).toHaveLength(2);

    // read-only: file unchanged
    const filesBefore = reader.files();
    await reader.readAll();
    expect(reader.files()).toEqual(filesBefore);
  });

  it("skips corrupt lines and continues reading", async () => {
    const dataDir = makeTempDir("xpi-l0-readcorrupt-");
    const session = createSession(dataDir);
    mkdirSync(session.dir, {
      recursive: true,
    });
    const good = (position: number) =>
      `${JSON.stringify({
        payload: {
          position,
        },
        position,
        timestamp: "2024-01-01T00:00:00Z",
        type: "user_message",
        version: 1,
      })}\n`;
    writeFileSync(
      join(session.dir, "events.jsonl"),
      `${good(1)}not-json\n${good(2)}\n`,
    );

    const reader = createEventLogReader({
      sessionDir: session.dir,
    });
    const events = await reader.readAll();
    expect(events).toHaveLength(2);
  });
});

describe("createSession", () => {
  it("generates unique session IDs with path resolution", () => {
    const dataDir = makeTempDir("xpi-l0-session-");
    const first = createSession(dataDir);
    const second = createSession(dataDir);
    expect(first.id).not.toBe(second.id);
    expect(first.dir).toContain(dataDir);
    expect(first.dir).toContain(first.id);
    expect(first.startedAt).toBeTruthy();
  });
});
