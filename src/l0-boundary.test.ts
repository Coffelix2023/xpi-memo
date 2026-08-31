import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { describeL0Boundary, type L0Boundary } from "./l0-boundary.ts";

describe("T1 L0 boundary", () => {
  it("reports L0 as an external implementation-independent session trace", () => {
    const boundary = describeL0Boundary();

    expect(boundary).toEqual({
      concreteRuntimeRequired: false,
      derivationUsesLLM: false,
      ownsRawEvents: true,
      persistsRawEventsInT1: false,
      selectableAsMemoryEngine: false,
      status: "external-session-trace",
    });
  });

  it("does not create a T1 dependency on a concrete L0 runtime", () => {
    const boundary: L0Boundary = describeL0Boundary();

    expect(boundary.concreteRuntimeRequired).toBe(false);
    expect(boundary.persistsRawEventsInT1).toBe(false);
    expect(boundary.selectableAsMemoryEngine).toBe(false);
  });
  it("documents the complete L0 contract without selecting a runtime", () => {
    const contract = readFileSync(
      new URL("../docs/l0-contract.md", import.meta.url),
      "utf8",
    );

    expect(contract).toContain("append-only");
    expect(contract).toContain("ordered event history");
    expect(contract).toContain("deterministic");
    expect(contract).toContain("raw event history");
    expect(contract).toContain("folding marker");
    expect(contract).toContain("does not call an LLM");
    expect(contract).toContain("concrete runtime");
    expect(contract).toContain("deferred");
    expect(contract).not.toContain("context-mode");
  });
});
