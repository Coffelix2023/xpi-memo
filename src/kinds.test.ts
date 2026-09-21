import { describe, expect, it } from "vitest";

import {
  describeMemoryKind,
  isMemoryKind,
  MEMORY_KIND_TABLE,
  MEMORY_KIND_TAXONOMY,
  MEMORY_KINDS,
  type MemoryKind,
} from "./kinds.js";
import { kindLabel } from "./panel-text.js";

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
        scope: "project",
        target: "project",
      },
      project_decision: {
        scope: "project",
        target: "project",
      },
      project_gene: {
        scope: "project",
        target: "project",
      },
      project_gotcha: {
        scope: "project",
        target: "project",
      },
      session_context: {
        scope: "session",
        // Task 2.3: decoupled from project identity; runtime routing prefers
        // the project bank when one exists, else the global bank.
        target: "global",
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

  it("names every kind in both panel languages", () => {
    // The taxonomy above is the English truth (it also lands in exported
    // Markdown); the panel reads the same seven kinds through its dictionary,
    // so a Chinese panel must not fall back to "Constraint".
    for (const kind of MEMORY_KINDS) {
      expect(kindLabel(kind, "en")).toBe(describeMemoryKind(kind).label);
      expect(kindLabel(kind, "zh")).not.toBe(kind);
      expect(kindLabel(kind, "zh")).not.toBe(describeMemoryKind(kind).label);
    }
    // A kind the dictionary does not know renders as its own id, not as a key.
    expect(kindLabel("mnemosyne", "zh")).toBe("mnemosyne");
  });
});
