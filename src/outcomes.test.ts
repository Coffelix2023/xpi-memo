import { describe, expect, it } from "vitest";

import {
  describeOutcome,
  isMemoryOutcome,
  isReasonCodeForOutcome,
  KNOWN_REASON_CODES,
  MEMORY_OUTCOMES,
  OUTCOME_REASON_CODES,
  requiresReasonCode,
} from "./outcomes.js";

describe("memory outcome contract", () => {
  it("recognizes exactly the eight outcome states", () => {
    expect(MEMORY_OUTCOMES).toEqual([
      "stored",
      "candidate",
      "rejected",
      "skipped",
      "degraded",
      "unavailable",
      "routing_rejected",
      "SLEEP_DISABLED",
    ]);
    expect(new Set(MEMORY_OUTCOMES).size).toBe(MEMORY_OUTCOMES.length);
    for (const outcome of MEMORY_OUTCOMES) {
      expect(isMemoryOutcome(outcome)).toBe(true);
    }
    expect(isMemoryOutcome("stored-extra")).toBe(false);
    expect(isMemoryOutcome("unknown")).toBe(false);
  });

  it("registers every static allowed reason code", () => {
    for (const allowed of Object.values(OUTCOME_REASON_CODES).flat()) {
      if (allowed !== "prohibited-content:*") {
        expect(KNOWN_REASON_CODES).toContain(allowed);
      }
    }
  });

  it("requires a bounded reason for every failure state", () => {
    for (const outcome of [
      "rejected",
      "skipped",
      "degraded",
      "unavailable",
      "routing_rejected",
      "SLEEP_DISABLED",
    ] as const) {
      expect(requiresReasonCode(outcome)).toBe(true);
      expect(OUTCOME_REASON_CODES[outcome].length).toBeGreaterThan(0);
    }
    for (const outcome of [
      "stored",
      "candidate",
    ] as const) {
      expect(requiresReasonCode(outcome)).toBe(false);
      expect(OUTCOME_REASON_CODES[outcome]).toEqual([]);
    }
  });

  it("accepts exact reason codes for their outcome", () => {
    expect(
      isReasonCodeForOutcome("routing_rejected", "project-identity-required"),
    ).toBe(true);
    expect(isReasonCodeForOutcome("rejected", "paused")).toBe(true);
    expect(isReasonCodeForOutcome("skipped", "duplicate-content")).toBe(true);
    expect(isReasonCodeForOutcome("SLEEP_DISABLED", "sleep-disabled-by-default")).toBe(
      true,
    );
    expect(isReasonCodeForOutcome("unavailable", "no-search-backend")).toBe(true);
  });

  it("accepts dynamic prohibited-content codes only where allowed", () => {
    expect(isReasonCodeForOutcome("rejected", "prohibited-content:secret")).toBe(true);
    expect(isReasonCodeForOutcome("rejected", "prohibited-content:raw-l0-event")).toBe(
      true,
    );
    // not allowed on other outcomes
    expect(isReasonCodeForOutcome("skipped", "prohibited-content:secret")).toBe(false);
    expect(
      isReasonCodeForOutcome("routing_rejected", "prohibited-content:secret"),
    ).toBe(false);
  });

  it("rejects codes from the wrong outcome", () => {
    expect(isReasonCodeForOutcome("rejected", "duplicate-content")).toBe(false);
    expect(isReasonCodeForOutcome("skipped", "project-bank-unavailable")).toBe(false);
    expect(isReasonCodeForOutcome("routing_rejected", "paused")).toBe(false);
    expect(isReasonCodeForOutcome("SLEEP_DISABLED", "no-search-backend")).toBe(false);
  });

  it("gives every outcome a bounded human-readable summary", () => {
    for (const outcome of MEMORY_OUTCOMES) {
      const summary = describeOutcome(outcome);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThan(60);
    }
  });
});
