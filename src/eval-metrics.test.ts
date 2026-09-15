import { describe, expect, it } from "vitest";

import { buildEvaluationReport, computeBehaviorMetrics } from "./eval-metrics.js";

describe("bounded behavior metrics (task 5.2)", () => {
  it("computes six bounded metrics from fixture outcomes", () => {
    const metrics = computeBehaviorMetrics([
      {
        adopted: true,
        correctionSessions: null,
        falseMemory: false,
        id: "pref-survives",
        leaked: false,
        useful: true,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: 1,
        falseMemory: false,
        id: "correction",
        leaked: false,
        useful: false,
        userAware: true,
      },
      {
        adopted: false,
        correctionSessions: null,
        falseMemory: true,
        id: "candidate-as-fact",
        leaked: false,
        useful: false,
        userAware: true,
      },
    ]);

    expect(metrics).toEqual({
      correctionLatency: 1,
      falseMemoryRate: 1 / 3,
      memoryUtility: 1 / 3,
      preferenceAccuracy: 1 / 3,
      scopeLeakRate: 0,
      userAwareness: 1,
    });
  });

  it("keeps every metric in the 0..1 range and clamps latency", () => {
    const metrics = computeBehaviorMetrics([
      {
        adopted: true,
        correctionSessions: 250,
        falseMemory: true,
        id: "overrun",
        leaked: true,
        useful: true,
        userAware: false,
      },
    ]);

    expect(metrics.falseMemoryRate).toBe(1);
    expect(metrics.scopeLeakRate).toBe(1);
    expect(metrics.correctionLatency).toBe(99);
    expect(metrics.userAwareness).toBe(0);
  });

  it("returns zero rates and null latency for empty runs", () => {
    expect(computeBehaviorMetrics([])).toEqual({
      correctionLatency: null,
      falseMemoryRate: 0,
      memoryUtility: 0,
      preferenceAccuracy: 0,
      scopeLeakRate: 0,
      userAwareness: 0,
    });
  });

  it("reports backend availability separately from logic outcomes", () => {
    const withoutBackend = buildEvaluationReport(
      [
        {
          adopted: false,
          correctionSessions: null,
          falseMemory: false,
          id: "pref-survives",
          leaked: false,
          useful: false,
          userAware: false,
        },
      ],
      false,
    );
    expect(withoutBackend.backendAvailable).toBe(false);
    expect(withoutBackend.cases).toBe(1);

    const withBackend = buildEvaluationReport([], true);
    expect(withBackend.backendAvailable).toBe(true);
    expect(withBackend.metrics.preferenceAccuracy).toBe(0);
  });
});
