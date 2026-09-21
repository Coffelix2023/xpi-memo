/**
 * Built-in mental-model definitions (change add-mental-model-projections,
 * task 1.2).
 *
 * Exactly two standing questions ship in this release: a global user
 * working-style model and a current-project operating model. They are
 * code-owned, versioned, and independently enabled by effective configuration.
 *
 * There is deliberately **no registration API**: `MENTAL_MODEL_DEFINITIONS` is
 * the whole registry, and lookup only ever succeeds for an id that is already
 * in it. That is what makes "the system MUST NOT automatically invent new
 * durable mental-model definitions from conversation content" a structural
 * property instead of a policy someone has to remember.
 */

import { isMemoryKind, type MemoryKind } from "../kinds.js";
import type { MentalModelDefinition } from "./types.js";

/** Global user working-style model: how this user prefers to work. */
export const USER_WORKING_STYLE_ID = "user-working-style";

/** Current-project operating model: how this project works today. */
export const ACTIVE_PROJECT_OPERATING_MODEL_ID = "active-project-operating-model";

/**
 * The versioned registry, in canonical (config-list) order.
 *
 * `kinds` is an exact allowlist, not a preference: a definition may only read
 * the kinds it names, so a new T1 kind can never leak into an existing
 * projection without an explicit definition version bump.
 */
export const MENTAL_MODEL_DEFINITIONS: readonly MentalModelDefinition[] = [
  {
    id: ACTIVE_PROJECT_OPERATING_MODEL_ID,
    question:
      "How does this project operate today, according to its confirmed repository facts, constraints, decisions, and gotchas?",
    scope: "project",
    version: 1,
    kinds: [
      "project_constraint",
      "project_decision",
      "project_gene",
      "project_gotcha",
    ],
  },
  {
    id: USER_WORKING_STYLE_ID,
    question:
      "How does this user prefer to work, according to their confirmed global preferences and workflows?",
    scope: "global",
    version: 1,
    kinds: [
      "global_preference",
      "global_workflow",
    ],
  },
];

const DEFINITIONS_BY_ID: ReadonlyMap<string, MentalModelDefinition> = new Map(
  MENTAL_MODEL_DEFINITIONS.map((definition) => [
    definition.id,
    definition,
  ]),
);

/** Every built-in definition id, in registry order. */
export function mentalModelDefinitionIds(): readonly string[] {
  return MENTAL_MODEL_DEFINITIONS.map((definition) => definition.id);
}

/**
 * Look up a built-in definition. An unknown id returns null: definitions are
 * code-owned, so an ad-hoc id from a config file or a conversation resolves to
 * nothing rather than to a new model.
 */
export function mentalModelDefinition(id: string): MentalModelDefinition | null {
  return DEFINITIONS_BY_ID.get(id) ?? null;
}

export function isMentalModelDefinitionId(value: string): boolean {
  return DEFINITIONS_BY_ID.has(value);
}

/**
 * Parse a comma-separated enablement list.
 *
 * Returns the known ids in registry order, deduped. Unknown tokens make the
 * whole value invalid (`null`) so a typo fails closed to the default instead of
 * silently disabling a model. An empty string is valid and means "none".
 */
export function parseMentalModelDefinitionList(value: string): string[] | null {
  const seen = new Set<string>();
  for (const token of value.split(",")) {
    const id = token.trim();
    if (id.length === 0) continue;
    if (!isMentalModelDefinitionId(id)) return null;
    seen.add(id);
  }
  return mentalModelDefinitionIds().filter((id) => seen.has(id));
}

/** Canonical config-list text for a set of ids (registry order, deduped). */
export function formatMentalModelDefinitionList(ids: readonly string[]): string {
  const seen = new Set(ids.filter((id) => isMentalModelDefinitionId(id)));
  return mentalModelDefinitionIds()
    .filter((id) => seen.has(id))
    .join(",");
}

/**
 * Is this definition enabled by the effective configuration value?
 *
 * An unparsable list enables nothing: the config boundary already falls back to
 * the default for a bad value, and reaching here with one must not turn a
 * broken setting into a model call.
 */
export function isMentalModelDefinitionEnabled(
  definitionList: string,
  definitionId: string,
): boolean {
  const parsed = parseMentalModelDefinitionList(definitionList);
  return parsed?.includes(definitionId) === true;
}

/** Type guard used by the source reader: the kind must be in the allowlist. */
export function isDefinitionSourceKind(
  definition: MentalModelDefinition,
  kind: string,
): kind is MemoryKind {
  return isMemoryKind(kind) && definition.kinds.includes(kind);
}
