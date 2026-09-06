import { describe, expect, it } from "vitest";
import {
  L0_EVENT_TYPES,
  type L0MemoryDeletedPayload,
  type L0MemoryInjectedPayload,
} from "./types.js";

describe("L0 memory deletion events", () => {
  it("exposes the memory_deleted event type and payload contract", () => {
    expect(L0_EVENT_TYPES).toContain("memory_deleted");

    const payload = {
      memoryId: "memory-1",
    } satisfies L0MemoryDeletedPayload;
    expect(payload.memoryId).toBe("memory-1");
  });
  it("keeps new injection diagnostics optional for historical payloads", () => {
    const payload = {
      injectedMemoryIds: [
        "memory-1",
      ],
    } satisfies L0MemoryInjectedPayload;
    expect(payload.injectedMemoryIds).toEqual([
      "memory-1",
    ]);
  });
});
