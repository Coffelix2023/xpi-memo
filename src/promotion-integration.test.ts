import { describe, expect, it } from "vitest";

import { createEvidenceRecord } from "./evidence.ts";
import { createMnemosyneAdapter, type T1MemoryOperation } from "./operations.ts";
import { type PromotionRequest, validatePromotion } from "./promotion-policy.ts";

describe("T1 promotion integration", () => {
  function request(overrides: Partial<PromotionRequest> = {}): PromotionRequest {
    return {
      content: "The project uses pnpm for package scripts.",
      evidence: createEvidenceRecord({
        confidence: 0.95,
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
        dataDir: "/tmp/xpi-memo-promotion-integration",
        projectBank: "project-p-0123456789ab",
      },
      ...overrides,
    };
  }

  it("stores an accepted L0 conclusion through the T1 adapter", async () => {
    const operations: T1MemoryOperation[] = [];
    const adapter = createMnemosyneAdapter(async (_args, options) => {
      operations.push({
        confidence: 0.95,
        content: "The project uses pnpm for package scripts.",
        dataDir: options?.dataDir ?? "",
        kind: "project_decision",
        provenance: "l0:event-42",
        scope: "global",
        targetBank: options?.bank ?? "default",
        source: {
          evidenceType: "l0-conclusion",
          source: "reviewed session conclusion",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      });
      return "Stored: promotion-1";
    });

    const promotion = request();
    const decision = validatePromotion(promotion);
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) throw new Error("promotion was rejected");
    if (!decision.targetKind || !decision.targetScope || !decision.targetBank) {
      throw new Error("accepted promotion is missing target routing");
    }

    await adapter.store({
      confidence: promotion.evidence.confidence,
      content: promotion.content,
      dataDir: promotion.context.dataDir,
      kind: decision.targetKind,
      provenance: promotion.evidence.provenance,
      scope: decision.targetScope,
      targetBank: decision.targetBank,
      source: {
        evidenceType: promotion.evidence.type,
        source: promotion.evidence.source,
        timestamp: promotion.evidence.timestamp,
      },
    });

    expect(operations).toMatchObject([
      {
        content: "The project uses pnpm for package scripts.",
        kind: "project_decision",
        provenance: "l0:event-42",
        scope: "global",
        targetBank: "project-p-0123456789ab",
        source: {
          evidenceType: "l0-conclusion",
          source: "reviewed session conclusion",
        },
      },
    ]);
  });

  it("does not call the adapter for an unconfirmed promotion", async () => {
    const calls: string[][] = [];
    const adapter = createMnemosyneAdapter(async (args) => {
      calls.push(args);
      return "must not store";
    });
    const promotion = request({
      userConfirmed: false,
    });

    const decision = validatePromotion(promotion);
    expect(decision.accepted).toBe(false);
    expect(calls).toEqual([]);
    expect(adapter).toBeDefined();
  });
});
