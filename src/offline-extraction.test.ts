import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExtractionBudgetLedger } from "./extraction-budget.js";
import { createL0Event, type L0Event } from "./l0/types.js";
import {
  DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
  DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS,
  DEFAULT_OFFLINE_EXTRACTION_TIMEOUT_MS,
  type OfflineExtractionRunner,
  runOfflineExtraction,
} from "./offline-extraction.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-offline-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});
function eventAt(position: number): L0Event {
  return createL0Event("user_message", position, {
    text: `message-${position}`,
  });
}

function events(count: number): L0Event[] {
  return Array.from(
    {
      length: count,
    },
    (_, index) => eventAt(index + 1),
  );
}

function options(overrides: Partial<Parameters<typeof runOfflineExtraction>[0]> = {}) {
  return {
    enabled: true,
    events: events(3),
    maxEvents: DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
    maxInputChars: DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS,
    sessionId: "session-1",
    timeoutMs: DEFAULT_OFFLINE_EXTRACTION_TIMEOUT_MS,
    ...overrides,
  };
}

describe("offline extraction boundary (task 3.1)", () => {
  it("returns disabled without calling the runner when disabled", async () => {
    let called = false;
    const runner: OfflineExtractionRunner = async () => {
      called = true;
      return [];
    };
    const result = await runOfflineExtraction(
      options({
        enabled: false,
        runner,
      }),
    );
    expect(result.status).toBe("disabled");
    expect(called).toBe(false);
    expect(result.diagnostics.events).toBe(3);
  });

  it("returns unavailable when enabled but no runner is injected", async () => {
    const result = await runOfflineExtraction(
      options({
        runner: undefined,
      }),
    );
    expect(result.status).toBe("unavailable");
  });

  it("returns failed and never throws when the runner rejects", async () => {
    const runner: OfflineExtractionRunner = async () => {
      throw new Error("provider exploded");
    };
    const result = await runOfflineExtraction(
      options({
        runner,
      }),
    );
    expect(result.status).toBe("failed");
  });

  it("returns failed and never throws when the runner throws synchronously", async () => {
    const runner: OfflineExtractionRunner = () => {
      throw new Error("provider exploded");
    };
    const result = await runOfflineExtraction(
      options({
        runner,
      }),
    );
    expect(result.status).toBe("failed");
  });

  it("consumes the execution budget when the runner times out", async () => {
    const dataDir = temporaryDirectory();
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    const result = await runOfflineExtraction(
      options({
        ledger,
        timeoutMs: 5,
        limits: {
          maxCharsPerSession: 5_000,
          maxExecutionsPerSession: 1,
          maxProposalsPerSession: 20,
        },
        runner: async () => new Promise(() => undefined),
      }),
    );
    expect(result.status).toBe("timed-out");
    expect(ledger.consumption().executions).toBe(1);
  });
  it("passes only the bounded trailing events to a successful runner", async () => {
    let received: Parameters<OfflineExtractionRunner>[0] | undefined;
    const runner: OfflineExtractionRunner = async (input) => {
      received = input;
      return [
        {
          content: "proposal",
        },
      ];
    };
    const result = await runOfflineExtraction(
      options({
        events: events(10),
        maxEvents: 3,
        runner,
      }),
    );
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.output).toEqual([
      {
        content: "proposal",
      },
    ]);
    expect(result.diagnostics.events).toBe(3);
    expect(received?.events.map((event) => event.position)).toEqual([
      8,
      9,
      10,
    ]);
    expect(received?.maxInputChars).toBe(DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS);
    expect(received?.sessionId).toBe("session-1");
  });
  it("keeps the runner input within the character budget", async () => {
    let received: Parameters<OfflineExtractionRunner>[0] | undefined;
    const result = await runOfflineExtraction(
      options({
        maxInputChars: 6,
        events: [
          createL0Event("user_message", 1, {
            text: "old",
          }),
          createL0Event("user_message", 2, {
            text: "newest",
          }),
        ],
        runner: async (input) => {
          received = input;
          return [];
        },
      }),
    );
    expect(result.status).toBe("completed");
    expect(received?.events.map((event) => event.position)).toEqual([
      2,
    ]);
    expect(result.diagnostics.inputChars).toBe(6);
  });

  it("records bounded diagnostics without memory body content", async () => {
    const result = await runOfflineExtraction(
      options({
        runner: async () => [],
      }),
    );
    expect(result.diagnostics).toMatchObject({
      events: 3,
      maxEvents: DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
      maxInputChars: DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS,
      status: "completed",
    });
    expect(JSON.stringify(result)).not.toContain("message-");
  });

  it("returns budget-exhausted without calling the runner when the execution budget is spent", async () => {
    const dataDir = temporaryDirectory();
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    ledger.recordExecution();
    let called = false;
    const runner: OfflineExtractionRunner = async () => {
      called = true;
      return [];
    };
    const result = await runOfflineExtraction(
      options({
        ledger,
        limits: {
          maxCharsPerSession: 5_000,
          maxExecutionsPerSession: 1,
          maxProposalsPerSession: 20,
        },
        runner,
      }),
    );
    expect(result.status).toBe("budget-exhausted");
    expect(called).toBe(false);
    if (result.status !== "budget-exhausted") throw new Error("unreachable");
    expect(result.diagnostics.budgetExecutions).toBe(1);
  });

  it("records the execution in the ledger after a completed run", async () => {
    const dataDir = temporaryDirectory();
    const ledger = createExtractionBudgetLedger({
      sessionId: "session-1",
      statePath: join(dataDir, "extraction-budget.json"),
    });
    const result = await runOfflineExtraction(
      options({
        ledger,
        limits: {
          maxCharsPerSession: 5_000,
          maxExecutionsPerSession: 1,
          maxProposalsPerSession: 20,
        },
        runner: async () => [],
      }),
    );
    expect(result.status).toBe("completed");
    expect(ledger.consumption().executions).toBe(1);
    const again = await runOfflineExtraction(
      options({
        ledger,
        limits: {
          maxCharsPerSession: 5_000,
          maxExecutionsPerSession: 1,
          maxProposalsPerSession: 20,
        },
        runner: async () => [],
      }),
    );
    expect(again.status).toBe("budget-exhausted");
  });
});
