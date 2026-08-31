import { describe, expect, it } from "vitest";

import { createEvidenceRecord } from "./evidence.ts";
import { type PromotionRequest, validatePromotion } from "./promotion-policy.ts";

describe("T1 cross-layer promotion policy", () => {
  function validRequest(overrides: Partial<PromotionRequest> = {}): PromotionRequest {
    return {
      content: "The project uses pnpm for package scripts.",
      evidence: createEvidenceRecord({
        confidence: 0.9,
        provenance: "l0:event-42",
        source: "reviewed session conclusion",
        type: "l0-conclusion",
      }),
      explicitPromotion: true,
      kind: "project_decision",
      reviewedConclusion: true,
      sourceLayer: "L0",
      targetLayer: "T1",
      targetScope: "global",
      userConfirmed: true,
      context: {
        dataDir: "/tmp/xpi-memo-promotion",
        projectBank: "project-p-0123456789ab",
      },
      ...overrides,
    };
  }

  it("accepts an explicitly reviewed L0 conclusion with deterministic target routing", () => {
    expect(validatePromotion(validRequest())).toEqual({
      accepted: true,
      targetBank: "project-p-0123456789ab",
      targetKind: "project_decision",
      targetScope: "global",
    });
  });

  it("accepts an explicitly reviewed T2 handoff conclusion", () => {
    const result = validatePromotion(
      validRequest({
        evidence: createEvidenceRecord({
          confidence: 0.9,
          provenance: "t2:handoff-42",
          source: "reviewed T2 handoff",
          type: "t2-handoff",
        }),
        sourceLayer: "T2",
      }),
    );

    expect(result.accepted).toBe(true);
  });

  it.each([
    [
      "missing explicit promotion",
      {
        explicitPromotion: false,
      },
    ],
    [
      "unreviewed conclusion",
      {
        reviewedConclusion: false,
      },
    ],
    [
      "unconfirmed conclusion",
      {
        userConfirmed: false,
      },
    ],
    [
      "wrong target layer",
      {
        targetLayer: "T2" as const,
      },
    ],
    [
      "wrong target scope",
      {
        targetScope: "session" as const,
      },
    ],
    [
      "wrong target bank",
      {
        context: {
          dataDir: "/tmp/xpi-memo-promotion",
          projectBank: null,
        },
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    const result = validatePromotion(validRequest(overrides));

    expect(result.accepted).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it.each([
    [
      "L0 with T2 evidence",
      {
        evidenceType: "t2-handoff" as const,
        sourceLayer: "L0" as const,
      },
    ],
    [
      "T2 with L0 evidence",
      {
        evidenceType: "l0-conclusion" as const,
        sourceLayer: "T2" as const,
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    const result = validatePromotion(
      validRequest({
        evidence: createEvidenceRecord({
          confidence: 0.9,
          provenance: "source:event-1",
          source: "reviewed source",
          type: overrides.evidenceType,
        }),
        sourceLayer: overrides.sourceLayer,
      }),
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("evidence-source-mismatch");
  });

  it("rejects missing provenance and invalid confidence", () => {
    expect(
      validatePromotion(
        validRequest({
          evidence: {
            confidence: 0.9,
            provenance: "",
            source: "reviewed source",
            timestamp: "2026-01-01T00:00:00.000Z",
            type: "l0-conclusion",
          },
        } as PromotionRequest),
      ).accepted,
    ).toBe(false);

    expect(
      validatePromotion(
        validRequest({
          evidence: {
            confidence: 2,
            provenance: "source:event-1",
            source: "reviewed source",
            timestamp: "2026-01-01T00:00:00.000Z",
            type: "l0-conclusion",
          },
        } as PromotionRequest),
      ).accepted,
    ).toBe(false);
  });
});
