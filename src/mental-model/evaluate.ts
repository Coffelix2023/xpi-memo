/**
 * Local freshness evaluation (change add-mental-model-projections, tasks 4.1
 * and 5.2).
 *
 * One place computes "what state is each projection in right now?" for both
 * delivery and status output, so a projection can never be deliverable on one
 * path and stale on the other. The evaluation is model-free: it reads the
 * bounded bank export (memoized per session) plus the projection file and
 * applies the deterministic digest comparison.
 */

import type { BankStateReader } from "../markdown-export/bank-state.js";
import { mentalModelFreshness } from "./freshness.js";
import { type MentalModelSourceMemo, mentalModelMemoKey } from "./memo.js";
import { mentalModelOwnerBank, resolveMentalModelTarget } from "./owner.js";
import { type MentalModelSourceRead, readMentalModelSources } from "./sources.js";
import { readMentalModelProjection } from "./store.js";
import {
  MENTAL_MODEL_STATES,
  type MentalModelDefinition,
  type MentalModelFreshness,
  type MentalModelOwner,
  type MentalModelProjection,
  type MentalModelState,
} from "./types.js";

export interface MentalModelEvaluationOptions {
  dataDir: string;
  /** All built-in definitions, in registry order. */
  definitions: readonly MentalModelDefinition[];
  /** Effective per-definition enablement; the synthesis switch is NOT part of it. */
  isDefinitionEnabled: (definitionId: string) => boolean;
  memo: MentalModelSourceMemo;
  /** Canonical project bank, or null when no project identity is recognized. */
  projectBank: string | null;
  read: BankStateReader;
  sessionId: string;
}

export interface MentalModelEvaluation {
  definition: MentalModelDefinition;
  freshness: MentalModelFreshness;
  owner: MentalModelOwner;
  path: string;
  /** Last successful payload, or null when nothing was ever committed. */
  projection: MentalModelProjection | null;
}

/**
 * Evaluate every definition that has a resolvable owner.
 *
 * A definition with no owner (project scope, no recognized project identity) is
 * skipped rather than reported: there is no projection to describe, and
 * inventing one for the global bank is exactly the fallback the spec forbids.
 */
export async function evaluateMentalModels(
  options: MentalModelEvaluationOptions,
): Promise<MentalModelEvaluation[]> {
  const evaluations: MentalModelEvaluation[] = [];
  for (const definition of options.definitions) {
    const target = resolveMentalModelTarget({
      dataDir: options.dataDir,
      definition,
      projectBank: options.projectBank,
    });
    if (!target) continue;

    const projectionRead = readMentalModelProjection(target.path);
    const projection = projectionRead.ok ? projectionRead.projection : null;
    // A missing or payload-less record, or one stamped with another definition
    // version, already decides the state. Skipping the bank read there keeps a
    // default installation (no projections yet) from paying a bounded bank
    // export on every session's first prompt.
    const needsDigest =
      projection !== null &&
      projection.sourceDigest !== "" &&
      projection.definitionVersion === definition.version;

    let sourceRead: MentalModelSourceRead | null = null;
    if (needsDigest) {
      const memoKey = mentalModelMemoKey(target.owner.key, definition.id);
      const cached = options.memo.get(options.sessionId, memoKey);
      sourceRead = cached
        ? {
            evaluation: cached,
            ok: true,
          }
        : await readMentalModelSources({
            bank: mentalModelOwnerBank(target.owner),
            dataDir: options.dataDir,
            definition,
            owner: target.owner,
            read: options.read,
          });
      if (sourceRead.ok)
        options.memo.set(options.sessionId, memoKey, sourceRead.evaluation);
    }

    const readFailed = !projectionRead.ok || (sourceRead !== null && !sourceRead.ok);
    const sourceDigest = sourceRead?.ok ? sourceRead.evaluation.digest : null;

    evaluations.push({
      definition,
      freshness: mentalModelFreshness({
        definition,
        digestNotRequired: !needsDigest,
        enabled: options.isDefinitionEnabled(definition.id),
        evaluation: sourceRead?.ok ? sourceRead.evaluation : null,
        owner: target.owner,
        projection,
        readFailed,
        sourceDigest,
      }),
      owner: target.owner,
      path: target.path,
      projection,
    });
  }
  return evaluations;
}

/**
 * Body-free count of every state, plus a `skipped` count for definitions whose
 * owner could not be resolved. Every state key is always present, so an absent
 * count is never read as "not measured".
 */
export type MentalModelStateCounts = Record<MentalModelState | "skipped", number>;

export function summarizeMentalModelStates(
  evaluations: readonly MentalModelEvaluation[],
  options: {
    definitions: readonly MentalModelDefinition[];
  },
): MentalModelStateCounts {
  const counts = Object.fromEntries([
    ...MENTAL_MODEL_STATES.map((state) => [
      state,
      0,
    ]),
    [
      "skipped",
      0,
    ],
  ]) as MentalModelStateCounts;
  for (const evaluation of evaluations) counts[evaluation.freshness.state] += 1;
  // A definition without a resolvable owner has no projection to describe.
  counts.skipped += Math.max(0, options.definitions.length - evaluations.length);
  return counts;
}
