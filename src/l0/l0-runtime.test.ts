import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEventLogReader } from "./event-log-reader.js";
import { createL0Coordinator } from "./l0-runtime.js";

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

function onlySessionDir(dataDir: string): string {
  const sessions = join(dataDir, "sessions");
  const [id] = readdirSync(sessions);
  return join(sessions, String(id));
}

describe("L0 coordinator (Task 5.5/5.6 semantics)", () => {
  it("records events that dual-write replays into audit.json", async () => {
    const dataDir = makeTempDir("xpi-l0-dual-");
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });

    // Governed write sequence: L0 first, then audit/mnemosyne.
    l0.record("t1_memory_write", {
      bank: "project-test",
      content: "user prefers pnpm",
      kind: "preference",
      scope: "global",
    });
    l0.record("routing_decision", {
      bank: "project-test",
      kind: "preference",
    });

    const reader = createEventLogReader({
      sessionDir: onlySessionDir(dataDir),
    });
    const events = await reader.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "t1_memory_write",
      "routing_decision",
    ]);
    expect(events[0]?.payload).toMatchObject({
      kind: "preference",
      scope: "global",
    });
  });

  it("aborts (throws) when the write target is unavailable", () => {
    const dataDir = makeTempDir("xpi-l0-abort-");
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });
    // Make <dataDir>/sessions a regular file so session dir creation fails.
    writeFileSync(join(dataDir, "sessions"), "not a dir");
    expect(() =>
      l0.record("t1_memory_write", {
        content: "x",
      }),
    ).toThrow();
  });

  it("recordSafe never throws for hook callers", () => {
    const dataDir = makeTempDir("xpi-l0-safe-");
    writeFileSync(join(dataDir, "sessions"), "not a dir");
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });
    expect(
      l0.recordSafe("user_message", {
        text: "hi",
      }),
    ).toBeNull();
  });

  it("throws l0-disabled when disabled (v0.1 fallback path)", () => {
    const dataDir = makeTempDir("xpi-l0-disabled-");
    const l0 = createL0Coordinator({
      dataDir,
      enabled: false,
    });
    expect(() => l0.record("t1_memory_write", {})).toThrow("l0-disabled");
    expect(l0.recordSafe("user_message", {})).toBeNull();
    expect(l0.sessionId()).toBeNull();
  });
});
