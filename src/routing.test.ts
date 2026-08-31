import { describe, expect, it } from "vitest";

import { GLOBAL_BANK } from "./banks.js";
import { type RoutingDecision, routeMemoryKind } from "./routing.js";

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

  it("routes durable project kinds to the current project bank", () => {
    for (const kind of [
      "project_gene",
      "project_constraint",
      "project_decision",
      "project_gotcha",
    ] as const) {
      expectRoute(kind, {
        bank: projectContext.projectBank,
        kind,
        scope: "global",
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
    expect(() =>
      routeMemoryKind("project_gene", {
        ...projectContext,
        projectBank: null,
      }),
    ).toThrow("Project memory requires a recognized Git project");
    expect(() =>
      routeMemoryKind("session_context", {
        ...projectContext,
        projectBank: null,
      }),
    ).toThrow("Project memory requires a recognized Git project");
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
