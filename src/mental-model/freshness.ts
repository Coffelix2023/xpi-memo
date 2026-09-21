/**
 * Deterministic freshness detection (change add-mental-model-projections,
 * task 2.4).
 *
 * Freshness is a pure comparison — definition version, owner, selected-source
 * digest, persisted successful digest. It never calls a model and never reads
 * the clock, so the same T1 state always yields the same verdict. The digest,
 * not a timestamp, is the authority: a write-only watermark cannot see a
 * deletion or a supersession that leaves a *newer* surviving row.
 */

import { createHash } from "node:crypto";

import {
  digestPrefix,
  type MentalModelDefinition,
  type MentalModelFreshness,
  type MentalModelOwner,
  type MentalModelProjection,
  type MentalModelSourceEvaluation,
  type MentalModelSourceRow,
  type MentalModelState,
} from "./types.js";

/**
 * Canonical source digest.
 *
 * Rows are ordered by stable memory id (never by write time), and each row
 * contributes its id, kind, scope, and content. Content is hashed rather than
 * stored, so the digest detects an edit without leaking a body. The definition
 * id and version are mixed in, which is what makes "changing a definition's
 * question, source kinds, or version invalidates its projection" automatic.
 *
 * The timestamp is deliberately excluded: re-writing identical content must not
 * make a fresh projection look stale.
 */
export function mentalModelSourceDigest(
  definition: MentalModelDefinition,
  rows: readonly MentalModelSourceRow[],
): string {
  const canonical = [
    ...rows,
  ]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) =>
      [
        row.id,
        row.kind,
        row.scope,
        row.content,
      ].join("\u0000"),
    )
    .join("\u0001");
  return createHash("sha256")
    .update(
      [
        "mental-model-source-v1",
        definition.id,
        String(definition.version),
        canonical,
      ].join("\u0000"),
    )
    .digest("hex");
}

export interface MentalModelStateInput {
  definition: MentalModelDefinition;
  /**
   * True when the digest was deliberately not computed because the persisted
   * record alone decides the state (`absent`/`failed`/version-stale/disabled).
   * Callers set this to avoid a bank read that cannot change the verdict; the
   * fail-closed rule below still applies to every read that was attempted.
   */
  digestNotRequired?: boolean;
  /** Effective per-definition enablement (config, not synthesis switch). */
  enabled: boolean;
  projection: MentalModelProjection | null;
  /** True when the bounded bank read failed: the source state is unknown. */
  readFailed: boolean;
  /** Current digest, or null when it could not be computed. */
  sourceDigest: string | null;
}

/**
 * Derive the reported state.
 *
 * Fail-closed rules:
 * - an unreadable source state is `failed`, never `fresh` — the system does not
 *   declare a projection current when it cannot check;
 * - a record with no successful payload is `absent` (never attempted) or
 *   `failed` (an attempt failed), never a fresh empty authority.
 */
export function deriveMentalModelState(input: MentalModelStateInput): MentalModelState {
  if (!input.enabled) return "disabled";
  if (input.readFailed || (input.sourceDigest === null && !input.digestNotRequired))
    return "failed";
  const projection = input.projection;
  if (!projection || projection.sourceDigest === "")
    return projection?.lastAttempt.outcome === "failed" ? "failed" : "absent";
  if (projection.definitionVersion !== input.definition.version) return "stale";
  // A required digest that could not be computed is unknown state, not stale.
  if (input.sourceDigest === null) return "failed";
  if (projection.sourceDigest !== input.sourceDigest) return "stale";
  return "fresh";
}

/**
 * Only these states may trigger a synthesis attempt.
 *
 * `failed` is included because the only failures that reach here are ones a
 * retry can fix (an unreadable bank, or a previous attempt that left no
 * successful payload). A synthesis failure on top of an existing projection
 * reports `stale`, because the digest still disagrees — so the same uncommitted
 * changes stay eligible, which is exactly what the spec requires.
 */
export function isMentalModelRefreshEligible(state: MentalModelState): boolean {
  return state === "absent" || state === "stale" || state === "failed";
}

export interface MentalModelFreshnessInput extends MentalModelStateInput {
  evaluation: MentalModelSourceEvaluation | null;
  owner: MentalModelOwner;
}

/** Assemble the bounded freshness verdict reported by status and diagnostics. */
export function mentalModelFreshness(
  input: MentalModelFreshnessInput,
): MentalModelFreshness {
  const state = deriveMentalModelState(input);
  const freshness: MentalModelFreshness = {
    definitionId: input.definition.id,
    digestPrefix: digestPrefix(input.sourceDigest),
    ownerKey: input.owner.key,
    persistedAt: input.projection?.refreshedAt ?? null,
    scope: input.owner.scope,
    sourceCount: input.evaluation?.rows.length ?? 0,
    state,
  };
  // Only a failure carries a reason: `stale` and `absent` already say why.
  if (state !== "failed") return freshness;
  return {
    ...freshness,
    reason: input.readFailed ? "source-read-failed" : "no-successful-projection",
  };
}
