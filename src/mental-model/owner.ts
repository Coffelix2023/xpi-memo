/**
 * Projection ownership and storage paths (change
 * add-mental-model-projections, task 2.1).
 *
 * One projection per `(definitionId, ownerKey)`. `ownerKey` is derived **only**
 * from existing routing identity: the literal `global`, or the canonical
 * project bank name the rest of the extension already routes to. There is no
 * second identity scheme and no fallback, because a project model that fell
 * back to the global bank would answer a project question with another
 * project's — or the user's — memories.
 *
 * Files live under the existing data root and are private:
 *
 * ```text
 * <dataDir>/mental-models/
 * ├── global/<definitionId>.json
 * └── projects/<projectBank>/<definitionId>.json
 * ```
 *
 * They are rebuildable derived state, so deleting the whole directory loses
 * nothing that T1 and L0 cannot regenerate.
 */

import { join } from "node:path";
import { GLOBAL_BANK } from "../banks.js";
import { isMentalModelDefinitionId, mentalModelDefinition } from "./definitions.js";
import type { MentalModelDefinition, MentalModelOwner } from "./types.js";

/** Owner key of the user-wide projection. */
export const MENTAL_MODEL_GLOBAL_OWNER = "global";

/**
 * A project bank name the extension itself produces (`project-<id>`, where the
 * id is `p-` plus hex or an equivalent stable slug). Anything else is rejected
 * so a crafted owner key can never escape the mental-models directory.
 */
export const MENTAL_MODEL_PROJECT_BANK_PATTERN = /^project-[A-Za-z0-9._-]{1,120}$/;

export function mentalModelRoot(dataDir: string): string {
  return join(dataDir, "mental-models");
}

/** Physical bank a definition's sources are read from, given its owner. */
export function mentalModelOwnerBank(owner: MentalModelOwner): string {
  return owner.scope === "global" ? GLOBAL_BANK : owner.key;
}

/**
 * Resolve the owner for a definition.
 *
 * A project-scoped definition with no recognized project identity resolves to
 * `null`: the caller must skip generation and delivery rather than fall back to
 * the global bank or to another project's projection.
 */
export function resolveMentalModelOwner(
  definition: MentalModelDefinition,
  projectBank: string | null,
): MentalModelOwner | null {
  if (definition.scope === "global")
    return {
      key: MENTAL_MODEL_GLOBAL_OWNER,
      scope: "global",
    };
  if (projectBank === null) return null;
  if (!MENTAL_MODEL_PROJECT_BANK_PATTERN.test(projectBank)) return null;
  return {
    key: projectBank,
    scope: "project",
  };
}

/**
 * Path of one projection file, or `null` when the pair cannot be stored safely.
 *
 * Both inputs are validated against closed sets (registered definition ids, the
 * project-bank shape) rather than sanitised by string surgery, so a traversal
 * attempt fails instead of silently landing somewhere else.
 */
export function mentalModelProjectionPath(
  dataDir: string,
  owner: MentalModelOwner,
  definitionId: string,
): string | null {
  if (!isMentalModelDefinitionId(definitionId)) return null;
  // The definition and the owner must agree on scope: a project owner can
  // never hold the user model's projection, and vice versa.
  const definition = mentalModelDefinition(definitionId);
  if (!definition || definition.scope !== owner.scope) return null;
  const root = mentalModelRoot(dataDir);
  if (owner.scope === "global")
    return owner.key === MENTAL_MODEL_GLOBAL_OWNER
      ? join(root, MENTAL_MODEL_GLOBAL_OWNER, `${definitionId}.json`)
      : null;
  if (owner.scope !== "project") return null;
  if (!MENTAL_MODEL_PROJECT_BANK_PATTERN.test(owner.key)) return null;
  return join(root, "projects", owner.key, `${definitionId}.json`);
}

/** Owner plus path for one definition, or `null` when nothing can be stored. */
export function resolveMentalModelTarget(options: {
  dataDir: string;
  definition: MentalModelDefinition;
  projectBank: string | null;
}): {
  owner: MentalModelOwner;
  path: string;
} | null {
  const owner = resolveMentalModelOwner(options.definition, options.projectBank);
  if (!owner) return null;
  const path = mentalModelProjectionPath(options.dataDir, owner, options.definition.id);
  return path
    ? {
        owner,
        path,
      }
    : null;
}
