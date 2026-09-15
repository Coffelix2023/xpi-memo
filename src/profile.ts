/**
 * User Preference Profile projection (evolve-memory-runtime task 3.x).
 *
 * The profile is a deterministic, bounded projection of governed T1 rows —
 * never a second truth store. Inputs are recall-shaped memory rows (id, kind,
 * scope, content, timestamp, supersededBy, confidence); outputs carry source
 * references back to the underlying memory so every profile entry stays
 * traceable. Rebuilding from the same T1 state yields the same output.
 */

import { createHash } from "node:crypto";
import { describeMemoryKindOrNull, type MemoryKind } from "./kinds.js";

/** Profile item status (design decision 3, resolution order). */
export const PROFILE_ITEM_STATUSES = [
  "active",
  "pending",
  "conflict",
  "superseded",
] as const;

export type ProfileItemStatus = (typeof PROFILE_ITEM_STATUSES)[number];

export interface ProfileSourceRef {
  /** T1 memory id when the backend assigned one. */
  id: string | null;
  kind: MemoryKind;
  scope: string;
  /** Bounded provenance pointer (e.g. mnemosyne bank), never content. */
  source: string;
  timestamp?: string;
}

export interface ProfileItem {
  /** Conflicting memory ids when both sides are retained. */
  conflictsWith: string[];
  /** Deterministic short key derived from content; stable across rebuilds. */
  key: string;
  /** Reference to the governing T1 row. */
  source: ProfileSourceRef;
  status: ProfileItemStatus;
  /** Truncated single-line content (bounded injection). */
  summary: string;
  /** Superseding memory id when this row lost to a correction. */
  supersededBy?: string;
}

export interface PreferenceProfile {
  items: ProfileItem[];
  /** Counts of items excluded by relation handling or budgets. */
  meta: {
    conflicts: number;
    omittedOverBudget: number;
    pending: number;
    superseded: number;
    total: number;
  };
  /** Scope the projection was computed for. */
  scope: "global" | "project" | "session";
  version: 1;
}

/** Bounded budgets for profile projection and injection (spec: privacy-safe). */
export const PROFILE_BUDGETS = {
  /** Max items in a projection. */
  items: 12,
  /** Max characters of a single item summary. */
  summaryChars: 120,
} as const;

export interface ProfileRow {
  confidence?: number;
  content: string;
  id?: string | null;
  kind: MemoryKind | null;
  scope?: string;
  sourceBank?: string;
  supersededBy?: string | null;
  timestamp?: string;
}

const KIND_WEIGHT: Partial<Record<MemoryKind, number>> = {
  global_preference: 3,
  global_workflow: 2,
};

function boundedSummary(content: string): string {
  const singleLine = content.replace(/[\r\n\t]+/g, " ").trim();
  if (singleLine.length <= PROFILE_BUDGETS.summaryChars) return singleLine;
  return `${singleLine.slice(0, PROFILE_BUDGETS.summaryChars - 1)}…`;
}

function stableKey(content: string): string {
  return createHash("sha256")
    .update(content.trim().toLocaleLowerCase())
    .digest("hex")
    .slice(0, 8);
}

/**
 * Deterministic profile projection (task 3.1). Resolution order per design
 * decision 3: scope eligibility → active/non-superseded → conflict
 * exclusion → user-confirmed before model-derived → recency → budgets.
 * Identical rows always produce an identical profile.
 */
export function projectProfile(
  rows: readonly ProfileRow[],
  scope: "global" | "project" | "session" = "global",
): PreferenceProfile {
  // Scope eligibility: only global-scope preference/workflow kinds project.
  const eligible = rows.filter(
    (row) => row.kind === "global_preference" || row.kind === "global_workflow",
  );

  // Relation state per content key: a superseding row excludes the row it
  // replaced (task 3.2); identical durable values on both sides are conflicts.
  const byKey = new Map<string, ProfileRow[]>();
  for (const row of eligible) {
    const key = stableKey(row.content);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else
      byKey.set(key, [
        row,
      ]);
  }

  const items: ProfileItem[] = [];
  const meta = {
    conflicts: 0,
    omittedOverBudget: 0,
    pending: 0,
    superseded: 0,
    total: eligible.length,
  };
  for (const bucket of byKey.values()) {
    // Deterministic order inside a bucket: newest confirmation first, then id.
    const ordered = [
      ...bucket,
    ].sort((left, right) => {
      const leftTime = Date.parse(left.timestamp ?? "") || 0;
      const rightTime = Date.parse(right.timestamp ?? "") || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return (left.id ?? "").localeCompare(right.id ?? "");
    });
    const newest = ordered[0] as ProfileRow;
    const kind = newest.kind;
    if (!kind) continue;
    // A row is superseded only when an explicit relation targets it: it lost
    // to the row named by its own supersededBy link (task 3.2). The winner
    // itself is never marked — a link pointing at it does not degrade it.
    const superseded =
      typeof newest.supersededBy === "string" && newest.supersededBy.length > 0;
    const conflicting = bucket.length > 1;
    // Conflict exclusion: durable contradictions are flagged, never silently
    // resolved (task 3.2 scenario 3). A single explicit supersedes link is a
    // resolution, not a conflict.
    let status: ProfileItemStatus = "active";
    if (superseded) status = "superseded";
    else if (conflicting) status = "conflict";
    if (status === "superseded") meta.superseded += 1;
    if (status === "conflict") meta.conflicts += 1;
    if (items.length >= PROFILE_BUDGETS.items) {
      meta.omittedOverBudget += 1;
      continue;
    }
    items.push({
      key: stableKey(newest.content),
      summary: boundedSummary(newest.content),
      status,
      // Both sides of the conflict stay traceable (spec: keep both sources).
      conflictsWith:
        status === "conflict"
          ? ordered
              .map((row) => row.id ?? "")
              .filter((id) => id.length > 0 && id !== (newest.id ?? ""))
          : [],
      ...(typeof newest.supersededBy === "string" && newest.supersededBy.length > 0
        ? {
            supersededBy: newest.supersededBy,
          }
        : {}),
      source: {
        id: newest.id ?? null,
        kind,
        scope: newest.scope ?? describeMemoryKindOrNull(kind)?.scope ?? "global",
        source: newest.sourceBank ?? "default",
        ...(newest.timestamp
          ? {
              timestamp: newest.timestamp,
            }
          : {}),
      },
    });
  }

  // Deterministic item order: kind weight, then key.
  items.sort((left, right) => {
    const weightDelta =
      (KIND_WEIGHT[right.source.kind] ?? 0) - (KIND_WEIGHT[left.source.kind] ?? 0);
    if (weightDelta !== 0) return weightDelta;
    return left.key.localeCompare(right.key);
  });

  meta.pending = items.filter((item) => item.status === "pending").length;
  return {
    items,
    meta,
    scope,
    version: 1,
  };
}

/**
 * Bounded injection text (task 3.3): active items only, one line each,
 * hard character budget. Pending/conflict/superseded items are excluded —
 * they are diagnosable via status but never injected as facts.
 */
export function renderProfileInjection(
  profile: PreferenceProfile,
  charBudget = 700,
): string | null {
  const active = profile.items.filter((item) => item.status === "active");
  if (active.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (const item of active) {
    const line = `- ${item.summary}`;
    if (used + line.length > charBudget) break;
    lines.push(line);
    used += line.length;
  }
  if (lines.length === 0) return null;
  return [
    "<user-preference-profile>",
    ...lines,
    "</user-preference-profile>",
  ].join("\n");
}
