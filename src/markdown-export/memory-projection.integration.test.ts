/**
 * End-to-end regression scenario for change `markdown-state-projection`
 * (task 3.2): write A → export → forget A → export.
 *
 * The whole chain runs for real — the deletion lifecycle (`runT1Delete`), the
 * L0 event log, the export orchestration and the MEMORY.md projection. Only
 * the mnemosyne CLI is faked: `delete` removes the row from the in-memory bank
 * and `export` serves the rows that are left. That is exactly the boundary the
 * change redefines: the entry set follows the bank's current state, so no
 * projection code has to interpret the deletion event.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuditLog } from "../audit.js";
import { EXACT_ID_READ_UNAVAILABLE } from "../banks.js";
import { runT1Delete } from "../deletion-lifecycle.js";
import { createEventLogWriter } from "../l0/event-log-writer.js";
import type { L0Coordinator } from "../l0/l0-runtime.js";
import { sessionDirFor } from "../l0/session-manager.js";
import type { MnemosyneAdapter, MnemosyneRunner } from "../operations.js";
import { exportMarkdown, markdownDirFor } from "./exporter.js";

const SESSION_ID = "2026-01-01T00-00-00-00000000-projection";
const MEMORY_A = "deploy on Fridays only";
const MEMORY_B = "the bank stays the state store";

interface BankRow {
  content: string;
  id: string;
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "xpi-memo-projection-"));
});

afterEach(() => {
  rmSync(dataDir, {
    force: true,
    recursive: true,
  });
});

function memoryMarkdown(): string {
  return readFileSync(join(markdownDirFor(dataDir), "MEMORY.md"), "utf8");
}

describe("MEMORY.md follows the bank state end to end", () => {
  it("drops a forgotten memory on the next export and keeps unrelated entries", async () => {
    const rows: BankRow[] = [
      {
        content: MEMORY_A,
        id: "memory-a",
      },
      {
        content: MEMORY_B,
        id: "memory-b",
      },
    ];
    // Real L0 log: both writes are annotated, and the deletion event lands here.
    const writer = createEventLogWriter({
      sessionDir: sessionDirFor(dataDir, SESSION_ID),
    });
    writer.append("t1_memory_write", {
      content: MEMORY_A,
      kind: "project_decision",
      memoryId: "memory-a",
    });
    writer.append("t1_memory_write", {
      content: MEMORY_B,
      kind: "global_preference",
      memoryId: "memory-b",
    });
    writeFileSync(join(dataDir, "mnemosyne.db"), "");

    const run: MnemosyneRunner = async (args) => {
      const [command, target] = args;
      if (command === "export") {
        writeFileSync(
          target ?? "",
          JSON.stringify({
            episodic_memory: [],
            working_memory: rows,
          }),
        );
        return "Exported";
      }
      if (command === "delete") {
        const index = rows.findIndex((row) => row.id === target);
        if (index < 0) throw new Error(`Memory not found: ${target}`);
        rows.splice(index, 1);
        return `Deleted ${target}`;
      }
      throw new Error(`unexpected command: ${command}`);
    };
    const l0: L0Coordinator = {
      enabled: true,
      currentPosition: () => writer.currentPosition(),
      record: (type, payload) => writer.append(type, payload),
      recordSafe: (type, payload) => {
        try {
          return writer.append(type, payload);
        } catch {
          return null;
        }
      },
      sessionId: () => SESSION_ID,
    };
    const adapter: MnemosyneAdapter = {
      // No exact-ID read upstream: forget deletes without a recovery snapshot.
      exactIdReadCapability: () =>
        Promise.resolve({
          available: false,
          reason: EXACT_ID_READ_UNAVAILABLE,
        }),
      async store() {
        throw new Error("not-used");
      },
    };
    const env = {
      XPI_MEMO_DATA_DIR: dataDir,
    };

    const first = await exportMarkdown({
      env,
      run,
    });
    expect(first.memoryMd).toBe(true);
    expect(memoryMarkdown()).toContain(MEMORY_A);
    expect(memoryMarkdown()).toContain(MEMORY_B);

    const deletion = await runT1Delete({
      adapter,
      audit: createAuditLog({
        statePath: join(dataDir, "audit.json"),
      }),
      banks: [
        "default",
      ],
      dataDir,
      deleteMemory: run,
      l0,
      memoryId: "memory-a",
    });
    expect(deletion.status).toBe("deleted");

    const second = await exportMarkdown({
      env,
      run,
    });
    expect(second.memoryMd).toBe(true);
    expect(memoryMarkdown()).not.toContain(MEMORY_A);
    expect(memoryMarkdown()).toContain(MEMORY_B);
  });
});
