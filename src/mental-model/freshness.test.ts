import { describe, expect, it } from "vitest";
import { mentalModelDefinition, USER_WORKING_STYLE_ID } from "./definitions.js";
import {
  deriveMentalModelState,
  isMentalModelRefreshEligible,
  mentalModelFreshness,
} from "./freshness.js";
import type {
  MentalModelDefinition,
  MentalModelProjection,
  MentalModelSourceEvaluation,
} from "./types.js";

const definition = mentalModelDefinition(
  USER_WORKING_STYLE_ID,
) as MentalModelDefinition;

function projection(
  overrides: Partial<MentalModelProjection> = {},
): MentalModelProjection {
  return {
    content: "The user prefers one-line summaries.",
    definitionId: definition.id,
    definitionVersion: definition.version,
    generatedAt: "2026-09-21T00:00:00.000Z",
    generator: {},
    ownerKey: "global",
    refreshedAt: "2026-09-21T00:00:01.000Z",
    scope: "global",
    sourceBoundary: 42,
    sourceDigest: "b".repeat(64),
    version: 1,
    lastAttempt: {
      at: "2026-09-21T00:00:01.000Z",
      outcome: "refreshed",
    },
    sourceIds: [
      "m-1",
    ],
    ...overrides,
  };
}

function evaluation(digest: string, sourceCount = 2): MentalModelSourceEvaluation {
  return {
    boundary: 42,
    digest,
    rows: Array.from(
      {
        length: sourceCount,
      },
      (_, index) => ({
        bank: "default",
        content: `fact ${index}`,
        id: `m-${index}`,
        kind: "global_preference" as const,
        scope: "global" as const,
      }),
    ),
  };
}

const CURRENT = "a".repeat(64);

function state(
  input: Partial<Parameters<typeof deriveMentalModelState>[0]>,
): ReturnType<typeof deriveMentalModelState> {
  return deriveMentalModelState({
    definition,
    enabled: true,
    projection: null,
    readFailed: false,
    sourceDigest: CURRENT,
    ...input,
  });
}

describe("deterministic freshness", () => {
  it("reports disabled before anything else", () => {
    expect(
      state({
        enabled: false,
      }),
    ).toBe("disabled");
  });

  it("fails closed when the source state cannot be read", () => {
    expect(
      state({
        readFailed: true,
      }),
    ).toBe("failed");
    expect(
      state({
        sourceDigest: null,
      }),
    ).toBe("failed");
    // An existing fresh projection is still not declared fresh on a bad read.
    expect(
      state({
        projection: projection({
          sourceDigest: CURRENT,
        }),
        readFailed: true,
      }),
    ).toBe("failed");
  });

  it("reports absent before the first successful refresh", () => {
    expect(state({})).toBe("absent");
    // A failure-only record is observable as failed, not absent.
    expect(
      state({
        projection: projection({
          content: "",
          refreshedAt: null,
          sourceBoundary: null,
          sourceDigest: "",
          sourceIds: [],
        }),
      }),
    ).toBe("absent");
  });

  it("reports stale when no successful payload exists after a failed attempt", () => {
    expect(
      state({
        projection: projection({
          content: "",
          refreshedAt: null,
          sourceBoundary: null,
          sourceDigest: "",
          sourceIds: [],
          lastAttempt: {
            at: "2026-09-21T00:00:02.000Z",
            failure: "timed-out",
            outcome: "failed",
          },
        }),
      }),
    ).toBe("failed");
  });

  it("reports stale on digest and definition-version changes", () => {
    expect(
      state({
        projection: projection(),
      }),
    ).toBe("stale");
    expect(
      state({
        projection: projection({
          sourceDigest: CURRENT,
        }),
      }),
    ).toBe("fresh");
    // A definition version bump invalidates a projection built under the
    // older version, even when its digest would otherwise match.
    expect(
      state({
        projection: projection({
          sourceDigest: CURRENT,
        }),
        definition: {
          ...definition,
          version: 2,
        },
      }),
    ).toBe("stale");
    // A digest that matches but a boundary that differs is still fresh: the
    // digest, not the watermark, is the freshness authority.
    expect(
      state({
        projection: projection({
          sourceBoundary: 7,
          sourceDigest: CURRENT,
        }),
      }),
    ).toBe("fresh");
  });

  it("keeps unrelated definitions and owners untouched", () => {
    // One definition's staleness never touches another definition's state.
    const projectDefinition = mentalModelDefinition(
      "active-project-operating-model",
    ) as MentalModelDefinition;
    expect(
      deriveMentalModelState({
        definition: projectDefinition,
        enabled: true,
        projection: null,
        readFailed: false,
        sourceDigest: "c".repeat(64),
      }),
    ).toBe("absent");
    expect(
      state({
        projection: projection({
          sourceDigest: CURRENT,
        }),
      }),
    ).toBe("fresh");
  });

  it("only eligible states may trigger a refresh", () => {
    expect(isMentalModelRefreshEligible("absent")).toBe(true);
    expect(isMentalModelRefreshEligible("stale")).toBe(true);
    expect(isMentalModelRefreshEligible("failed")).toBe(true);
    expect(isMentalModelRefreshEligible("fresh")).toBe(false);
    expect(isMentalModelRefreshEligible("disabled")).toBe(false);
    expect(isMentalModelRefreshEligible("pending")).toBe(false);
  });

  it("assembles a bounded, body-free freshness verdict", () => {
    const freshness = mentalModelFreshness({
      definition,
      enabled: true,
      evaluation: evaluation(CURRENT, 2),
      projection: projection({
        sourceDigest: CURRENT,
      }),
      readFailed: false,
      sourceDigest: CURRENT,
      owner: {
        key: "global",
        scope: "global",
      },
    });
    expect(freshness).toEqual({
      definitionId: USER_WORKING_STYLE_ID,
      digestPrefix: CURRENT.slice(0, 12),
      ownerKey: "global",
      persistedAt: "2026-09-21T00:00:01.000Z",
      scope: "global",
      sourceCount: 2,
      state: "fresh",
    });
    const failed = mentalModelFreshness({
      definition,
      enabled: true,
      evaluation: null,
      projection: null,
      readFailed: true,
      sourceDigest: null,
      owner: {
        key: "global",
        scope: "global",
      },
    });
    expect(failed.state).toBe("failed");
    expect(failed.reason).toBe("source-read-failed");
    expect(failed.digestPrefix).toBeNull();
  });
});
