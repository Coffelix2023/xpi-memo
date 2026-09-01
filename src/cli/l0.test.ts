import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { l0Status } from "./l0.js";

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

function setupDataDir(): {
  dataDir: string;
  configHome: string;
} {
  const configHome = makeTempDir("xpi-l0-cfg-");
  const dataDir = makeTempDir("xpi-l0-data-");
  mkdirSync(join(configHome, "xpi-memo"), {
    recursive: true,
  });
  writeFileSync(
    join(configHome, "xpi-memo", "config.json"),
    JSON.stringify({
      dataDir,
    }),
  );
  const sessionDir = join(dataDir, "sessions", "2024-01-01T00-00-00-000Z-abc12345");
  mkdirSync(sessionDir, {
    recursive: true,
  });
  const event = (position: number, type: string) =>
    `${JSON.stringify({
      payload: {
        position,
      },
      position,
      timestamp: "2024-01-01T00:00:00Z",
      type,
      version: 1,
    })}\n`;
  writeFileSync(
    join(sessionDir, "events.jsonl"),
    `${event(1, "user_message")}${event(2, "t1_memory_write")}${event(3, "t1_memory_write")}`,
  );
  return {
    configHome,
    dataDir,
  };
}

describe("l0Status (Task 7.1)", () => {
  it("reports accurate session count, event count, and disk usage", () => {
    const { configHome } = setupDataDir();
    const status = l0Status({
      configHome,
      env: {},
    });
    expect(status.sessionCount).toBe(1);
    expect(status.totalEvents).toBe(3);
    expect(status.totalBytes).toBeGreaterThan(0);
    expect(status.enabled).toBe(true);
    expect(status.sessions[0]?.eventCount).toBe(3);
  });

  it("reports zero sessions when none exist", () => {
    // Isolate from the real ~/.pi/agent/xpi-memo: an empty configHome falls
    // back to the machine's default dataDir, which may hold live sessions.
    const configHome = makeTempDir("xpi-l0-empty-");
    const emptyDataDir = makeTempDir("xpi-l0-empty-data-");
    const status = l0Status({
      configHome,
      env: {
        XPI_MEMO_DATA_DIR: emptyDataDir,
      },
    });
    expect(status.sessionCount).toBe(0);
    expect(status.totalEvents).toBe(0);
  });
});
