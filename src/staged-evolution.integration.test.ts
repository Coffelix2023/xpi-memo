/**
 * Cross-phase integration test (task 15.4): the v0.1 → v0.4 upgrade path.
 *
 * One scenario walks the whole evolution on a single temp data dir:
 *   v0.1  memoharness data is migrated in (banks, audit, candidates, config)
 *   v0.2  L0 dual-write records governed writes alongside mnemosyne/audit
 *   v0.3  Markdown export derives MEMORY.md + daily logs from L0, incrementally
 *   v0.4  recall runs through the backend chain (ripgrep over the export)
 */
import {
  existsSync,
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
import { clearIdentityCache } from "./identity.ts";
import { createEventLogWriter } from "./l0/event-log-writer.ts";
import { sessionDirFor } from "./l0/session-manager.ts";
import { exportMarkdown, markdownDirFor } from "./markdown-export/exporter.ts";
import { migrate } from "./migration/migrate.js";
import { RipgrepBackend } from "./search/ripgrep-backend.ts";

const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  clearIdentityCache();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir)
      rmSync(dir, {
        force: true,
        recursive: true,
      });
  }
});

describe("staged evolution: v0.1 → v0.4 upgrade path", () => {
  it("migrates legacy data, dual-writes L0, exports incrementally, recalls via backend", async () => {
    // ── v0.1: legacy memoharness data exists; migration brings it over ──
    const legacyDir = makeTempDir("xpi-memo-evo-legacy-");
    const targetDataDir = makeTempDir("xpi-memo-evo-data-");
    const configHome = makeTempDir("xpi-memo-evo-cfg-");
    mkdirSync(join(legacyDir, "banks", "project-abc123"), {
      recursive: true,
    });
    writeFileSync(join(legacyDir, "mnemosyne.db"), "global-bank-bytes");
    writeFileSync(
      join(legacyDir, "banks", "project-abc123", "mnemosyne.db"),
      "project-bank-bytes",
    );
    writeFileSync(
      join(legacyDir, "audit.json"),
      JSON.stringify({
        version: 1,
        entries: [
          {
            action: "write",
            metadata: {},
            timestamp: "2024-01-01T00:00:00Z",
          },
        ],
      }),
    );
    writeFileSync(
      join(legacyDir, "candidates.json"),
      JSON.stringify({
        version: 1,
        candidates: [
          {
            content: "pending",
          },
        ],
      }),
    );
    mkdirSync(join(configHome, "memoharness"), {
      recursive: true,
    });
    writeFileSync(
      join(configHome, "memoharness", "config.json"),
      JSON.stringify({
        MEMOHARNESS_LIMIT: 9,
        MEMOHARNESS_PAUSED: false,
      }),
    );

    const report = await migrate({
      apply: true,
      configHome,
      from: legacyDir,
      targetDataDir,
    });
    expect(report.mode).toBe("apply");
    expect(report.failed).toEqual([]);
    expect(report.configRenamedKeys.join("\n")).toContain(
      "MEMOHARNESS_LIMIT -> XPI_MEMO_LIMIT",
    );
    expect(readFileSync(join(targetDataDir, "mnemosyne.db"), "utf8")).toBe(
      "global-bank-bytes",
    );
    expect(
      readFileSync(
        join(targetDataDir, "banks", "project-abc123", "mnemosyne.db"),
        "utf8",
      ),
    ).toBe("project-bank-bytes");
    // legacy provenance untouched in the copied audit log
    expect(readFileSync(join(targetDataDir, "audit.json"), "utf8")).toContain(
      '"action":"write"',
    );

    // ── v0.2: L0 dual-write on top of migrated storage ──
    const sessionId = "2024-03-15T10-00-00-00000000-evo0";
    const writer = createEventLogWriter({
      sessionDir: sessionDirFor(targetDataDir, sessionId),
    });
    writer.append("user_message", {
      text: "plan the rollout",
    });
    writer.append("t1_memory_write", {
      content: "Roll out in stages",
      kind: "project_decision",
    });
    expect(existsSync(sessionDirFor(targetDataDir, sessionId))).toBe(true);

    // ── v0.3: Markdown export derived from L0, then incremental no-op ──
    const env = {
      XPI_MEMO_DATA_DIR: targetDataDir,
    };
    const firstExport = await exportMarkdown({
      env,
    });
    expect(firstExport.sessions[0]?.exportedEvents).toBe(2);
    expect(firstExport.memoryMd).toBe(true);
    const memoryMd = readFileSync(
      join(markdownDirFor(targetDataDir), "MEMORY.md"),
      "utf8",
    );
    expect(memoryMd).toContain("Roll out in stages");
    const dailyDir = join(markdownDirFor(targetDataDir), "daily");
    const dailyFiles = readdirSync(dailyDir);
    expect(dailyFiles).toHaveLength(1);
    const daily = readFileSync(join(dailyDir, dailyFiles[0] as string), "utf8");
    expect(daily).toContain("plan the rollout");
    const secondExport = await exportMarkdown({
      env,
    });
    expect(secondExport.sessions[0]?.exportedEvents).toBe(0);

    // ── v0.4: backend chain — ripgrep finds the exported memory ──
    const backend = new RipgrepBackend(targetDataDir);
    const results = await backend.search({
      limit: 5,
      query: "roll out",
      scope: "global",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.content).join("\n")).toContain("Roll out in stages");
  });
});
