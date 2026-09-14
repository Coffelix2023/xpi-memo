/**
 * Cross-phase integration test (task 15.4): the L0 → export → recall chain.
 *
 * One scenario walks the whole chain on a single temp data dir:
 *   L0 dual-write records governed writes alongside mnemosyne/audit
 *   Markdown export projects the bank's current state + daily logs from L0
 *   recall runs through the backend chain (ripgrep over the export)
 */
import {
  existsSync,
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
import type { MnemosyneRunner } from "./operations.ts";
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

describe("L0 → export → recall chain", () => {
  it("dual-writes L0, exports incrementally, recalls via backend", async () => {
    const targetDataDir = makeTempDir("xpi-memo-evo-data-");

    // ── L0 dual-write ──
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
      memoryId: "memory-rollout",
    });
    expect(existsSync(sessionDirFor(targetDataDir, sessionId))).toBe(true);

    // ── Markdown export projects the bank state + L0 provenance ──
    // The bank file and the CLI export payload stand in for the real
    // mnemosyne bank that a governed write would have created.
    writeFileSync(join(targetDataDir, "mnemosyne.db"), "");
    const env = {
      XPI_MEMO_DATA_DIR: targetDataDir,
    };
    const run: MnemosyneRunner = async (args) => {
      writeFileSync(
        args[1] ?? "",
        JSON.stringify({
          episodic_memory: [],
          working_memory: [
            {
              content: "Roll out in stages",
              id: "memory-rollout",
            },
          ],
        }),
      );
      return "Exported";
    };
    const firstExport = await exportMarkdown({
      env,
      run,
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
      run,
    });
    expect(secondExport.sessions[0]?.exportedEvents).toBe(0);

    // ── backend chain — ripgrep finds the exported memory ──
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
