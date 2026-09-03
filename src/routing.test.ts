import { describe, expect, it } from "vitest";

import { GLOBAL_BANK } from "./banks.js";
import {
  type RoutingDecision,
  RoutingRejectionError,
  routeMemoryKind,
} from "./routing.js";

const projectContext = {
  dataDir: "/tmp/xpi-memo-data",
  projectBank: "project-p-0123456789ab",
};

function expectRoute(
  kind: Parameters<typeof routeMemoryKind>[0],
  expected: RoutingDecision,
) {
  expect(routeMemoryKind(kind, projectContext)).toEqual(expected);
}

describe("T1 memory routing", () => {
  it("routes global kinds to the global bank with durable scope", () => {
    expectRoute("global_preference", {
      bank: GLOBAL_BANK,
      kind: "global_preference",
      scope: "global",
    });
    expectRoute("global_workflow", {
      bank: GLOBAL_BANK,
      kind: "global_workflow",
      scope: "global",
    });
  });

  it("routes project kinds to the current project bank with project scope", () => {
    for (const kind of [
      "project_gene",
      "project_constraint",
      "project_decision",
      "project_gotcha",
    ] as const) {
      expectRoute(kind, {
        bank: projectContext.projectBank,
        kind,
        scope: "project",
      });
    }
  });

  it("routes session context to the current project bank with session scope", () => {
    expectRoute("session_context", {
      bank: projectContext.projectBank,
      kind: "session_context",
      scope: "session",
    });
  });

  it("rejects project-scoped kinds without a recognized project", () => {
    const rejectFor = (kind: Parameters<typeof routeMemoryKind>[0]) => {
      try {
        routeMemoryKind(kind, {
          ...projectContext,
          projectBank: null,
        });
        throw new Error("expected RoutingRejectionError");
      } catch (error) {
        expect(error).toBeInstanceOf(RoutingRejectionError);
        const rejection = error as RoutingRejectionError;
        expect(rejection.reason).toBe("project-identity-required");
        expect(rejection.message).toContain("/xpi-memo-init");
        expect(rejection.message).toContain("Git");
        return rejection;
      }
    };

    for (const kind of [
      "project_gene",
      "project_constraint",
      "project_decision",
      "project_gotcha",
    ] as const) {
      const rejection = rejectFor(kind);
      expect(rejection.scope).toBe("project");
    }
  });

  it("routes session context without project identity (task 2.3)", () => {
    expect(
      routeMemoryKind("session_context", {
        dataDir: projectContext.dataDir,
        projectBank: null,
      }),
    ).toEqual({
      bank: GLOBAL_BANK,
      kind: "session_context",
      scope: "session",
    });
  });

  it("never routes a project kind to the global bank", () => {
    const kinds = [
      "project_gene",
      "project_constraint",
      "project_decision",
      "project_gotcha",
      "session_context",
    ] as const;

    for (const kind of kinds) {
      expect(routeMemoryKind(kind, projectContext).bank).not.toBe(GLOBAL_BANK);
    }
  });
});
