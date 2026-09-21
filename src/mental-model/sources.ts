/**
 * Governed source selection (change add-mental-model-projections, task 2.3).
 *
 * Sources come from the existing **bounded bank-export reader**, never from
 * direct SQLite access, and only confirmed T1 rows are eligible. Pending
 * candidates are not bank rows and can never enter this reader.
 *
 * Selection applies, in order:
 * 1. owner bank and semantic scope;
 * 2. the definition's kind allowlist;
 * 3. source-metadata validity (a decodable `kind=…` field);
 * 4. superseded/deleted exclusion;
 * 5. deterministic sort by stable memory id;
 * 6. fixed row and character budgets.
 *
 * Safety filtering is deliberately NOT applied here: an unsafe source must
 * surface as a bounded synthesis refusal (with a policy reason), not silently
 * drop out of the digest.
 */

import { describeMemoryKind } from "../kinds.js";
import type { BankMemoryRow, BankStateReader } from "../markdown-export/bank-state.js";
import { decodeSourceMetadata } from "../operations.js";
import { isDefinitionSourceKind } from "./definitions.js";
import { mentalModelSourceDigest } from "./freshness.js";
import { mentalModelOwnerBank } from "./owner.js";
import type {
  MentalModelDefinition,
  MentalModelOwner,
  MentalModelSourceEvaluation,
  MentalModelSourceRow,
} from "./types.js";
import { MENTAL_MODEL_BUDGETS } from "./types.js";

/** Parse `session:<sessionId>#<position>` out of a row's `src` field. */
const SESSION_POSITION_PATTERN = /^session:[^#]*#(\d+)$/;

export type MentalModelSourceRead =
  | {
      ok: true;
      evaluation: MentalModelSourceEvaluation;
    }
  | {
      ok: false;
      reason: string;
    };

function sourcePosition(row: BankMemoryRow): number | null {
  const decoded = decodeSourceMetadata(row.source ?? "");
  if (decoded.source === row.source) return null;
  const match = SESSION_POSITION_PATTERN.exec(decoded.source);
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isInteger(position) && position >= 0 ? position : null;
}

export function selectMentalModelSources(
  definition: MentalModelDefinition,
  owner: MentalModelOwner,
  rows: readonly BankMemoryRow[],
): {
  boundary: number | null;
  omitted: number;
  rows: MentalModelSourceRow[];
} {
  const bank = mentalModelOwnerBank(owner);
  let omitted = 0;
  const eligible: MentalModelSourceRow[] = [];
  let boundary: number | null = null;
  for (const row of rows) {
    if (row.bank !== bank) continue;
    // Superseded/deleted rows are not current state.
    if (typeof row.supersededBy === "string" && row.supersededBy.length > 0) {
      omitted += 1;
      continue;
    }
    const decoded = decodeSourceMetadata(row.source ?? "");
    if (!decoded.kind) {
      omitted += 1;
      continue;
    }
    if (!isDefinitionSourceKind(definition, decoded.kind)) {
      omitted += 1;
      continue;
    }
    const scope = describeMemoryKind(decoded.kind).scope;
    // Scope is the semantic truth: a `session_context` row or a global row can
    // never answer a project question even if its kind string matches.
    if (scope !== owner.scope) {
      omitted += 1;
      continue;
    }
    eligible.push({
      bank: row.bank,
      content: row.content,
      id: row.id,
      kind: decoded.kind,
      scope,
      ...(row.timestamp
        ? {
            timestamp: row.timestamp,
          }
        : {}),
    });
    const position = sourcePosition(row);
    if (position !== null && (boundary === null || position > boundary))
      boundary = position;
  }

  // Deterministic order by stable memory id; the budgets then take a fixed
  // prefix of that order, so identical banks always select identical rows.
  const ordered = [
    ...eligible,
  ].sort((left, right) => left.id.localeCompare(right.id));
  const selected: MentalModelSourceRow[] = [];
  let chars = 0;
  for (const row of ordered) {
    if (selected.length >= MENTAL_MODEL_BUDGETS.maxSourceRows) {
      omitted += 1;
      continue;
    }
    if (chars + row.content.length > MENTAL_MODEL_BUDGETS.maxSourceChars) {
      omitted += 1;
      continue;
    }
    selected.push(row);
    chars += row.content.length;
  }
  return {
    boundary,
    omitted,
    rows: selected,
  };
}

/**
 * Read the eligible sources for one definition through the bounded bank
 * reader and compute the freshness digest. A failed or oversized bank read is
 * returned as a failure so the caller fails closed instead of projecting over
 * partial state.
 */
export async function readMentalModelSources(options: {
  bank: string;
  dataDir: string;
  definition: MentalModelDefinition;
  owner: MentalModelOwner;
  read: BankStateReader;
}): Promise<MentalModelSourceRead> {
  const result = await options.read({
    dataDir: options.dataDir,
    banks: [
      options.bank,
    ],
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason.slice(0, 200) || "bank-read-failed",
    };
  }
  const selection = selectMentalModelSources(
    options.definition,
    options.owner,
    result.rows,
  );
  return {
    ok: true,
    evaluation: {
      boundary: selection.boundary,
      digest: mentalModelSourceDigest(options.definition, selection.rows),
      rows: selection.rows,
    },
  };
}
