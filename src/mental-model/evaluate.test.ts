import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { BankMemoryRow, BankStateReader } from "../markdown-export/bank-state.js";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  MENTAL_MODEL_DEFINITIONS,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./definitions.js";
import { evaluateMentalModels, summarizeMentalModelStates } from "./evaluate.js";
import { createMentalModelSourceMemo } from "./memo.js";
import { mentalModelProjectionPath, resolveMentalModelOwner } from "./owner.js";
import { readMentalModelSources } from "./sources.js";
import { writeMentalModelProjection } from "./store.js";
import type {
  MentalModelDefinition,
  MentalModelProjection,
  MentalModelState,
} from "./types.js";

const PROJECT_BANK = "project-p-aaaaaaaaaaaa";
const AT = "2026-09-21T00:00:00.000Z";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, {
      force: true,
      recursive: true,
    });
});

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-evaluate-"));
  temporaryDirectories.push(directory);
  return directory;
}

function definition(id: string): MentalModelDefinition {
  const found = mentalModelDefinition(id);
  if (!found) throw new Error(`missing definition ${id}`);
  return found;
}

function sourceRow(overrides: Partial<BankMemoryRow> = {}): BankMemoryRow {
  return {
    bank: "default",
    content: "prefers one-line summaries",
    id: "m-1",
    source:
      "kind=global_preference;ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=session:s1#42",
    ...overrides,
  };
}

/** Counting bank reader so the tests can prove a read never happened. */
function reader(
  rows: BankMemoryRow[] = [
    sourceRow(),
  ],
): {
  calls: number;
  read: BankStateReader;
} {
  const state = {
    calls: 0,
    read: (async () => {
      state.calls += 1;
      return {
        ok: true as const,
        banks: [
          "default",
        ],
        rows,
      };
    }) as BankStateReader,
  };
  return state;
}

function options(
  dir: string,
  overrides: {
    definitions?: readonly MentalModelDefinition[];
    isDefinitionEnabled?: (definitionId: string) => boolean;
    projectBank?: string | null;
    read?: BankStateReader;
    sessionId?: string;
  } = {},
) {
  return {
    dataDir: dir,
    definitions: overrides.definitions ?? MENTAL_MODEL_DEFINITIONS,
    isDefinitionEnabled: overrides.isDefinitionEnabled ?? (() => true),
    memo: createMentalModelSourceMemo(),
    projectBank: overrides.projectBank === undefined ? null : overrides.projectBank,
    read: overrides.read ?? reader().read,
    sessionId: overrides.sessionId ?? "session-a",
  };
}

/** A projection record whose digest matches the selected sources, so it is fresh. */
async function freshProjection(
  dir: string,
  target: MentalModelDefinition,
  overrides: Partial<MentalModelProjection> = {},
): Promise<MentalModelProjection> {
  const owner = resolveMentalModelOwner(
    target,
    target.scope === "project" ? PROJECT_BANK : null,
  );
  if (!owner) throw new Error("no owner");
  const read = await readMentalModelSources({
    bank: owner.scope === "global" ? "default" : PROJECT_BANK,
    dataDir: dir,
    definition: target,
    owner,
    read: reader(
      owner.scope === "project"
        ? [
            sourceRow({
              bank: PROJECT_BANK,
              content: "generated state stays out of T1",
              id: "m-9",
              source:
                "kind=project_decision;ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=session:s1#7",
            }),
          ]
        : [
            sourceRow(),
          ],
    ).read,
  });
  if (!read.ok) throw new Error("source read failed");
  return {
    content: "A standing answer.",
    definitionId: target.id,
    definitionVersion: target.version,
    generatedAt: AT,
    generator: {},
    ownerKey: owner.key,
    refreshedAt: AT,
    scope: owner.scope,
    sourceBoundary: 42,
    sourceDigest: read.evaluation.digest,
    sourceIds: read.evaluation.rows.map((row) => row.id),
    version: 1,
    lastAttempt: {
      at: AT,
      outcome: "refreshed",
    },
    ...overrides,
  };
}

function writeProjection(
  dir: string,
  target: MentalModelDefinition,
  record: MentalModelProjection,
  projectBank: string | null = null,
): void {
  const owner = resolveMentalModelOwner(target, projectBank);
  if (!owner) throw new Error("no owner");
  const path = mentalModelProjectionPath(dir, owner, target.id);
  if (!path) throw new Error("no path");
  const write = writeMentalModelProjection(path, record);
  if (!write.ok) throw new Error(`write failed: ${write.reason}`);
}

function states(
  evaluations: Awaited<ReturnType<typeof evaluateMentalModels>>,
): Record<string, MentalModelState> {
  return Object.fromEntries(
    evaluations.map((entry) => [
      entry.definition.id,
      entry.freshness.state,
    ]),
  );
}

describe("mental-model evaluation", () => {
  it("reports absent without reading the bank when no projection exists", async () => {
    const dir = dataDir();
    const state = reader([
      sourceRow(),
    ]);
    const evaluations = await evaluateMentalModels(
      options(dir, {
        read: state.read,
      }),
    );
    expect(states(evaluations)).toEqual({
      [USER_WORKING_STYLE_ID]: "absent",
    });
    // The project definition has no resolvable owner here, so it is skipped.
    expect(evaluations).toHaveLength(1);
    expect(state.calls).toBe(0);
  });

  it("reports fresh when the persisted digest matches the selected sources", async () => {
    const dir = dataDir();
    const target = definition(USER_WORKING_STYLE_ID);
    writeProjection(dir, target, await freshProjection(dir, target));
    const evaluations = await evaluateMentalModels(options(dir));
    expect(states(evaluations)).toEqual({
      [USER_WORKING_STYLE_ID]: "fresh",
    });
  });

  it("reports stale when an eligible source changed", async () => {
    const dir = dataDir();
    const target = definition(USER_WORKING_STYLE_ID);
    writeProjection(
      dir,
      target,
      await freshProjection(dir, target, {
        sourceDigest: "b".repeat(64),
      }),
    );
    const evaluations = await evaluateMentalModels(options(dir));
    expect(states(evaluations)).toEqual({
      [USER_WORKING_STYLE_ID]: "stale",
    });
  });

  it("reports stale after a definition version bump without a bank read", async () => {
    const dir = dataDir();
    const current = definition(USER_WORKING_STYLE_ID);
    writeProjection(dir, current, await freshProjection(dir, current));
    const state = reader();
    const evaluations = await evaluateMentalModels(
      options(dir, {
        read: state.read,
        // A definition version bump invalidates the persisted record.
        definitions: [
          {
            ...current,
            version: current.version + 1,
          },
        ],
      }),
    );
    expect(states(evaluations)).toEqual({
      [USER_WORKING_STYLE_ID]: "stale",
    });
    expect(state.calls).toBe(0);
  });

  it("reports disabled for a definition the configuration turned off", async () => {
    const dir = dataDir();
    const evaluations = await evaluateMentalModels(
      options(dir, {
        isDefinitionEnabled: (id) => id !== USER_WORKING_STYLE_ID,
      }),
    );
    expect(states(evaluations)).toEqual({
      [USER_WORKING_STYLE_ID]: "disabled",
    });
  });

  it("reports failed for an unreadable projection file", async () => {
    const dir = dataDir();
    const target = definition(USER_WORKING_STYLE_ID);
    const owner = resolveMentalModelOwner(target, null);
    if (!owner) throw new Error("no owner");
    const path = mentalModelProjectionPath(dir, owner, target.id);
    if (!path) throw new Error("no path");
    mkdirSync(dirname(path), {
      recursive: true,
    });
    writeFileSync(path, "{not json");
    const evaluations = await evaluateMentalModels(options(dir));
    expect(states(evaluations)).toEqual({
      [USER_WORKING_STYLE_ID]: "failed",
    });
    // An unreadable projection is a bounded read failure: the fail-closed
    // verdict is `failed`, never `fresh` and never `absent`.
    expect(evaluations[0]?.freshness.reason).toBe("source-read-failed");
  });

  it("resolves the project owner only with a recognized project identity", async () => {
    const dir = dataDir();
    const target = definition(ACTIVE_PROJECT_OPERATING_MODEL_ID);
    const project = reader([
      sourceRow({
        bank: PROJECT_BANK,
        id: "m-9",
        source:
          "kind=project_decision;ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=session:s1#7",
      }),
    ]);
    const evaluations = await evaluateMentalModels(
      options(dir, {
        projectBank: PROJECT_BANK,
        read: project.read,
      }),
    );
    // A fresh project record is required before the digest read matters; absent
    // is the honest state and the bank is not read for it.
    expect(evaluations.map((entry) => entry.owner.key)).toEqual([
      PROJECT_BANK,
      "global",
    ]);
    expect(project.calls).toBe(0);
    expect(target.scope).toBe("project");
  });

  it("reuses one memoized source read across repeated evaluations", async () => {
    const dir = dataDir();
    const target = definition(USER_WORKING_STYLE_ID);
    writeProjection(dir, target, await freshProjection(dir, target));
    const state = reader();
    const shared = {
      ...options(dir, {
        read: state.read,
      }),
      memo: createMentalModelSourceMemo(),
    };
    await evaluateMentalModels(shared);
    await evaluateMentalModels(shared);
    expect(state.calls).toBe(1);
  });

  it("counts every state and reports unresolvable owners as skipped", async () => {
    const dir = dataDir();
    const target = definition(USER_WORKING_STYLE_ID);
    writeProjection(dir, target, await freshProjection(dir, target));
    const evaluations = await evaluateMentalModels(options(dir));
    expect(
      summarizeMentalModelStates(evaluations, {
        definitions: MENTAL_MODEL_DEFINITIONS,
      }),
    ).toEqual({
      absent: 0,
      disabled: 0,
      failed: 0,
      fresh: 1,
      pending: 0,
      skipped: 1,
      stale: 0,
    });
  });
});
