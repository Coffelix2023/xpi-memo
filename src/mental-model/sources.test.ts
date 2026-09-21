import { describe, expect, it } from "vitest";

import type { BankMemoryRow, BankStateReader } from "../markdown-export/bank-state.js";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./definitions.js";
import { mentalModelSourceDigest } from "./freshness.js";
import { readMentalModelSources, selectMentalModelSources } from "./sources.js";
import type { MentalModelDefinition } from "./types.js";

const GLOBAL_BANK = "default";
const PROJECT_A = "project-p-aaaaaaaaaaaa";
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function source(kind: string, src = "session:s1#42"): string {
  return `kind=${kind};ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=${src}`;
}

function row(overrides: Partial<BankMemoryRow> = {}): BankMemoryRow {
  return {
    bank: GLOBAL_BANK,
    content: "a governed fact",
    id: "m-1",
    source: source("global_preference"),
    ...overrides,
  };
}

function definition(id: string): MentalModelDefinition {
  return mentalModelDefinition(id) as MentalModelDefinition;
}

const userModel = definition(USER_WORKING_STYLE_ID);
const projectModel = definition(ACTIVE_PROJECT_OPERATING_MODEL_ID);

describe("governed source selection", () => {
  it("selects only confirmed global preference/workflow rows for the user model", () => {
    const rows = [
      row({
        id: "m-pref",
      }),
      row({
        id: "m-workflow",
        source: source("global_workflow", "session:s1#50"),
      }),
      // Session-context rows share the global bank but never answer the model.
      row({
        id: "m-session",
        source: source("session_context", "session:s1#90"),
      }),
      // A row with unparseable metadata is not a governed source.
      row({
        id: "m-raw",
        source: "some raw external text",
      }),
      // Superseded rows are not current state.
      row({
        id: "m-old",
        supersededBy: "m-new",
      }),
    ];
    const selection = selectMentalModelSources(
      userModel,
      {
        key: "global",
        scope: "global",
      },
      rows,
    );
    expect(selection.rows.map((entry) => entry.id)).toEqual([
      "m-pref",
      "m-workflow",
    ]);
    expect(selection.omitted).toBe(3);
    // The digest is deterministic and covers only the selected rows.
    const digest = mentalModelSourceDigest(userModel, selection.rows);
    expect(mentalModelSourceDigest(userModel, selection.rows)).toBe(digest);
  });

  it("excludes rows from other projects and other scopes", () => {
    const selection = selectMentalModelSources(
      projectModel,
      {
        key: PROJECT_A,
        scope: "project",
      },
      [
        row({
          bank: PROJECT_A,
          id: "m-gene",
          source: source("project_gene"),
        }),
        row({
          bank: PROJECT_A,
          id: "m-decision",
          source: source("project_decision"),
        }),
        // The same kinds from another project's bank are someone else's state.
        row({
          bank: "project-p-bbbbbbbbbbbb",
          id: "m-foreign",
          source: source("project_gene"),
        }),
        // Global rows are not project sources even on the same bank.
        row({
          bank: PROJECT_A,
          id: "m-global",
          source: source("global_preference"),
        }),
        // Session context can never answer a standing project question.
        row({
          bank: PROJECT_A,
          id: "m-session",
          source: source("session_context"),
        }),
      ],
    );
    expect(selection.rows.map((entry) => entry.id)).toEqual([
      "m-decision",
      "m-gene",
    ]);
    // Deterministic order is by id, not by input order.
    expect(selection.rows[0]?.id).toBe("m-decision");
  });

  it("rejects kinds outside the definition allowlist", () => {
    const selection = selectMentalModelSources(
      userModel,
      {
        key: "global",
        scope: "global",
      },
      [
        row({
          id: "m-ok",
        }),
        row({
          id: "m-gotcha",
          source: source("project_gotcha"),
        }),
      ],
    );
    expect(selection.rows.map((entry) => entry.id)).toEqual([
      "m-ok",
    ]);
    expect(selection.omitted).toBe(1);
  });

  it("bounds rows and characters deterministically", () => {
    const many = Array.from(
      {
        length: 40,
      },
      (_, index) =>
        row({
          content: "x".repeat(40),
          id: `m-${String(index).padStart(2, "0")}`,
        }),
    );
    const selection = selectMentalModelSources(
      userModel,
      {
        key: "global",
        scope: "global",
      },
      many,
    );
    // 32-row budget, and the same input twice gives the same prefix.
    expect(selection.rows).toHaveLength(32);
    expect(selection.omitted).toBe(8);
    const again = selectMentalModelSources(
      userModel,
      {
        key: "global",
        scope: "global",
      },
      many,
    );
    expect(again.rows.map((entry) => entry.id)).toEqual(
      selection.rows.map((entry) => entry.id),
    );
    // A fixed character budget cuts a prefix of the deterministic order.
    const long = [
      row({
        content: "y".repeat(12_000),
        id: "m-a",
      }),
      row({
        content: "z".repeat(1),
        id: "m-b",
      }),
    ];
    const bounded = selectMentalModelSources(
      userModel,
      {
        key: "global",
        scope: "global",
      },
      long,
    );
    expect(bounded.rows).toHaveLength(1);
    expect(bounded.rows[0]?.id).toBe("m-a");
  });

  it("tracks the maximum traced L0 position across selected rows", () => {
    const selection = selectMentalModelSources(
      projectModel,
      {
        key: PROJECT_A,
        scope: "project",
      },
      [
        row({
          bank: PROJECT_A,
          id: "m-2",
          source: source("project_gene", "session:s1#10"),
        }),
        row({
          bank: PROJECT_A,
          id: "m-1",
          source: source("project_gene", "session:s1#55"),
        }),
        row({
          bank: PROJECT_A,
          id: "m-3",
          source: source("project_gene", "manual"),
        }),
      ],
    );
    expect(selection.boundary).toBe(55);
  });

  it("reads through the bounded bank reader and fails closed on a bad read", async () => {
    const calls: Array<{
      banks: readonly string[];
    }> = [];
    const reader: BankStateReader = async (options) => {
      calls.push({
        banks: options.banks ?? [],
      });
      return {
        ok: true,
        banks: [
          GLOBAL_BANK,
        ],
        rows: [
          row({
            id: "m-1",
          }),
        ],
      };
    };
    const read = await readMentalModelSources({
      bank: GLOBAL_BANK,
      dataDir: "/tmp/xpi-memo-test",
      definition: userModel,
      read: reader,
      owner: {
        key: "global",
        scope: "global",
      },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(calls[0]?.banks).toEqual([
      GLOBAL_BANK,
    ]);
    expect(read.evaluation.rows.map((entry) => entry.id)).toEqual([
      "m-1",
    ]);
    expect(read.evaluation.digest).toMatch(DIGEST_PATTERN);

    const failed = await readMentalModelSources({
      bank: GLOBAL_BANK,
      dataDir: "/tmp/xpi-memo-test",
      definition: userModel,
      owner: {
        key: "global",
        scope: "global",
      },
      read: async () => ({
        ok: false,
        reason: "bank-export-too-large:default:1>1",
      }),
    });
    expect(failed).toEqual({
      ok: false,
      reason: "bank-export-too-large:default:1>1",
    });
  });

  it("never lets candidates enter the source reader", async () => {
    // The reader only returns bank rows; a candidate-shaped record without a
    // bank or a kind is dropped, and the read still succeeds as an empty set.
    const read = await readMentalModelSources({
      bank: GLOBAL_BANK,
      dataDir: "/tmp/xpi-memo-test",
      definition: userModel,
      owner: {
        key: "global",
        scope: "global",
      },
      read: async () => ({
        ok: true,
        banks: [
          GLOBAL_BANK,
        ],
        rows: [
          {
            bank: GLOBAL_BANK,
            content: "pending candidate text",
            id: "m-pending",
            source: "",
          },
        ],
      }),
    });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.evaluation.rows).toEqual([]);
  });
});
