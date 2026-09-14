import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMnemosyne } from "../cli.js";
import type { MnemosyneRunner } from "../operations.js";
import {
  BANK_STATE_MAX_BYTES,
  BANK_STATE_TEMP_PREFIX,
  BANK_STATE_TIMEOUT_MS,
  createCliBankStateReader,
  listBankNames,
  parseBankStateExport,
} from "./bank-state.js";

let dataDir: string;
let tempRoot: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "xpi-memo-bankstate-fixture-"));
  // Private temp root: the reader's cleanup is observable without racing other
  // test files that share the OS temp directory.
  tempRoot = mkdtempSync(join(tmpdir(), "xpi-memo-bankstate-temp-"));
});

afterEach(() => {
  rmSync(dataDir, {
    force: true,
    recursive: true,
  });
  rmSync(tempRoot, {
    force: true,
    recursive: true,
  });
});

function createBank(name: string): void {
  const path =
    name === "default"
      ? join(dataDir, "mnemosyne.db")
      : join(dataDir, "banks", name, "mnemosyne.db");
  mkdirSync(dirname(path), {
    recursive: true,
  });
  writeFileSync(path, "");
}

/** Temp dirs the reader created inside the private temp root and did not clean up. */
function leftoverTempDirs(): string[] {
  return readdirSync(tempRoot).filter((name) =>
    name.startsWith(BANK_STATE_TEMP_PREFIX),
  );
}

/** Fake CLI: writes an export payload to the path it was handed. */
function exportRun(payload: unknown, text = JSON.stringify(payload)): MnemosyneRunner {
  return async (args) => {
    const exportPath = args[1];
    if (!exportPath) throw new Error("missing export path");
    writeFileSync(exportPath, text);
    return "Exported 0 working, 0 episodic";
  };
}

describe("bank state read", () => {
  it("lists only banks that physically exist, default first", () => {
    createBank("default");
    createBank("project-p-bbb");
    createBank("project-p-aaa");
    mkdirSync(join(dataDir, "banks", "project-p-empty"), {
      recursive: true,
    });
    expect(listBankNames(dataDir)).toEqual([
      "default",
      "project-p-aaa",
      "project-p-bbb",
    ]);
  });

  it("reads every bank and maps the memory row fields", async () => {
    createBank("default");
    createBank("project-p-a");
    const seen: string[] = [];
    const run: MnemosyneRunner = async (args, options) => {
      seen.push(options?.bank ?? "default");
      const rows =
        options?.bank === "project-p-a"
          ? [
              {
                content: "project memory",
                id: "row-b",
                session_id: "default",
                source: "kind=project_decision",
                superseded_by: "row-c",
                timestamp: "2024-03-15T10:00:00.000Z",
                title: "discarded",
              },
            ]
          : [
              {
                content: "global memory",
                id: "row-a",
                source: "user-written",
                timestamp: "2024-03-14T10:00:00.000Z",
              },
            ];
      return exportRun({
        episodic_memory: [],
        working_memory: rows,
      })(args, options);
    };

    const result = await createCliBankStateReader(run)({
      dataDir,
      tempRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seen.sort()).toEqual([
      "default",
      "project-p-a",
    ]);
    expect(result.banks).toEqual([
      "default",
      "project-p-a",
    ]);
    expect(result.rows).toEqual([
      {
        bank: "default",
        content: "global memory",
        id: "row-a",
        source: "user-written",
        timestamp: "2024-03-14T10:00:00.000Z",
      },
      {
        bank: "project-p-a",
        content: "project memory",
        id: "row-b",
        sessionId: "default",
        source: "kind=project_decision",
        supersededBy: "row-c",
        timestamp: "2024-03-15T10:00:00.000Z",
      },
    ]);
    expect(leftoverTempDirs()).toEqual([]);
  });

  it("treats a data root with no bank file as an empty state, not a failure", async () => {
    let called = 0;
    const run: MnemosyneRunner = async () => {
      called += 1;
      return "";
    };
    const result = await createCliBankStateReader(run)({
      dataDir,
      tempRoot,
    });
    expect(result).toEqual({
      banks: [],
      ok: true,
      rows: [],
    });
    expect(called).toBe(0);
  });

  it("returns a failure on timeout and leaves no temporary file behind", async () => {
    createBank("default");
    // Real timeout path: a child process that never closes.
    const hangingChild = {
      kill: () => {
        // the timeout branch must not depend on the kill succeeding
      },
      on: () => {
        // registered listeners are never invoked
      },
      stderr: {
        on: () => {
          // no output
        },
      },
      stdout: {
        on: () => {
          // no output
        },
      },
    };
    const run: MnemosyneRunner = (args, options) =>
      runMnemosyne(args, options ?? {}, () => hangingChild);

    const result = await createCliBankStateReader(run)({
      dataDir,
      tempRoot,
      timeoutMs: 20,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("timed out");
    expect(leftoverTempDirs()).toEqual([]);
  });

  it("returns a failure when the export payload exceeds the size cap", async () => {
    createBank("default");
    const run = exportRun({
      episodic_memory: [],
      working_memory: [],
    });
    const result = await createCliBankStateReader(run)({
      dataDir,
      maxBytes: 16,
      tempRoot,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("bank-export-too-large");
    expect(leftoverTempDirs()).toEqual([]);
  });

  it("returns a failure on an unparseable export payload", async () => {
    createBank("default");
    const result = await createCliBankStateReader(exportRun(null, "{not json"))({
      dataDir,
      tempRoot,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("bank-export-unparseable");
    expect(leftoverTempDirs()).toEqual([]);
  });

  it("returns no partial state when one bank fails", async () => {
    createBank("default");
    createBank("project-p-broken");
    const run: MnemosyneRunner = async (args, options) => {
      if (options?.bank === "project-p-broken") throw new Error("bank is locked");
      writeFileSync(
        args[1] ?? "",
        JSON.stringify({
          episodic_memory: [],
          working_memory: [
            {
              content: "readable row",
              id: "row-1",
            },
          ],
        }),
      );
      return "ok";
    };
    const result = await createCliBankStateReader(run)({
      dataDir,
      tempRoot,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("bank is locked");
  });
});

describe("bank state export parsing", () => {
  it("reads working and episodic rows and drops unrelated fields", () => {
    const rows = parseBankStateExport(
      JSON.stringify({
        annotations: [
          {
            id: "ignored",
          },
        ],
        episodic_embeddings: [
          {
            id: "ignored",
          },
        ],
        episodic_memory: [
          {
            content: "episodic row",
            id: "row-e",
          },
        ],
        working_memory: [
          {
            content: "working row",
            id: "row-w",
            importance: 1,
          },
        ],
      }),
      "default",
    );
    expect(rows).toEqual([
      {
        bank: "default",
        content: "working row",
        id: "row-w",
      },
      {
        bank: "default",
        content: "episodic row",
        id: "row-e",
      },
    ]);
  });

  it("fails closed on schema drift instead of projecting half the state", () => {
    expect(parseBankStateExport("{}", "default")).toBeNull();
    expect(
      parseBankStateExport(
        JSON.stringify({
          working_memory: [],
        }),
        "default",
      ),
    ).toBeNull();
    expect(
      parseBankStateExport(
        JSON.stringify({
          episodic_memory: [],
        }),
        "default",
      ),
    ).toBeNull();
    expect(parseBankStateExport("[]", "default")).toBeNull();
  });

  it("keeps the fixed timeout and size cap defaults", () => {
    expect(BANK_STATE_TIMEOUT_MS).toBe(5_000);
    expect(BANK_STATE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
