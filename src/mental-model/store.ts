/**
 * Atomic projection storage (change add-mental-model-projections, task 2.2).
 *
 * One JSON record per `(definitionId, ownerKey)`, written through a temporary
 * file plus `rename` so a reader never observes a half-written projection. The
 * record holds the **last successful** payload and the **last attempt**
 * outcome; a failed refresh rewrites the record with new failure metadata but
 * keeps `content`, `sourceIds`, `sourceDigest`, and `sourceBoundary` intact.
 *
 * Reads are strict: a record that does not match the closed shape is reported
 * as a read failure, not as "absent". That distinction matters because
 * `absent` means "nothing has been built yet" while a corrupt file means
 * "something is wrong" — collapsing them would let corruption masquerade as a
 * clean slate.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { isMentalModelDefinitionId } from "./definitions.js";
import { MENTAL_MODEL_PROJECT_BANK_PATTERN } from "./owner.js";
import {
  isMentalModelFailureCategory,
  MENTAL_MODEL_BUDGETS,
  MENTAL_MODEL_SCOPES,
  type MentalModelDefinition,
  type MentalModelFailureCategory,
  type MentalModelProjection,
  type MentalModelScope,
} from "./types.js";

/** Bounded marker used for every read/parse/validation failure. */
export const MENTAL_MODEL_CORRUPT_REASON = "projection-unreadable";
/** Bounded marker used when the record cannot be written. */
export const MENTAL_MODEL_WRITE_FAILED_REASON = "projection-write-failed";

/** Bounded ceiling on a stored owner key or generator field. */
const MAX_LABEL_CHARS = 200;
/** Bounded ceiling on a single source id. */
const MAX_SOURCE_ID_CHARS = 128;

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export type MentalModelRead =
  | {
      ok: true;
      /** `null` means the file does not exist yet. */
      projection: MentalModelProjection | null;
    }
  | {
      ok: false;
      reason: string;
    };

export type MentalModelWrite =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxChars) return null;
  return trimmed;
}

function isoTimestamp(value: unknown): string | null {
  const text = boundedString(value, MAX_LABEL_CHARS);
  if (!text) return null;
  return Number.isFinite(Date.parse(text)) ? text : null;
}

function ownerKey(value: unknown, scope: MentalModelScope): string | null {
  const text = boundedString(value, MAX_LABEL_CHARS);
  if (!text) return null;
  if (scope === "global") return text === "global" ? text : null;
  return MENTAL_MODEL_PROJECT_BANK_PATTERN.test(text) ? text : null;
}

function boundedSourceIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MENTAL_MODEL_BUDGETS.maxSourceIds) return null;
  const ids: string[] = [];
  for (const entry of value) {
    const id = boundedString(entry, MAX_SOURCE_ID_CHARS);
    if (!id) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function generator(value: unknown): MentalModelProjection["generator"] | null {
  if (!isRecord(value)) return null;
  const output: MentalModelProjection["generator"] = {};
  for (const key of [
    "model",
    "policyVersion",
    "provider",
  ] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    const text = boundedString(raw, MAX_LABEL_CHARS);
    if (!text) return null;
    output[key] = text;
  }
  return output;
}

function lastAttempt(value: unknown): MentalModelProjection["lastAttempt"] | null {
  if (!isRecord(value)) return null;
  const at = isoTimestamp(value.at);
  if (!at) return null;
  const outcome = value.outcome;
  if (outcome !== "refreshed" && outcome !== "failed") return null;
  if (outcome === "refreshed")
    return value.failure === undefined
      ? {
          at,
          outcome,
        }
      : null;
  const failure = value.failure;
  if (typeof failure !== "string" || !isMentalModelFailureCategory(failure))
    return null;
  return {
    at,
    failure,
    outcome,
  };
}

/**
 * Validate one persisted record at the boundary. Returns `null` on any shape
 * mismatch, so an unreadable projection can never be mistaken for a valid one.
 */
export function parseMentalModelProjection(
  value: unknown,
): MentalModelProjection | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  const definitionId = value.definitionId;
  if (typeof definitionId !== "string" || !isMentalModelDefinitionId(definitionId))
    return null;
  const definitionVersion = value.definitionVersion;
  if (
    typeof definitionVersion !== "number" ||
    !Number.isInteger(definitionVersion) ||
    definitionVersion <= 0
  )
    return null;
  const scope = value.scope;
  if (
    typeof scope !== "string" ||
    !(MENTAL_MODEL_SCOPES as readonly string[]).includes(scope)
  )
    return null;
  const resolvedScope = scope as MentalModelScope;
  const key = ownerKey(value.ownerKey, resolvedScope);
  if (!key) return null;

  const content = value.content;
  if (typeof content !== "string") return null;
  if (content.length > MENTAL_MODEL_BUDGETS.maxGeneratedChars) return null;

  const sourceIds = boundedSourceIds(value.sourceIds);
  if (!sourceIds) return null;

  const digest = value.sourceDigest;
  if (typeof digest !== "string") return null;
  if (digest !== "" && !DIGEST_PATTERN.test(digest)) return null;

  const boundary = value.sourceBoundary;
  if (
    boundary !== null &&
    (typeof boundary !== "number" || !Number.isInteger(boundary) || boundary < 0)
  )
    return null;

  const generatedAt = isoTimestamp(value.generatedAt);
  if (!generatedAt) return null;
  const refreshed = value.refreshedAt;
  const refreshedAt = refreshed === null ? null : isoTimestamp(refreshed);
  if (refreshed !== null && !refreshedAt) return null;

  const attempt = lastAttempt(value.lastAttempt);
  if (!attempt) return null;
  const generated = generator(value.generator);
  if (!generated) return null;

  // Consistency: an empty digest is the only representation of "never
  // succeeded", and it must not carry a payload that looks authoritative.
  if (digest === "") {
    if (content !== "" || sourceIds.length > 0 || refreshedAt !== null) return null;
    if (boundary !== null) return null;
  } else if (refreshedAt === null) {
    return null;
  }

  return {
    content,
    definitionId,
    definitionVersion,
    generatedAt,
    generator: generated,
    lastAttempt: attempt,
    ownerKey: key,
    refreshedAt,
    scope: resolvedScope,
    sourceBoundary: boundary === null ? null : boundary,
    sourceDigest: digest,
    sourceIds,
    version: 1,
  };
}

/** Read one projection file. A missing file is a clean `absent`, not a failure. */
export function readMentalModelProjection(path: string): MentalModelRead {
  if (!existsSync(path))
    return {
      ok: true,
      projection: null,
    };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const projection = parseMentalModelProjection(parsed);
    if (!projection)
      return {
        ok: false,
        reason: MENTAL_MODEL_CORRUPT_REASON,
      };
    return {
      ok: true,
      projection,
    };
  } catch {
    return {
      ok: false,
      reason: MENTAL_MODEL_CORRUPT_REASON,
    };
  }
}

/**
 * Atomically replace one projection file.
 *
 * The temporary file is written first and then renamed over the target, so a
 * crash leaves either the old record or the new one — never a partial file.
 */
export function writeMentalModelProjection(
  path: string,
  projection: MentalModelProjection,
): MentalModelWrite {
  // Never persist a record the reader would reject: a write that cannot be
  // read back is worse than no write at all.
  if (!parseMentalModelProjection(projection))
    return {
      ok: false,
      reason: MENTAL_MODEL_WRITE_FAILED_REASON,
    };
  const temporaryPath = `${path}.tmp`;
  try {
    mkdirSync(dirname(path), {
      mode: 0o700,
      recursive: true,
    });
    writeFileSync(temporaryPath, `${JSON.stringify(projection, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
    try {
      chmodSync(path, 0o600);
    } catch {
      // Best effort on platforms without POSIX permissions.
    }
    return {
      ok: true,
    };
  } catch {
    // Leave no half-written temporary file behind for the next read to trip on.
    try {
      rmSync(temporaryPath, {
        force: true,
      });
    } catch {
      // Cleanup is best effort; the target file is untouched either way.
    }
    return {
      ok: false,
      reason: MENTAL_MODEL_WRITE_FAILED_REASON,
    };
  }
}

/**
 * Record a failed attempt while preserving the last successful payload.
 *
 * The whole record is rebuilt and written atomically, so the successful content
 * and the failure metadata never live in two files that could disagree.
 */
export function recordMentalModelFailure(
  path: string,
  failure: {
    at: string;
    category: MentalModelFailureCategory;
    definition: MentalModelDefinition;
    ownerKey: string;
    scope: MentalModelScope;
  },
): MentalModelWrite {
  const read = readMentalModelProjection(path);
  const previous = read.ok ? read.projection : null;
  const base: MentalModelProjection =
    previous ??
    ({
      content: "",
      definitionId: failure.definition.id,
      definitionVersion: failure.definition.version,
      generatedAt: failure.at,
      generator: {},
      ownerKey: failure.ownerKey,
      refreshedAt: null,
      scope: failure.scope,
      sourceBoundary: null,
      sourceDigest: "",
      sourceIds: [],
      version: 1,
      lastAttempt: {
        at: failure.at,
        failure: failure.category,
        outcome: "failed",
      },
    } satisfies MentalModelProjection);
  return writeMentalModelProjection(path, {
    ...base,
    lastAttempt: {
      at: failure.at,
      failure: failure.category,
      outcome: "failed",
    },
  });
}
