import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { BankMemoryRow, BankStateReader } from "../markdown-export/bank-state.js";
import type { ExactMemoryReader } from "../operations.js";
import { mentalModelDefinition, USER_WORKING_STYLE_ID } from "./definitions.js";
import { mentalModelProjectionPath, resolveMentalModelOwner } from "./owner.js";
import { writeMentalModelProjection } from "./store.js";
import {
  formatMentalModelTrace,
  MAX_TRACED_SOURCES,
  traceMentalModelProjection,
} from "./trace.js";
import type { MentalModelDefinition } from "./types.js";

const AT = "2026-09-21T00:00:00.000Z";
const SOURCE_ID = "memory-1";
const SOURCE_BODY = "private source body that must never be traced";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, {
      force: true,
      recursive: true,
    });
});

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-trace-"));
  temporaryDirectories.push(directory);
  return directory;
}

function definition(): MentalModelDefinition {
  const found = mentalModelDefinition(USER_WORKING_STYLE_ID);
  if (!found) throw new Error("missing definition");
  return found;
}

function bankReader(rows: BankMemoryRow[] = []): BankStateReader {
  return async () => ({
    ok: true,
    banks: [
      "default",
    ],
    rows,
  });
}

/** Seed a projection whose source ids are `sourceIds`. */
function seedProjection(dir: string, sourceIds: string[]): void {
  const target = definition();
  const owner = resolveMentalModelOwner(target, null);
  if (!owner) throw new Error("no owner");
  const path = mentalModelProjectionPath(dir, owner, target.id);
  if (!path) throw new Error("no path");
  mkdirSync(dirname(path), {
    recursive: true,
  });
  const write = writeMentalModelProjection(path, {
    content: "A generated standing answer.",
    definitionId: target.id,
    definitionVersion: target.version,
    generatedAt: AT,
    generator: {},
    ownerKey: owner.key,
    refreshedAt: AT,
    scope: owner.scope,
    sourceBoundary: 42,
    sourceDigest: "b".repeat(64),
    lastAttempt: {
      at: AT,
      outcome: "refreshed",
    },
    sourceIds,
    version: 1,
  });
  if (!write.ok) throw new Error(`write failed: ${write.reason}`);
}

function options(
  dir: string,
  overrides: Partial<Parameters<typeof traceMentalModelProjection>[0]> = {},
) {
  return {
    dataDir: dir,
    definition: definition(),
    exactIdReadAvailable: true,
    projectBank: null,
    read: bankReader(),
    isDefinitionEnabled: () => true,
    ...overrides,
  };
}

describe("mental-model projection trace", () => {
  it("resolves each source id without ever returning a body", async () => {
    const dir = dataDir();
    seedProjection(dir, [
      SOURCE_ID,
    ]);
    const trace = await traceMentalModelProjection(
      options(dir, {
        readMemoryById: (async (id) => ({
          bank: "default",
          content: SOURCE_BODY,
          id,
          kind: "global_preference",
          scope: "global",
        })) as ExactMemoryReader,
      }),
    );
    expect(trace?.classification).toBe("derived");
    expect(trace?.sources).toEqual([
      {
        id: SOURCE_ID,
        kind: "global_preference",
        resolution: "resolved",
        scope: "global",
      },
    ]);
    const rendered = formatMentalModelTrace(trace as NonNullable<typeof trace>);
    expect(rendered).toContain("Mental model (derived): user-working-style");
    expect(rendered).toContain(`- ${SOURCE_ID} [global_preference, global] resolved`);
    expect(rendered).not.toContain(SOURCE_BODY);
  });

  it("reports a missing source row as missing, not as unavailable", async () => {
    const dir = dataDir();
    seedProjection(dir, [
      SOURCE_ID,
    ]);
    const trace = await traceMentalModelProjection(
      options(dir, {
        readMemoryById: (async () => null) as ExactMemoryReader,
      }),
    );
    expect(trace?.sources[0]?.resolution).toBe("missing");
    expect(trace?.sources[0]?.kind).toBeUndefined();
  });

  it("degrades to unavailable without a capability and never reads", async () => {
    const dir = dataDir();
    seedProjection(dir, [
      SOURCE_ID,
    ]);
    let reads = 0;
    const trace = await traceMentalModelProjection(
      options(dir, {
        exactIdReadAvailable: false,
        readMemoryById: (async (id) => {
          reads += 1;
          return {
            bank: "default",
            content: SOURCE_BODY,
            id,
            kind: "global_preference",
            scope: "global",
          };
        }) as ExactMemoryReader,
      }),
    );
    expect(trace?.sources[0]?.resolution).toBe("unavailable");
    expect(reads).toBe(0);
    expect(formatMentalModelTrace(trace as NonNullable<typeof trace>)).toContain(
      "derived; bodies are never shown",
    );
  });

  it("treats a throwing read as unavailable, not as a missing row", async () => {
    const dir = dataDir();
    seedProjection(dir, [
      SOURCE_ID,
    ]);
    const trace = await traceMentalModelProjection(
      options(dir, {
        readMemoryById: (async () => {
          throw new Error("upstream failure");
        }) as ExactMemoryReader,
      }),
    );
    expect(trace?.sources[0]?.resolution).toBe("unavailable");
  });

  it("bounds the reported sources and says so", async () => {
    const dir = dataDir();
    seedProjection(
      dir,
      Array.from(
        {
          length: MAX_TRACED_SOURCES + 3,
        },
        (_, index) => `memory-${index}`,
      ),
    );
    const trace = await traceMentalModelProjection(
      options(dir, {
        readMemoryById: (async (id) => ({
          bank: "default",
          content: "body",
          id,
          kind: "global_preference",
          scope: "global",
        })) as ExactMemoryReader,
      }),
    );
    expect(trace?.sources).toHaveLength(MAX_TRACED_SOURCES);
    expect(trace?.sourceCount).toBe(MAX_TRACED_SOURCES + 3);
    expect(trace?.truncated).toBe(true);
    expect(formatMentalModelTrace(trace as NonNullable<typeof trace>)).toContain(
      "3 more not shown",
    );
  });

  it("traces an absent projection without inventing source rows", async () => {
    const dir = dataDir();
    const trace = await traceMentalModelProjection(options(dir));
    expect(trace?.state).toBe("absent");
    expect(trace?.sources).toEqual([]);
    expect(formatMentalModelTrace(trace as NonNullable<typeof trace>)).toContain(
      "nothing has been committed",
    );
  });

  it("returns null for a project definition without identity", async () => {
    const dir = dataDir();
    const project = mentalModelDefinition("active-project-operating-model");
    if (!project) throw new Error("missing definition");
    expect(
      await traceMentalModelProjection(
        options(dir, {
          definition: project,
          projectBank: null,
        }),
      ),
    ).toBeNull();
  });
});
