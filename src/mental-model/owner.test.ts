import { describe, expect, it } from "vitest";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./definitions.js";
import {
  MENTAL_MODEL_GLOBAL_OWNER,
  mentalModelOwnerBank,
  mentalModelProjectionPath,
  mentalModelRoot,
  resolveMentalModelOwner,
  resolveMentalModelTarget,
} from "./owner.js";

const DATA_DIR = "/tmp/xpi-memo-test";
const PROJECT_A = "project-p-aaaaaaaaaaaa";
const PROJECT_B = "project-p-bbbbbbbbbbbb";

describe("mental-model ownership and paths", () => {
  it("resolves the global owner for the user working-style definition", () => {
    const definition = mentalModelDefinition(USER_WORKING_STYLE_ID) as never;
    expect(resolveMentalModelOwner(definition, null)).toEqual({
      key: MENTAL_MODEL_GLOBAL_OWNER,
      scope: "global",
    });
    // The global model never needs a project identity.
    expect(resolveMentalModelOwner(definition, PROJECT_A)?.key).toBe(
      MENTAL_MODEL_GLOBAL_OWNER,
    );
  });

  it("resolves the project owner from the canonical bank name", () => {
    const definition = mentalModelDefinition(
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    ) as never;
    expect(resolveMentalModelOwner(definition, PROJECT_A)).toEqual({
      key: PROJECT_A,
      scope: "project",
    });
  });

  it("fails closed when project identity is missing or malformed", () => {
    const definition = mentalModelDefinition(
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    ) as never;
    expect(resolveMentalModelOwner(definition, null)).toBeNull();
    expect(resolveMentalModelOwner(definition, "default")).toBeNull();
    expect(resolveMentalModelOwner(definition, "../../etc")).toBeNull();
    expect(resolveMentalModelOwner(definition, "project-")).toBeNull();
  });

  it("maps each owner to exactly one private projection path", () => {
    const global = mentalModelProjectionPath(
      DATA_DIR,
      {
        key: MENTAL_MODEL_GLOBAL_OWNER,
        scope: "global",
      },
      USER_WORKING_STYLE_ID,
    );
    const a = mentalModelProjectionPath(
      DATA_DIR,
      {
        key: PROJECT_A,
        scope: "project",
      },
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    );
    const b = mentalModelProjectionPath(
      DATA_DIR,
      {
        key: PROJECT_B,
        scope: "project",
      },
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    );

    expect(global).toBe(`${mentalModelRoot(DATA_DIR)}/global/user-working-style.json`);
    expect(a).toBe(
      `${mentalModelRoot(DATA_DIR)}/projects/${PROJECT_A}/active-project-operating-model.json`,
    );
    // Two projects can never resolve to the same projection file.
    expect(a).not.toBe(b);
    expect(mentalModelRoot(DATA_DIR)).toBe(`${DATA_DIR}/mental-models`);
  });

  it("rejects paths for unknown definitions or foreign owner keys", () => {
    expect(
      mentalModelProjectionPath(
        DATA_DIR,
        {
          key: MENTAL_MODEL_GLOBAL_OWNER,
          scope: "global",
        },
        "made-up-definition",
      ),
    ).toBeNull();
    expect(
      mentalModelProjectionPath(
        DATA_DIR,
        {
          key: "project-../../etc",
          scope: "project",
        },
        ACTIVE_PROJECT_OPERATING_MODEL_ID,
      ),
    ).toBeNull();
    // A global definition can never be stored under another owner's key.
    expect(
      mentalModelProjectionPath(
        DATA_DIR,
        {
          key: PROJECT_A,
          scope: "project",
        },
        USER_WORKING_STYLE_ID,
      ),
    ).toBeNull();
  });

  it("resolves owner and path together and skips missing identity", () => {
    const definition = mentalModelDefinition(
      ACTIVE_PROJECT_OPERATING_MODEL_ID,
    ) as never;
    const target = resolveMentalModelTarget({
      dataDir: DATA_DIR,
      definition,
      projectBank: PROJECT_A,
    });
    expect(target?.owner.key).toBe(PROJECT_A);
    expect(target?.path).toContain(PROJECT_A);
    expect(
      resolveMentalModelTarget({
        dataDir: DATA_DIR,
        definition,
        projectBank: null,
      }),
    ).toBeNull();
  });

  it("reads project sources only from the owner's bank", () => {
    expect(
      mentalModelOwnerBank({
        key: MENTAL_MODEL_GLOBAL_OWNER,
        scope: "global",
      }),
    ).toBe("default");
    expect(
      mentalModelOwnerBank({
        key: PROJECT_A,
        scope: "project",
      }),
    ).toBe(PROJECT_A);
  });
});
