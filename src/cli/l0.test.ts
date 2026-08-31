import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatL0Status, l0Status, reconcile } from "./l0.js";

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

function setupDataDir(withAuditWrites = 0): {
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
  if (withAuditWrites > 0) {
    const entries = Array.from(
      {
        length: withAuditWrites,
      },
      (_, index) => ({
        action: "write",
        metadata: {},
        timestamp: `2024-01-01T00:00:0${index}Z`,
      }),
    );
    writeFileSync(
      join(dataDir, "audit.json"),
      JSON.stringify({
        entries,
        version: 1,
      }),
    );
  }
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
    const configHome = makeTempDir("xpi-l0-empty-");
    const status = l0Status({
      configHome,
      env: {},
    });
    expect(status.sessionCount).toBe(0);
    expect(status.totalEvents).toBe(0);
  });

  it("formatL0Status renders human-readable summary", () => {
    const { configHome } = setupDataDir();
    const output = formatL0Status(
      l0Status({
        configHome,
        env: {},
      }),
    );
    expect(output).toContain("L0 enabled");
    expect(output).toContain("Sessions: 1");
    expect(output).toContain("Events: 3");
  });
});

describe("reconcile (Task 7.2/7.3)", () => {
  it("detects divergence when L0 has writes missing from audit", async () => {
    const { configHome } = setupDataDir(0);
    const report = await reconcile({
      configHome,
      env: {},
    });
    expect(report.l0Writes).toBe(2);
    expect(report.auditWrites).toBe(0);
    expect(report.divergences).toHaveLength(1);
    expect(report.canReplay).toBe(true);
  });

  it("reports no divergence when audit matches L0", async () => {
    const { configHome } = setupDataDir(2);
    const report = await reconcile({
      configHome,
      env: {},
    });
    expect(report.l0Writes).toBe(2);
    expect(report.auditWrites).toBe(2);
    expect(report.divergences).toEqual([]);
    expect(report.canReplay).toBe(false);
  });
});
