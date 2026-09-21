import { describe, expect, it } from "vitest";
import { MEMORY_KINDS } from "../kinds.js";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  formatMentalModelDefinitionList,
  isDefinitionSourceKind,
  isMentalModelDefinitionEnabled,
  isMentalModelDefinitionId,
  MENTAL_MODEL_DEFINITIONS,
  mentalModelDefinition,
  mentalModelDefinitionIds,
  parseMentalModelDefinitionList,
  USER_WORKING_STYLE_ID,
} from "./definitions.js";

describe("built-in mental-model definitions", () => {
  it("ships exactly the two documented standing questions", () => {
    expect(mentalModelDefinitionIds()).toEqual([
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
      USER_WORKING_STYLE_ID,
    ]);
  });

  it("gives the user working-style model a global preference/workflow allowlist", () => {
    const definition = mentalModelDefinition(USER_WORKING_STYLE_ID);
    expect(definition?.scope).toBe("global");
    expect(definition?.version).toBe(1);
    expect(definition?.kinds).toEqual([
      "global_preference",
      "global_workflow",
    ]);
    // Project and session kinds must not be eligible sources for it.
    for (const kind of [
      "project_gene",
      "project_constraint",
      "project_decision",
      "project_gotcha",
      "session_context",
    ] as const)
      expect(isDefinitionSourceKind(definition as never, kind)).toBe(false);
  });

  it("gives the project operating model a project-only allowlist", () => {
    const definition = mentalModelDefinition(ACTIVE_PROJECT_OPERATING_MODEL_ID);
    expect(definition?.scope).toBe("project");
    expect(definition?.version).toBe(1);
    expect(definition?.kinds).toEqual([
      "project_constraint",
      "project_decision",
      "project_gene",
      "project_gotcha",
    ]);
    for (const kind of [
      "global_preference",
      "global_workflow",
      "session_context",
    ] as const)
      expect(isDefinitionSourceKind(definition as never, kind)).toBe(false);
  });

  it("covers only real T1 kinds and never mental_model", () => {
    const allowed = new Set(
      MENTAL_MODEL_DEFINITIONS.flatMap((definition) => definition.kinds),
    );
    for (const kind of allowed) expect(MEMORY_KINDS).toContain(kind);
    expect(allowed.has("session_context" as never)).toBe(false);
    expect(allowed.has("mental_model" as never)).toBe(false);
  });

  it("rejects an unknown id and exposes no definition-creation API", async () => {
    expect(mentalModelDefinition("made-up-model")).toBeNull();
    expect(isMentalModelDefinitionId("made-up-model")).toBe(false);
    // No runtime registration surface: definitions are code-owned, so nothing
    // in this module can add one from conversation content.
    const exported = Object.keys(await import("./definitions.js"));
    for (const name of [
      "registerMentalModelDefinition",
      "createMentalModelDefinition",
      "defineMentalModel",
      "addMentalModelDefinition",
    ])
      expect(exported).not.toContain(name);
  });

  it("parses a definition list in registry order and rejects unknown tokens", () => {
    expect(parseMentalModelDefinitionList("")).toEqual([]);
    expect(parseMentalModelDefinitionList(" , ")).toEqual([]);
    expect(
      parseMentalModelDefinitionList(
        `${USER_WORKING_STYLE_ID},${ACTIVE_PROJECT_OPERATING_MODEL_ID}`,
      ),
    ).toEqual([
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
      USER_WORKING_STYLE_ID,
    ]);
    // Duplicates collapse; a typo invalidates the whole value (fail closed).
    expect(
      parseMentalModelDefinitionList(
        `${USER_WORKING_STYLE_ID},${USER_WORKING_STYLE_ID}`,
      ),
    ).toEqual([
      USER_WORKING_STYLE_ID,
    ]);
    expect(parseMentalModelDefinitionList("user-working-stile")).toBeNull();
    expect(
      parseMentalModelDefinitionList(`${USER_WORKING_STYLE_ID},mental_model`),
    ).toBeNull();
  });

  it("formats a canonical list and resolves enablement from it", () => {
    expect(
      formatMentalModelDefinitionList([
        USER_WORKING_STYLE_ID,
      ]),
    ).toBe(USER_WORKING_STYLE_ID);
    expect(
      formatMentalModelDefinitionList([
        "nope",
      ]),
    ).toBe("");
    expect(formatMentalModelDefinitionList(mentalModelDefinitionIds())).toBe(
      mentalModelDefinitionIds().join(","),
    );

    expect(
      isMentalModelDefinitionEnabled(USER_WORKING_STYLE_ID, USER_WORKING_STYLE_ID),
    ).toBe(true);
    expect(
      isMentalModelDefinitionEnabled(
        USER_WORKING_STYLE_ID,
        ACTIVE_PROJECT_OPERATING_MODEL_ID,
      ),
    ).toBe(false);
    // An unparsable list enables nothing rather than everything.
    expect(isMentalModelDefinitionEnabled("bogus", USER_WORKING_STYLE_ID)).toBe(false);
    expect(isMentalModelDefinitionEnabled("", USER_WORKING_STYLE_ID)).toBe(false);
  });

  it("keeps every definition question stable and non-empty", () => {
    for (const definition of MENTAL_MODEL_DEFINITIONS) {
      expect(definition.question.length).toBeGreaterThan(20);
      expect(definition.kinds.length).toBeGreaterThan(0);
      expect(definition.version).toBeGreaterThan(0);
    }
  });
});
