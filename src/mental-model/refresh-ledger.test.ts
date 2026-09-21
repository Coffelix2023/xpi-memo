import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMentalModelRefreshLedger,
  DEFAULT_MENTAL_MODEL_REFRESH_LIMITS,
  type MentalModelRefreshLedgerLimits,
} from "./refresh-ledger.js";

const temporaryDirectories: string[] = [];

function statePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-refresh-ledger-"));
  temporaryDirectories.push(directory);
  return join(directory, "ledger.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

const LIMITS: MentalModelRefreshLedgerLimits = {
  maxAttemptsPerSession: 8,
  maxCharsPerSession: 12_000,
};

describe("per-session refresh ledger", () => {
  it("allows one attempt per definition and digest, and skips a duplicate", () => {
    const ledger = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: statePath(),
    });
    const digest = "a".repeat(64);
    expect(ledger.attemptAllowed("user-working-style", digest, LIMITS)).toBe(true);
    ledger.recordAttempt("user-working-style", digest, 100);
    expect(ledger.attemptAllowed("user-working-style", digest, LIMITS)).toBe(false);
    // A changed digest is a new question and stays eligible.
    expect(ledger.attemptAllowed("user-working-style", "b".repeat(64), LIMITS)).toBe(
      true,
    );
  });

  it("keeps two definitions independent", () => {
    const ledger = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: statePath(),
    });
    ledger.recordAttempt("user-working-style", "a".repeat(64), 0);
    expect(
      ledger.attemptAllowed("active-project-operating-model", "a".repeat(64), LIMITS),
    ).toBe(true);
  });

  it("enforces the shared session budgets", () => {
    const path = statePath();
    const ledger = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: path,
    });
    const tight: MentalModelRefreshLedgerLimits = {
      maxAttemptsPerSession: 1,
      maxCharsPerSession: 100,
    };
    expect(ledger.attemptAllowed("user-working-style", "a".repeat(64), tight)).toBe(
      true,
    );
    ledger.recordAttempt("user-working-style", "a".repeat(64), 200);
    // The char budget was blown by the recorded output.
    expect(
      ledger.attemptAllowed("active-project-operating-model", "b".repeat(64), tight),
    ).toBe(false);
    // Attempt cap: one more fresh digest is refused.
    const again = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: path,
    });
    expect(
      again.attemptAllowed("user-working-style", "c".repeat(64), {
        maxAttemptsPerSession: 1,
        maxCharsPerSession: 100,
      }),
    ).toBe(false);
  });

  it("persists count-only state and reloads it", () => {
    const path = statePath();
    const ledger = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: path,
    });
    ledger.recordAttempt("user-working-style", "a".repeat(64), 42);
    expect(ledger.attempts()).toBe(1);
    expect(ledger.chars()).toBe(42);

    const reloaded = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: path,
    });
    expect(reloaded.attempts()).toBe(1);
    expect(reloaded.chars()).toBe(42);
    expect(reloaded.attemptAllowed("user-working-style", "a".repeat(64), LIMITS)).toBe(
      false,
    );

    // The file never carries bodies: only ids, digests and counters.
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain("content");
    expect(text).toContain("user-working-style");
  });

  it("resets safely when the file belongs to another session", () => {
    const path = statePath();
    const first = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: path,
    });
    first.recordAttempt("user-working-style", "a".repeat(64), 300);
    expect(first.attempts()).toBe(1);

    const next = createMentalModelRefreshLedger({
      sessionId: "session-b",
      statePath: path,
    });
    expect(next.attempts()).toBe(0);
    expect(next.chars()).toBe(0);
    expect(next.attemptAllowed("user-working-style", "a".repeat(64), LIMITS)).toBe(
      true,
    );
  });

  it("treats a corrupt ledger file as a fresh empty state", () => {
    const path = statePath();
    writeFileSync(path, "{ not json");
    const ledger = createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: path,
    });
    expect(ledger.attempts()).toBe(0);
    expect(ledger.attemptAllowed("user-working-style", "a".repeat(64), LIMITS)).toBe(
      true,
    );
  });

  it("provides sane default limits", () => {
    expect(DEFAULT_MENTAL_MODEL_REFRESH_LIMITS.maxAttemptsPerSession).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_MENTAL_MODEL_REFRESH_LIMITS.maxCharsPerSession).toBeGreaterThan(0);
  });
});
