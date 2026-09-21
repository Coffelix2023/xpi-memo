import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { BankMemoryRow, BankStateReader } from "../markdown-export/bank-state.js";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./definitions.js";
import { createMentalModelSourceMemo } from "./memo.js";
import { mentalModelProjectionPath } from "./owner.js";
import { type MentalModelRefreshContext, refreshMentalModels } from "./refresh.js";
import {
  createMentalModelRefreshLedger,
  DEFAULT_MENTAL_MODEL_REFRESH_LIMITS,
} from "./refresh-ledger.js";
import { readMentalModelProjection } from "./store.js";
import type { MentalModelDefinition } from "./types.js";

const temporaryDirectories: string[] = [];

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-refresh-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

function sourceRow(overrides: Partial<BankMemoryRow> = {}): BankMemoryRow {
  return {
    bank: "default",
    content: "a governed fact",
    id: "m-1",
    source:
      "kind=global_preference;ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=session:s1#42",
    ...overrides,
  };
}

function context(
  overrides: Partial<MentalModelRefreshContext> = {},
): MentalModelRefreshContext {
  const dir = dataDir();
  const read: BankStateReader = async () => ({
    ok: true,
    banks: [
      "default",
    ],
    rows: [
      sourceRow(),
    ],
  });
  const runner = async () => ({
    content: "The user prefers one-line summaries.",
    sourceIds: [
      "m-1",
    ],
  });
  const definitions = [
    mentalModelDefinition(USER_WORKING_STYLE_ID),
    mentalModelDefinition(ACTIVE_PROJECT_OPERATING_MODEL_ID),
  ].filter((d): d is MentalModelDefinition => d !== null);
  return {
    dataDir: dir,
    definitions,
    ledger: createMentalModelRefreshLedger({
      sessionId: "session-a",
      statePath: join(dir, "mental-models", "refresh-ledger.json"),
    }),
    limits: DEFAULT_MENTAL_MODEL_REFRESH_LIMITS,
    memo: createMentalModelSourceMemo(),
    projectBank: "project-p-aaaaaaaaaaaa",
    generator: {
      model: "session-model",
      provider: "session",
    },
    isDefinitionEnabled: () => true,
    read,
    runner,
    sessionId: "session-a",
    synthesisEnabled: true,
    ...overrides,
  };
}

describe("refresh coordinator", () => {
  it("refreshes absent definitions and commits the successful digest", async () => {
    const ctx = context();
    const results = await refreshMentalModels(ctx);
    const user = results.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID);
    expect(user?.outcome).toBe("refreshed");
    expect(user?.state).toBe("fresh");
    expect(user?.sourceCount).toBe(1);
    expect(user?.outputChars).toBeGreaterThan(0);
    expect(user?.digestPrefix).toHaveLength(12);

    // The projection is persisted under the global owner path.
    const target = mentalModelProjectionPath(
      ctx.dataDir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    const stored = readMentalModelProjection(target);
    expect(stored.ok).toBe(true);
    if (!stored.ok || !stored.projection) return;
    expect(stored.projection.content).toBe("The user prefers one-line summaries.");
    expect(stored.projection.sourceIds).toEqual([
      "m-1",
    ]);
    expect(stored.projection.generator.model).toBe("session-model");
    expect(stored.projection.lastAttempt.outcome).toBe("refreshed");
  });

  it("skips the project model when project identity is missing", async () => {
    const ctx = context({
      projectBank: null,
    });
    const results = await refreshMentalModels(ctx);
    // The global model refreshes; the project model is skipped without a fallback.
    expect(results.some((entry) => entry.outcome === "refreshed")).toBe(true);
    expect(
      results.find((entry) => entry.definitionId === ACTIVE_PROJECT_OPERATING_MODEL_ID),
    ).toBeUndefined();
  });

  it("reports no-refresh-needed for a fresh projection and never calls the model", async () => {
    let runnerCalls = 0;
    const ctx = context({
      runner: async () => {
        runnerCalls += 1;
        return {
          content: "The user prefers one-line summaries.",
          sourceIds: [
            "m-1",
          ],
        };
      },
    });
    expect((await refreshMentalModels(ctx)).map((entry) => entry.outcome)).toContain(
      "refreshed",
    );
    const second = await refreshMentalModels(ctx);
    const user = second.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID);
    expect(user?.outcome).toBe("no-refresh-needed");
    expect(user?.state).toBe("fresh");
    // The second pass used the memoized bank read and never ran synthesis.
    expect(runnerCalls).toBe(1);
  });

  it("keeps the same changes eligible after a synthesis failure", async () => {
    let calls = 0;
    const ctx = context({
      runner: async () => {
        calls += 1;
        if (calls === 1) throw new Error("provider exploded");
        return {
          content: "recovered",
          sourceIds: [
            "m-1",
          ],
        };
      },
    });
    const first = await refreshMentalModels(ctx);
    const user = first.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID);
    expect(user?.outcome).toBe("failed");
    expect(user?.state).toBe("absent");
    // No authoritative payload was invented.
    const target = mentalModelProjectionPath(
      ctx.dataDir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    const stored = readMentalModelProjection(target);
    expect(stored.ok).toBe(true);
    if (!stored.ok || !stored.projection) return;
    expect(stored.projection.content).toBe("");
    expect(stored.projection.lastAttempt.failure).toBe("failed");

    // A second pass in a NEW session retries the same uncommitted change.
    const next = context({
      ...ctx,
      ledger: createMentalModelRefreshLedger({
        sessionId: "session-b",
        statePath: join(ctx.dataDir, "mental-models", "refresh-ledger.json"),
      }),
      memo: createMentalModelSourceMemo(),
      sessionId: "session-b",
    });
    const retried = await refreshMentalModels(next);
    expect(
      retried.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID)?.outcome,
    ).toBe("refreshed");
  });

  it("preserves the old content when a refresh fails mid-lifecycle", async () => {
    const ctx = context();
    await refreshMentalModels(ctx);
    // Change the source set so the projection goes stale.
    const changed = context({
      ...ctx,
      ledger: createMentalModelRefreshLedger({
        sessionId: "session-b",
        statePath: join(ctx.dataDir, "mental-models", "refresh-ledger.json"),
      }),
      memo: createMentalModelSourceMemo(),
      sessionId: "session-b",
      read: async () => ({
        ok: true,
        banks: [
          "default",
        ],
        rows: [
          sourceRow({
            content: "a NEW governed fact",
          }),
        ],
      }),
      runner: async () => {
        throw new Error("boom");
      },
    });
    const results = await refreshMentalModels(changed);
    const user = results.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID);
    expect(user?.outcome).toBe("failed");
    expect(user?.state).toBe("stale");

    const target = mentalModelProjectionPath(
      changed.dataDir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    const stored = readMentalModelProjection(target);
    expect(stored.ok).toBe(true);
    if (!stored.ok || !stored.projection) return;
    // Old content and digest survive; only the failure metadata changed.
    expect(stored.projection.content).toBe("The user prefers one-line summaries.");
    expect(stored.projection.lastAttempt.outcome).toBe("failed");
    expect(stored.projection.lastAttempt.failure).toBe("failed");
  });

  it("honours per-definition enablement and the synthesis switch", async () => {
    const disabled = await refreshMentalModels(
      context({
        isDefinitionEnabled: (id) => id !== USER_WORKING_STYLE_ID,
      }),
    );
    expect(
      disabled.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID)?.outcome,
    ).toBe("definition-disabled");
    const off = await refreshMentalModels(
      context({
        synthesisEnabled: false,
      }),
    );
    for (const entry of off) expect(entry.outcome).toBe("synthesis-disabled");
  });

  it("reports source-empty without fabricating a projection", async () => {
    const ctx = context({
      read: async () => ({
        ok: true,
        rows: [],
        banks: [
          "default",
        ],
      }),
    });
    const results = await refreshMentalModels(ctx);
    const user = results.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID);
    expect(user?.outcome).toBe("source-empty");
    const target = mentalModelProjectionPath(
      ctx.dataDir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    expect(existsSync(target)).toBe(false);
  });

  it("fails closed on a bank-read failure and records it", async () => {
    const ctx = context({
      read: async () => ({
        ok: false,
        reason: "bank-export-too-large:default",
      }),
    });
    const results = await refreshMentalModels(ctx);
    const user = results.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID);
    expect(user?.outcome).toBe("source-read-failed");
    expect(user?.state).toBe("failed");
    expect(user?.digestPrefix).toBeNull();
  });

  it("dedupes repeated attempts for the same digest via the ledger", async () => {
    let runnerCalls = 0;
    const ctx = context({
      runner: async () => {
        runnerCalls += 1;
        return {
          content: "same sources",
          sourceIds: [
            "m-1",
          ],
        };
      },
    });
    await refreshMentalModels(ctx);
    // Force a re-run with the same digest but no committed projection file:
    // the ledger must block the duplicate attempt.
    const target = mentalModelProjectionPath(
      ctx.dataDir,
      {
        key: "global",
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    ) as string;
    rmSync(target, {
      force: true,
    });
    const again = await refreshMentalModels(ctx);
    expect(
      again.find((entry) => entry.definitionId === USER_WORKING_STYLE_ID)?.outcome,
    ).toBe("already-attempted");
    expect(runnerCalls).toBe(1);
  });
});
