import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExtractionBudgetLedger } from "./extraction-budget.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-budget-"));
  directories.push(directory);
  return directory;
}

const limits = {
  maxCharsPerSession: 100,
  maxExecutionsPerSession: 1,
  maxProposalsPerSession: 5,
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("extraction budget ledger (task 3.3)", () => {
  it("starts empty and allows executions", () => {
    const dataDir = temporaryDirectory();
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    expect(ledger.consumption()).toEqual({
      chars: 0,
      executions: 0,
      proposals: 0,
    });
    expect(ledger.executionAllowed(limits)).toBe(true);
  });

  it("persists consumption across ledger instances for the same session", () => {
    const dataDir = temporaryDirectory();
    const statePath = join(dataDir, "extraction-budget.json");
    const first = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath,
    });
    first.recordExecution();
    first.recordProposals(3, 42);

    const second = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath,
    });
    expect(second.consumption()).toEqual({
      chars: 42,
      executions: 1,
      proposals: 3,
    });
    expect(second.executionAllowed(limits)).toBe(false);
  });

  it("resets to zero for a different session id", () => {
    const dataDir = temporaryDirectory();
    const statePath = join(dataDir, "extraction-budget.json");
    const first = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath,
    });
    first.recordExecution();

    const second = createExtractionBudgetLedger({
      sessionId: "session-2",
      statePath,
    });
    expect(second.consumption()).toEqual({
      chars: 0,
      executions: 0,
      proposals: 0,
    });
  });

  it("resets to zero when the state file is corrupted", () => {
    const dataDir = temporaryDirectory();
    const statePath = join(dataDir, "extraction-budget.json");
    writeFileSync(statePath, "{not json", "utf8");
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath,
    });
    expect(ledger.consumption()).toEqual({
      chars: 0,
      executions: 0,
      proposals: 0,
    });
    expect(ledger.executionAllowed(limits)).toBe(true);
  });

  it("records only bounded counts, never memory bodies", () => {
    const dataDir = temporaryDirectory();
    const statePath = join(dataDir, "extraction-budget.json");
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath,
    });
    ledger.recordProposals(2, 55);
    const raw = readFileSync(statePath, "utf8");
    expect(raw).toContain('"proposals": 2');
    expect(raw).toContain('"chars": 55');
    expect(raw).not.toContain("body");
  });
});
