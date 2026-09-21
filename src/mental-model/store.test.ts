import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./definitions.js";
import { mentalModelSourceDigest } from "./freshness.js";
import {
  MENTAL_MODEL_CORRUPT_REASON,
  parseMentalModelProjection,
  readMentalModelProjection,
  recordMentalModelFailure,
  writeMentalModelProjection,
} from "./store.js";
import {
  digestPrefix,
  type MentalModelDefinition,
  type MentalModelProjection,
  type MentalModelSourceRow,
} from "./types.js";

const temporaryDirectories: string[] = [];

function temporaryPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-projection-"));
  temporaryDirectories.push(directory);
  return join(directory, "projection.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

function userStyleDefinition(): MentalModelDefinition {
  return mentalModelDefinition(USER_WORKING_STYLE_ID) as MentalModelDefinition;
}

function committedProjection(
  overrides: Partial<MentalModelProjection> = {},
): MentalModelProjection {
  const definition = userStyleDefinition();
  return {
    content: "The user prefers one-line summaries.",
    definitionId: definition.id,
    definitionVersion: definition.version,
    generatedAt: "2026-09-21T00:00:00.000Z",
    ownerKey: "global",
    refreshedAt: "2026-09-21T00:00:01.000Z",
    scope: "global",
    sourceBoundary: 42,
    sourceDigest: "a".repeat(64),
    version: 1,
    generator: {
      model: "session-model",
      policyVersion: "memory-boundary-v1",
      provider: "session",
    },
    lastAttempt: {
      at: "2026-09-21T00:00:01.000Z",
      outcome: "refreshed",
    },
    sourceIds: [
      "m-1",
      "m-2",
    ],
    ...overrides,
  };
}

function stored(path: string): MentalModelProjection {
  const read = readMentalModelProjection(path);
  expect(read.ok).toBe(true);
  if (!read.ok || read.projection === null) throw new Error("expected a projection");
  return read.projection;
}

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const SOURCE_ROWS: readonly MentalModelSourceRow[] = [
  {
    bank: "default",
    content: "one-line summaries",
    id: "m-1",
    kind: "global_preference",
    scope: "global",
  },
  {
    bank: "default",
    content: "skip tool output",
    id: "m-2",
    kind: "global_workflow",
    scope: "global",
  },
];

describe("projection persistence", () => {
  it("round-trips a committed projection atomically", () => {
    const path = temporaryPath();
    const projection = committedProjection();
    expect(writeMentalModelProjection(path, projection)).toEqual({
      ok: true,
    });
    expect(readMentalModelProjection(path)).toEqual({
      ok: true,
      projection,
    });
    // The record on disk is strict JSON with a digest, never a body dump.
    expect(readFileSync(path, "utf8")).toContain('"sourceDigest"');
  });

  it("reports a missing file as absent, not as a failure", () => {
    expect(readMentalModelProjection(temporaryPath())).toEqual({
      ok: true,
      projection: null,
    });
  });

  it("fails closed on a corrupt, truncated, or mis-owned file", () => {
    const path = temporaryPath();
    writeFileSync(path, "{ not json");
    expect(readMentalModelProjection(path)).toEqual({
      ok: false,
      reason: MENTAL_MODEL_CORRUPT_REASON,
    });
    // A valid JSON file with the wrong shape is equally unreadable.
    writeFileSync(
      path,
      JSON.stringify({
        content: "nope",
      }),
    );
    expect(readMentalModelProjection(path).ok).toBe(false);
    // A record whose ownerKey claims another owner is rejected too.
    writeFileSync(
      path,
      JSON.stringify(
        committedProjection({
          ownerKey: "project-p-aaaaaaaaaaaa",
        }),
      ),
    );
    expect(readMentalModelProjection(path).ok).toBe(false);
  });

  it("rejects oversized content and source ids", () => {
    expect(
      parseMentalModelProjection(
        committedProjection({
          content: "x".repeat(4_001),
        }),
      ),
    ).toBeNull();
    expect(
      parseMentalModelProjection(
        committedProjection({
          sourceIds: Array.from(
            {
              length: 33,
            },
            (_, index) => `m-${index}`,
          ),
        }),
      ),
    ).toBeNull();
  });

  it("rejects unknown failure categories and refresh outcomes", () => {
    expect(
      parseMentalModelProjection({
        ...committedProjection(),
        lastAttempt: {
          at: "2026-09-21T00:00:00.000Z",
          failure: "not-a-category",
          outcome: "failed",
        },
      }),
    ).toBeNull();
    expect(
      parseMentalModelProjection({
        ...committedProjection(),
        lastAttempt: {
          at: "2026-09-21T00:00:00.000Z",
          outcome: "synced",
        },
      }),
    ).toBeNull();
  });

  it("rejects a payload on a record that never succeeded", () => {
    const neverSucceeded = committedProjection({
      content: "",
      refreshedAt: null,
      sourceBoundary: null,
      sourceDigest: "",
      sourceIds: [],
    });
    expect(parseMentalModelProjection(neverSucceeded)).not.toBeNull();
    expect(
      parseMentalModelProjection({
        ...neverSucceeded,
        content: "authoritative-looking text",
      }),
    ).toBeNull();
    expect(
      parseMentalModelProjection({
        ...neverSucceeded,
        sourceIds: [
          "m-1",
        ],
      }),
    ).toBeNull();
    // A successful digest without a refresh time is inconsistent too.
    expect(
      parseMentalModelProjection(
        committedProjection({
          refreshedAt: null,
        }),
      ),
    ).toBeNull();
  });

  it("preserves the last successful payload when a refresh fails", () => {
    const path = temporaryPath();
    const projection = committedProjection();
    expect(writeMentalModelProjection(path, projection).ok).toBe(true);

    expect(
      recordMentalModelFailure(path, {
        at: "2026-09-21T00:00:02.000Z",
        category: "runner-unavailable",
        definition: userStyleDefinition(),
        ownerKey: "global",
        scope: "global",
      }),
    ).toEqual({
      ok: true,
    });

    const record = stored(path);
    // Content, digest, boundary and source refs all survive untouched.
    expect(record.content).toBe(projection.content);
    expect(record.sourceDigest).toBe(projection.sourceDigest);
    expect(record.sourceBoundary).toBe(42);
    expect(record.sourceIds).toEqual([
      "m-1",
      "m-2",
    ]);
    expect(record.refreshedAt).toBe(projection.refreshedAt);
    // The failure is observable, bounded, and body-free.
    expect(record.lastAttempt).toEqual({
      at: "2026-09-21T00:00:02.000Z",
      failure: "runner-unavailable",
      outcome: "failed",
    });
  });

  it("records a first failure without inventing an authoritative payload", () => {
    const path = temporaryPath();
    expect(
      recordMentalModelFailure(path, {
        at: "2026-09-21T00:00:00.000Z",
        category: "timed-out",
        definition: userStyleDefinition(),
        ownerKey: "global",
        scope: "global",
      }),
    ).toEqual({
      ok: true,
    });
    const record = stored(path);
    expect(record.content).toBe("");
    expect(record.sourceDigest).toBe("");
    expect(record.sourceIds).toEqual([]);
    expect(record.refreshedAt).toBeNull();
    expect(record.lastAttempt.failure).toBe("timed-out");
  });

  it("keeps the digest stable across identical rows and detects every change", () => {
    const definition = userStyleDefinition();
    const base = mentalModelSourceDigest(definition, SOURCE_ROWS);
    expect(base).toMatch(DIGEST_PATTERN);
    expect(mentalModelSourceDigest(definition, SOURCE_ROWS)).toBe(base);
    // Ordering is canonical: shuffled input gives the same digest.
    expect(
      mentalModelSourceDigest(definition, [
        SOURCE_ROWS[1] as MentalModelSourceRow,
        SOURCE_ROWS[0] as MentalModelSourceRow,
      ]),
    ).toBe(base);
    // Content and deletion both invalidate.
    expect(
      mentalModelSourceDigest(definition, [
        {
          ...(SOURCE_ROWS[0] as MentalModelSourceRow),
          content: "edited",
        },
        SOURCE_ROWS[1] as MentalModelSourceRow,
      ]),
    ).not.toBe(base);
    expect(
      mentalModelSourceDigest(definition, [
        SOURCE_ROWS[0] as MentalModelSourceRow,
      ]),
    ).not.toBe(base);
    // A definition version bump invalidates even identical rows.
    expect(
      mentalModelSourceDigest(
        {
          ...definition,
          version: 2,
        },
        SOURCE_ROWS,
      ),
    ).not.toBe(base);
    // Timestamps do not participate: re-typing the same content stays stable.
    expect(
      mentalModelSourceDigest(definition, [
        {
          ...(SOURCE_ROWS[0] as MentalModelSourceRow),
          timestamp: "2026-09-22T00:00:00.000Z",
        },
        SOURCE_ROWS[1] as MentalModelSourceRow,
      ]),
    ).toBe(base);
  });

  it("exposes only a bounded digest prefix to diagnostics", () => {
    const digest = mentalModelSourceDigest(userStyleDefinition(), SOURCE_ROWS);
    expect(digestPrefix(digest)).toHaveLength(12);
    expect(digestPrefix(digest)).toBe(digest.slice(0, 12));
  });

  it("an interrupted write leaves the old record readable", () => {
    const path = temporaryPath();
    const first = committedProjection();
    expect(writeMentalModelProjection(path, first).ok).toBe(true);
    // A leftover temp file from a crashed writer must never shadow the record.
    writeFileSync(`${path}.tmp`, "partial garbage");
    expect(existsSync(`${path}.tmp`)).toBe(true);
    expect(stored(path).content).toBe(first.content);
  });

  it("rejects a write of a record the reader would reject", () => {
    const path = temporaryPath();
    const bad = committedProjection({
      definitionVersion: -1,
    });
    expect(writeMentalModelProjection(path, bad)).toEqual({
      ok: false,
      reason: "projection-write-failed",
    });
    expect(existsSync(path)).toBe(false);
  });

  it("stores the project definition under its project owner key", () => {
    const path = temporaryPath();
    const definition = mentalModelDefinition(
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    ) as MentalModelDefinition;
    expect(
      writeMentalModelProjection(
        path,
        committedProjection({
          definitionId: definition.id,
          definitionVersion: definition.version,
          generator: {},
          ownerKey: "project-p-cccccccccccc",
          scope: "project",
        }),
      ).ok,
    ).toBe(true);
    const record = stored(path);
    expect(record.ownerKey).toBe("project-p-cccccccccccc");
    expect(record.scope).toBe("project");
  });
});
