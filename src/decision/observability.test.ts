import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDecisionLedger,
  MAX_DECISION_COUNT,
  readDecisionLedger,
} from "./observability.js";

const temporaryDirectories: string[] = [];

function statePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-decision-ledger-"));
  temporaryDirectories.push(directory);
  return join(directory, "decision-counters.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("decision counters (task 1.5)", () => {
  it("reads as zero before anything is written", () => {
    const snapshot = readDecisionLedger(statePath());
    expect(snapshot.calls).toEqual({
      calibration: 0,
      repeat: 0,
      rerank: 0,
    });
    expect(snapshot.failures).toBe(0);
    expect(snapshot.gateSkips).toBe(0);
  });

  it("counts calls per consumer, failures and gate skips in one bounded file", () => {
    const path = statePath();
    const ledger = createDecisionLedger(path);
    ledger.recordCall("rerank");
    ledger.recordCall("rerank");
    ledger.recordCall("repeat");
    ledger.recordGateSkip();
    ledger.recordFailure();
    expect(readDecisionLedger(path)).toMatchObject({
      failures: 1,
      gateSkips: 1,
    });
    expect(readDecisionLedger(path).calls).toEqual({
      calibration: 0,
      repeat: 1,
      rerank: 2,
    });
  });

  it("holds no state, answer or key", () => {
    const path = statePath();
    const ledger = createDecisionLedger(path);
    ledger.recordCall("calibration");
    const raw = readFileSync(path, "utf8");
    expect(Object.keys(JSON.parse(raw) as Record<string, unknown>).sort()).toEqual([
      "calls",
      "failures",
      "gateSkips",
      "version",
    ]);
  });

  it("caps every counter", () => {
    const path = statePath();
    const ledger = createDecisionLedger(path);
    for (let index = 0; index < MAX_DECISION_COUNT + 10; index += 1)
      ledger.recordFailure();
    expect(readDecisionLedger(path).failures).toBe(MAX_DECISION_COUNT);
  });

  it("treats a corrupt file as zero instead of throwing", () => {
    const path = statePath();
    writeFileSync(path, "{not json");
    expect(readDecisionLedger(path).failures).toBe(0);
  });
});
