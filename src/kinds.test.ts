import { describe, expect, it } from "vitest";

import {
  describeMemoryKind,
  isMemoryKind,
  MEMORY_KIND_TABLE,
  MEMORY_KIND_TAXONOMY,
  MEMORY_KINDS,
  type MemoryKind,
} from "./kinds.js";

const EXPECTED_MEMORY_KINDS: readonly MemoryKind[] = [
  "global_preference",
  "global_workflow",
  "project_gene",
  "project_constraint",
  "project_decision",
  "project_gotcha",
  "session_context",
];

describe("T1 memory-kind table", () => {
  it("recognizes exactly the seven supported memory kinds", () => {
    expect(MEMORY_KINDS).toEqual(EXPECTED_MEMORY_KINDS);
    expect(MEMORY_KINDS).toHaveLength(7);
    expect(new Set(MEMORY_KINDS).size).toBe(7);
  });

  it("accepts supported kinds and rejects unknown values", () => {
    for (const kind of EXPECTED_MEMORY_KINDS) {
      expect(isMemoryKind(kind)).toBe(true);
    }

    expect(isMemoryKind("mnemosyne")).toBe(false);
    expect(isMemoryKind("memory")).toBe(false);
  });

  it("keeps global and project targets and scopes fixed", () => {
    expect(MEMORY_KIND_TABLE).toEqual({
      global_preference: {
        scope: "global",
        target: "global",
      },
      global_workflow: {
        scope: "global",
        target: "global",
      },
      project_constraint: {
        scope: "global",
        target: "project",
      },
      project_decision: {
        scope: "global",
        target: "project",
      },
      project_gene: {
        scope: "global",
        target: "project",
      },
      project_gotcha: {
        scope: "global",
        target: "project",
      },
      session_context: {
        scope: "session",
        target: "project",
      },
    });
  });

  it("covers every kind with deterministic human-readable observability metadata", () => {
    expect(Object.keys(MEMORY_KIND_TAXONOMY).sort()).toEqual(
      [
        ...MEMORY_KINDS,
      ].sort(),
    );
    for (const kind of MEMORY_KINDS) {
      const description = describeMemoryKind(kind);
      expect(description.label).not.toBe(kind);
      expect([
        "standing",
        "contextual",
      ]).toContain(description.role);
      expect([
        "global",
        "project",
        "session",
      ]).toContain(description.scope);
      expect(description.trustState).not.toBe("");
      expect(description.sectionTitle).not.toBe("Other");
      expect(MEMORY_KIND_TABLE[kind]).toEqual(description.route);
    }
  });
});
