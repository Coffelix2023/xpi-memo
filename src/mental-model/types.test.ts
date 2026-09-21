import { describe, expect, it } from "vitest";
import { MEMORY_KINDS } from "../kinds.js";
import {
  DEFAULT_MENTAL_MODEL_TIMEOUT_MS,
  digestPrefix,
  isMentalModelFailureCategory,
  isMentalModelState,
  MENTAL_MODEL_BUDGETS,
  MENTAL_MODEL_FAILURE_CATEGORIES,
  MENTAL_MODEL_REFRESH_OUTCOMES,
  MENTAL_MODEL_STATES,
  type MentalModelProjection,
  type MentalModelRefreshOutcome,
  type MentalModelState,
} from "./types.js";

describe("mental-model domain types", () => {
  it("keeps the six freshness states closed", () => {
    expect(MENTAL_MODEL_STATES).toEqual([
      "absent",
      "fresh",
      "stale",
      "pending",
      "failed",
      "disabled",
    ]);
    for (const state of MENTAL_MODEL_STATES)
      expect(isMentalModelState(state)).toBe(true);
    expect(isMentalModelState("unknown")).toBe(false);
    expect(isMentalModelState("")).toBe(false);
  });

  it("rejects a state outside the union at compile time", () => {
    const known: MentalModelState = "fresh";
    expect(known).toBe("fresh");
    // @ts-expect-error — `unknown` is not one of the six states.
    const rejected: MentalModelState = "unknown";
    expect(rejected).toBe("unknown");
  });

  it("rejects an outcome outside the union at compile time", () => {
    const known: MentalModelRefreshOutcome = "refreshed";
    expect(known).toBe("refreshed");
    // @ts-expect-error — `synced` is not a refresh outcome.
    const rejected: MentalModelRefreshOutcome = "synced";
    expect(rejected).toBe("synced");
  });

  it("never adds a mental_model T1 kind", () => {
    expect(MEMORY_KINDS).not.toContain("mental_model");
    expect(MEMORY_KINDS).toHaveLength(7);
  });

  it("keeps failure categories and refresh outcomes distinct codes", () => {
    expect(new Set(MENTAL_MODEL_FAILURE_CATEGORIES).size).toBe(
      MENTAL_MODEL_FAILURE_CATEGORIES.length,
    );
    expect(new Set(MENTAL_MODEL_REFRESH_OUTCOMES).size).toBe(
      MENTAL_MODEL_REFRESH_OUTCOMES.length,
    );
    for (const category of MENTAL_MODEL_FAILURE_CATEGORIES)
      expect(isMentalModelFailureCategory(category)).toBe(true);
    expect(isMentalModelFailureCategory("boom")).toBe(false);
  });

  it("bounds every budget and truncates a digest prefix", () => {
    expect(MENTAL_MODEL_BUDGETS.maxSourceRows).toBeLessThanOrEqual(32);
    expect(MENTAL_MODEL_BUDGETS.maxSourceIds).toBeLessThanOrEqual(32);
    expect(MENTAL_MODEL_BUDGETS.maxSourceChars).toBeLessThanOrEqual(12_000);
    expect(MENTAL_MODEL_BUDGETS.maxGeneratedChars).toBeGreaterThan(0);
    expect(DEFAULT_MENTAL_MODEL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(digestPrefix("abcdef0123456789")).toBe("abcdef012345");
    expect(digestPrefix("")).toBeNull();
    expect(digestPrefix(null)).toBeNull();
  });

  it("accepts a failure-only record shape and a committed one", () => {
    const neverSucceeded: MentalModelProjection = {
      content: "",
      definitionId: "user-working-style",
      definitionVersion: 1,
      generatedAt: "2026-09-21T00:00:00.000Z",
      generator: {},
      ownerKey: "global",
      refreshedAt: null,
      scope: "global",
      sourceBoundary: null,
      sourceDigest: "",
      sourceIds: [],
      version: 1,
      lastAttempt: {
        at: "2026-09-21T00:00:01.000Z",
        failure: "runner-unavailable",
        outcome: "failed",
      },
    };
    const committed: MentalModelProjection = {
      ...neverSucceeded,
      content: "A bounded standing answer.",
      refreshedAt: "2026-09-21T00:00:02.000Z",
      sourceDigest: "a".repeat(64),
      lastAttempt: {
        at: "2026-09-21T00:00:02.000Z",
        outcome: "refreshed",
      },
      sourceIds: [
        "m-1",
      ],
    };
    expect(neverSucceeded.refreshedAt).toBeNull();
    expect(committed.sourceIds).toHaveLength(1);
  });
});
