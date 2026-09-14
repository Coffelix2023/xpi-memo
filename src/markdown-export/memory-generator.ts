/**
 * MEMORY.md generation (change markdown-state-projection, tasks 2.1-2.4).
 *
 * The entry set comes from the bank's current state (bounded read in
 * `bank-state.ts`); the L0 event history only annotates provenance: kind,
 * scope, confirming time, session and position. Rows a bank holds without a
 * matching `t1_memory_write` event are still projected, in an explicit
 * Unclassified section marked `source missing` — never dropped and never
 * guessed. Deletion needs no event: a row that left the bank left the view.
 *
 * Exact duplicates stay in the projection and are marked `supersededBy`;
 * order within a section is fixed at (L0 position, memory id) with
 * unannotated rows last, so repeated projection is byte-identical.
 */
import { markExactDuplicates, nearDuplicatePairs } from "../duplicate-report.js";
import {
  describeMemoryKind,
  isMemoryKind,
  MEMORY_KINDS,
  type MemoryKind,
  type MemoryScope,
} from "../kinds.js";
import type { L0Event } from "../l0/types.js";
import type { BankMemoryRow } from "./bank-state.js";

/** Section and kind marker for bank rows with no usable L0 provenance. */
export const UNCLASSIFIED_KIND = "unclassified" as const;
export const UNCLASSIFIED_SECTION_TITLE = "Unclassified";

export type MemoryEntryKind = MemoryKind | typeof UNCLASSIFIED_KIND;

export interface MemoryEntry {
  /** Physical bank the row came from, used for duplicate grouping. */
  bank: string;
  /** Confirming L0 timestamp, or the bank row timestamp when unannotated. */
  confirmedAt: string;
  content: string;
  /** Bank memory id: the projection's primary key. */
  id: string;
  kind: MemoryEntryKind;
  /** L0 position of the confirming write; absent when unannotated. */
  position?: number;
  /** Canonical semantic scope derived from kind metadata. */
  scope?: MemoryScope;
  sessionId?: string;
  supersededBy?: string;
}

export interface MemoryDoc {
  markdown: string;
  sections: Array<{
    kind: MemoryEntryKind;
    title: string;
  }>;
}

/** L0 events per session, used only as the annotation source. */
export interface MemorySource {
  events: L0Event[];
  sessionId: string;
}

export interface MemoryDuplicateCounts {
  exact: number;
  near: number;
}

export interface MemoryAnnotation {
  confirmedAt: string;
  kind: MemoryKind;
  position: number;
  sessionId: string;
}

export const MEMORY_SECTION_TITLES: ReadonlyArray<{
  kinds: readonly MemoryKind[];
  title: string;
}> = MEMORY_KINDS.map((kind) => ({
  title: describeMemoryKind(kind).sectionTitle,
  kinds: [
    kind,
  ],
}));

export interface MemoryDuplicatePair {
  a: string;
  b: string;
  bank: string;
  kind: string;
}

function sectionTitleOf(kind: MemoryEntryKind): string {
  return kind === UNCLASSIFIED_KIND
    ? UNCLASSIFIED_SECTION_TITLE
    : describeMemoryKind(kind).sectionTitle;
}

/** Section order: canonical kind order, then Unclassified last. */
function sectionRank(kind: MemoryEntryKind): number {
  if (kind === UNCLASSIFIED_KIND) return MEMORY_KINDS.length;
  for (const [index, candidate] of MEMORY_KINDS.entries())
    if (candidate === kind) return index;
  return MEMORY_KINDS.length;
}

/** Codepoint comparison: locale-independent, so output is byte-stable. */
function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Fixed sort key (design D3): section, then L0 position, then memory id. */
export function compareMemoryEntries(left: MemoryEntry, right: MemoryEntry): number {
  const bySection = sectionRank(left.kind) - sectionRank(right.kind);
  if (bySection !== 0) return bySection;
  // Unannotated rows have no position and therefore sort to the end.
  // Compared without subtraction: Infinity - Infinity is NaN and would make
  // the comparator non-transitive.
  const leftPosition = left.position ?? Number.POSITIVE_INFINITY;
  const rightPosition = right.position ?? Number.POSITIVE_INFINITY;
  if (leftPosition !== rightPosition) return leftPosition < rightPosition ? -1 : 1;
  return compareIds(left.id, right.id);
}

function isNewerAnnotation(
  candidate: MemoryAnnotation,
  existing: MemoryAnnotation,
): boolean {
  const candidateAt = Date.parse(candidate.confirmedAt) || 0;
  const existingAt = Date.parse(existing.confirmedAt) || 0;
  if (candidateAt !== existingAt) return candidateAt > existingAt;
  if (candidate.position !== existing.position)
    return candidate.position > existing.position;
  return candidate.sessionId > existing.sessionId;
}

/**
 * Index confirmed T1 writes by bank memory id. Writes without a backend id
 * cannot be keyed to a row and are skipped: they annotate nothing rather than
 * being guessed onto some row.
 */
export function collectMemoryAnnotations(
  sources: MemorySource[],
): Map<string, MemoryAnnotation> {
  const annotations = new Map<string, MemoryAnnotation>();
  for (const source of sources) {
    for (const event of source.events) {
      if (event.type !== "t1_memory_write") continue;
      const payload = event.payload as {
        kind?: unknown;
        memoryId?: unknown;
      };
      const memoryId =
        typeof payload.memoryId === "string" && payload.memoryId.length > 0
          ? payload.memoryId
          : null;
      if (!memoryId) continue;
      const kind =
        typeof payload.kind === "string" && isMemoryKind(payload.kind)
          ? payload.kind
          : "session_context";
      const annotation: MemoryAnnotation = {
        confirmedAt: event.timestamp,
        kind,
        position: event.position,
        sessionId: source.sessionId,
      };
      const existing = annotations.get(memoryId);
      if (!existing || isNewerAnnotation(annotation, existing))
        annotations.set(memoryId, annotation);
    }
  }
  return annotations;
}

/**
 * Dual-source merge (design D2): one entry per bank row, keyed by memory id,
 * annotated when a confirming L0 write exists and marked unclassified when it
 * does not. Rows are returned in projection order.
 */
export function projectMemoryEntries(
  rows: BankMemoryRow[],
  annotations: Map<string, MemoryAnnotation>,
): MemoryEntry[] {
  const entries = rows.map((row): MemoryEntry => {
    const annotation = annotations.get(row.id);
    if (!annotation)
      return {
        bank: row.bank,
        confirmedAt: row.timestamp ?? "",
        content: row.content,
        id: row.id,
        kind: UNCLASSIFIED_KIND,
      };
    return {
      bank: row.bank,
      confirmedAt: annotation.confirmedAt,
      content: row.content,
      id: row.id,
      kind: annotation.kind,
      position: annotation.position,
      scope: describeMemoryKind(annotation.kind).scope,
      sessionId: annotation.sessionId,
    };
  });
  return entries.sort(compareMemoryEntries);
}

export function annotateMemoryDuplicates(entries: MemoryEntry[]): MemoryEntry[] {
  return markExactDuplicates(
    entries,
    (entry) => Date.parse(entry.confirmedAt) || entry.position || 0,
  );
}

export function reportNearDuplicates(entries: MemoryEntry[]): MemoryDuplicatePair[] {
  return nearDuplicatePairs(entries);
}

export function duplicateCounts(entries: MemoryEntry[]): MemoryDuplicateCounts {
  const marked = annotateMemoryDuplicates(entries);
  return {
    exact: marked.filter((entry) => entry.supersededBy).length,
    near: reportNearDuplicates(entries).length,
  };
}

function entrySubline(entry: MemoryEntry): string {
  const superseded =
    entry.supersededBy === undefined ? "" : ` · supersededBy \`${entry.supersededBy}\``;
  if (entry.kind === UNCLASSIFIED_KIND)
    return `source \`missing\` · bank \`${entry.bank}\`${superseded}`;
  const date = entry.confirmedAt.slice(0, 10);
  return `confirmed ${date} · \`${entry.kind}\` · scope \`${entry.scope}\` · session \`${entry.sessionId}\` @ position ${entry.position}${superseded}`;
}

/** Render MEMORY.md from an already-merged, already-ordered entry set. */
export function renderMemoryMarkdown(entries: MemoryEntry[]): MemoryDoc {
  const marked = annotateMemoryDuplicates(entries);
  const grouped = new Map<string, MemoryEntry[]>();
  for (const entry of marked) {
    const title = sectionTitleOf(entry.kind);
    const bucket = grouped.get(title);
    if (bucket) bucket.push(entry);
    else
      grouped.set(title, [
        entry,
      ]);
  }

  const sections: Array<{
    kind: MemoryEntryKind;
    title: string;
  }> = [];
  const lines: string[] = [
    "# MEMORY",
    "",
  ];
  const orderedTitles = [
    ...MEMORY_SECTION_TITLES.map((section) => section.title).filter((title) =>
      grouped.has(title),
    ),
    ...(grouped.has(UNCLASSIFIED_SECTION_TITLE)
      ? [
          UNCLASSIFIED_SECTION_TITLE,
        ]
      : []),
  ];
  for (const title of orderedTitles) {
    lines.push(`## ${title}`, "");
    for (const entry of grouped.get(title) ?? [])
      lines.push(`- ${entry.content}`, `  <sub>${entrySubline(entry)}</sub>`);
    lines.push("");
    const firstKind = grouped.get(title)?.[0]?.kind;
    if (firstKind)
      sections.push({
        kind: firstKind,
        title,
      });
  }
  if (marked.length === 0) lines.push("_No confirmed memories yet._", "");
  return {
    markdown: lines.join("\n"),
    sections,
  };
}

/**
 * Project MEMORY.md from bank rows plus their L0 annotation sources: the
 * convenience wrapper used by callers that hold both inputs.
 */
export function generateMemoryMarkdown(
  rows: BankMemoryRow[],
  sources: MemorySource[] = [],
): MemoryDoc {
  return renderMemoryMarkdown(
    projectMemoryEntries(rows, collectMemoryAnnotations(sources)),
  );
}
