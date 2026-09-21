import { describe, expect, it } from "vitest";

import {
  MENTAL_MODEL_AUDIT_ACTION,
  mentalModelInjectedRecord,
  mentalModelOutcomeStatus,
  mentalModelRefreshRecord,
  summarizeMentalModelAudit,
} from "./observability.js";
import type { MentalModelRefreshOutcome, MentalModelRefreshResult } from "./types.js";
import { MENTAL_MODEL_REFRESH_OUTCOMES } from "./types.js";

function refreshResult(outcome: MentalModelRefreshOutcome): MentalModelRefreshResult {
  return {
    definitionId: "user-working-style",
    digestPrefix: "aaaaaaaaaaaa",
    durationMs: 12,
    outcome,
    outputChars: 0,
    ownerKey: "global",
    scope: "global",
    sourceBoundary: 42,
    sourceCount: 2,
    state: "stale",
  };
}

describe("mental-model lifecycle records", () => {
  it("groups every closed outcome into a status an operator can act on", () => {
    for (const outcome of MENTAL_MODEL_REFRESH_OUTCOMES) {
      const status = mentalModelOutcomeStatus(outcome);
      if (outcome === "refreshed") expect(status).toBe("refreshed");
      else
        expect([
          "failed",
          "skipped",
        ]).toContain(status);
    }
    expect(mentalModelOutcomeStatus("safety-refused")).toBe("failed");
    expect(mentalModelOutcomeStatus("synthesis-disabled")).toBe("skipped");
    expect(mentalModelOutcomeStatus("no-refresh-needed")).toBe("skipped");
  });

  it("builds a refresh record that omits unknown digest/boundary values", () => {
    const record = mentalModelRefreshRecord(
      {
        ...refreshResult("source-read-failed"),
        digestPrefix: null,
        sourceBoundary: null,
      },
      "session_shutdown",
    );
    expect(record.digestPrefix).toBeUndefined();
    expect(record.sourceBoundary).toBeUndefined();
    expect(record.status).toBe("failed");
    expect(record.trigger).toBe("session_shutdown");
  });

  it("counts refreshes, injections, and omissions from the audit tail", () => {
    const summary = summarizeMentalModelAudit([
      {
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: mentalModelRefreshRecord(
          refreshResult("refreshed"),
          "session_shutdown",
        ),
      },
      {
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: mentalModelRefreshRecord(
          refreshResult("runner-unavailable"),
          "session_before_compact",
        ),
      },
      {
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: mentalModelInjectedRecord({
          chars: 40,
          injectedCount: 1,
          omittedCount: 2,
          policyVersion: "memory-boundary-v1",
          definitionIds: [
            "user-working-style",
          ],
          ownerKeys: [
            "global",
          ],
          reasons: [
            "stale",
            "over-budget",
          ],
        }),
      },
      // An unrelated action is never counted, and an injected decision that
      // injected nothing is a skip rather than a delivered projection.
      {
        action: "recall",
        metadata: {},
      },
    ]);
    expect(summary.injectedDecisions).toBe(1);
    expect(summary.injectedChars).toBe(40);
    expect(summary.omitted).toBe(2);
    expect(summary.outcomes).toEqual({
      refreshed: 1,
      "runner-unavailable": 1,
    });
    expect(summary.recent).toHaveLength(2);
  });

  it("bounds the recent tail and ignores malformed entries", () => {
    const entries = Array.from(
      {
        length: 9,
      },
      (_, index) => ({
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: {
          ...mentalModelRefreshRecord(
            refreshResult("no-refresh-needed"),
            "session_shutdown",
          ),
          definitionId: `definition-${index}`,
        },
      }),
    );
    const summary = summarizeMentalModelAudit([
      ...entries,
      {
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: {
          outcome: "not-a-real-outcome",
        },
      },
      {
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: {},
      },
    ]);
    expect(summary.outcomes["no-refresh-needed"]).toBe(9);
    expect(summary.recent).toHaveLength(5);
    expect(summary.recent[4]?.definitionId).toBe("definition-8");
  });

  it("clamps negative counters instead of reporting them", () => {
    const summary = summarizeMentalModelAudit([
      {
        action: MENTAL_MODEL_AUDIT_ACTION,
        metadata: mentalModelInjectedRecord({
          chars: -10,
          definitionIds: [],
          injectedCount: 0,
          omittedCount: -3,
          ownerKeys: [],
          policyVersion: "memory-boundary-v1",
          reasons: [],
        }),
      },
    ]);
    expect(summary.injectedChars).toBe(0);
    expect(summary.omitted).toBe(0);
    expect(summary.injectedDecisions).toBe(0);
  });
});
