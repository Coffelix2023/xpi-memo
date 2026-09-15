import { describe, expect, it } from "vitest";

import type { AuditEntry } from "./audit.js";
import {
  createMemoryEventBus,
  eventKindForAction,
  type MemoryEvent,
  serializeMemoryEvent,
  shortOperationId,
  toMemoryEvent,
} from "./event-stream.js";

const CONTENT_FIELD = /content/;

function entry(
  action: AuditEntry["action"],
  metadata: AuditEntry["metadata"] = {},
): AuditEntry {
  return {
    action,
    metadata,
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

describe("memory event stream", () => {
  it("maps audit actions to finite event kinds (task 1.1)", () => {
    expect(eventKindForAction("write")).toBe("stored");
    expect(eventKindForAction("rejection")).toBe("rejected");
    expect(eventKindForAction("candidate")).toBe("candidate-created");
    expect(eventKindForAction("confirmation")).toBe("confirmed");
    expect(eventKindForAction("recall")).toBe("recalled");
    expect(eventKindForAction("fallback")).toBe("degraded");
    expect(eventKindForAction("deletion")).toBe("deleted");
    expect(eventKindForAction("extraction")).toBe("capture");
    expect(eventKindForAction("sleep-authorization")).toBeNull();
  });

  it("projects audit entries to bounded body-free events", () => {
    const event = toMemoryEvent(
      entry("write", {
        bank: "default",
        kind: "global_preference",
        operationId: "op-1234567890",
        scope: "global",
        status: "stored",
      }),
    );
    expect(event).toMatchObject({
      kind: "stored",
      memoryKind: "global_preference",
      operationId: "op-1234567890",
      scope: "global",
      status: "stored",
    });
    expect(event?.sourceRef).toBe("write@2026-01-01T00:00:00.000Z");
  });

  it("reclassifies a recall with injections as an injected event (task 1.3)", () => {
    const event = toMemoryEvent(
      entry("recall", {
        backend: "mnemosyne",
        injectedCount: 2,
        resultCount: 5,
      }),
    );
    expect(event?.kind).toBe("injected");
    expect(event?.injectedCount).toBe(2);
    // Plain recall without injection stays a recalled event.
    expect(
      toMemoryEvent(
        entry("recall", {
          backend: "fts5",
        }),
      )?.kind,
    ).toBe("recalled");
  });

  it("bounds text and counts", () => {
    const event = toMemoryEvent(
      entry("rejection", {
        reason: "x".repeat(500),
        resultCount: 99_999,
      }),
    );
    expect(event?.reasonCode).toHaveLength(80);
    expect(event?.resultCount).toBe(9_999);
  });

  it("drops non-lifecycle actions", () => {
    expect(toMemoryEvent(entry("sleep-authorization"))).toBeNull();
  });

  it("serialization rejects forbidden body-carrying fields (task 1.1)", () => {
    const leaky = {
      content: "secret memory body",
      kind: "stored",
      sourceRef: "write@t",
      timestamp: "t",
    } as MemoryEvent;
    expect(() => serializeMemoryEvent(leaky)).toThrow(CONTENT_FIELD);
  });

  it("serialization accepts valid events", () => {
    const event = toMemoryEvent(
      entry("write", {
        status: "stored",
      }),
    );
    expect(event).not.toBeNull();
    expect(() => serializeMemoryEvent(event as MemoryEvent)).not.toThrow();
  });

  it("produces a bounded short operation identifier", () => {
    expect(
      shortOperationId({
        kind: "stored",
        sourceRef: "x",
        timestamp: "t",
      }),
    ).toBe("—");
    expect(
      shortOperationId({
        kind: "stored",
        operationId: "abcdef123456",
        sourceRef: "x",
        timestamp: "t",
      }),
    ).toBe("#abcdef");
  });

  it("observer failure never breaks emit (task 1.2)", () => {
    const bus = createMemoryEventBus();
    bus.subscribe(() => {
      throw new Error("observer exploded");
    });
    let received = 0;
    bus.subscribe(() => {
      received += 1;
    });
    expect(() =>
      bus.emit({
        kind: "stored",
        sourceRef: "x",
        timestamp: "t",
      }),
    ).not.toThrow();
    expect(received).toBe(1);
  });

  it("keeps the recent buffer bounded", () => {
    const bus = createMemoryEventBus(3);
    for (let index = 0; index < 10; index += 1)
      bus.emit({
        kind: "stored",
        sourceRef: `x${index}`,
        timestamp: "t",
      });
    const recent = bus.recent();
    expect(recent).toHaveLength(3);
    expect(recent[0]?.sourceRef).toBe("x7");
  });
});
