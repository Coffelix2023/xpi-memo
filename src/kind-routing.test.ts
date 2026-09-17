import { describe, expect, it } from "vitest";
import { getAdmissionPolicy, KIND_ADMISSION_POLICIES } from "./kind-routing.ts";
import { MEMORY_KINDS } from "./kinds.js";

describe("kind admission policy map (task 2.1)", () => {
  it("covers every memory kind exactly once", () => {
    expect(Object.keys(KIND_ADMISSION_POLICIES).sort()).toEqual(
      [
        ...MEMORY_KINDS,
      ].sort(),
    );
  });

  it("routes gene and constraint to tool verification", () => {
    expect(KIND_ADMISSION_POLICIES.project_gene).toBe("tool-verify");
    expect(KIND_ADMISSION_POLICIES.project_constraint).toBe("tool-verify");
  });

  it("routes decision to manual confirmation", () => {
    expect(KIND_ADMISSION_POLICIES.project_decision).toBe("manual-confirm");
  });

  it("routes preference to accumulate (reserved path)", () => {
    expect(KIND_ADMISSION_POLICIES.global_preference).toBe("accumulate");
  });
});

describe("getAdmissionPolicy (task 2.2)", () => {
  it("returns the mapped policy for each kind", () => {
    for (const kind of MEMORY_KINDS) {
      expect(getAdmissionPolicy(kind, {})).toBe(KIND_ADMISSION_POLICIES[kind]);
    }
  });

  it("returns a policy enum value for all six candidate-relevant kinds", () => {
    const policies = [
      "global_preference",
      "global_workflow",
      "project_gene",
      "project_constraint",
      "project_decision",
      "project_gotcha",
    ] as const;
    for (const kind of policies) {
      expect([
        "tool-verify",
        "accumulate",
        "manual-confirm",
      ]).toContain(getAdmissionPolicy(kind, {}));
    }
  });
});

describe("XPI_MEMO_AUTO_VERIFY override (task 2.3)", () => {
  it("routes every kind to manual-confirm when set to false", () => {
    for (const kind of MEMORY_KINDS) {
      expect(
        getAdmissionPolicy(kind, {
          XPI_MEMO_AUTO_VERIFY: "false",
        }),
      ).toBe("manual-confirm");
    }
  });

  it("treats 0 like false", () => {
    expect(
      getAdmissionPolicy("project_gene", {
        XPI_MEMO_AUTO_VERIFY: "0",
      }),
    ).toBe("manual-confirm");
  });

  it("keeps tool verification enabled for any other value", () => {
    expect(
      getAdmissionPolicy("project_gene", {
        XPI_MEMO_AUTO_VERIFY: "true",
      }),
    ).toBe("tool-verify");
    expect(
      getAdmissionPolicy("project_gene", {
        XPI_MEMO_AUTO_VERIFY: "1",
      }),
    ).toBe("tool-verify");
    expect(getAdmissionPolicy("project_gene", {})).toBe("tool-verify");
  });
});
