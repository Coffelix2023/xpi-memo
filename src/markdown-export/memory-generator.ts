/**
 * MEMORY.md generation (Tasks 8.2, 8.5).
 *
 * Long-term memory view derived from confirmed T1 writes (t1_memory_write
 * events). Sections are derived from the canonical T1 taxonomy.
 * Exact duplicates stay in the export and are marked `supersededBy`;
 * entry order within a section is stable (by L0 position).
 */
import { markExactDuplicates, nearDuplicatePairs } from "../duplicate-report.js";
import type { MemoryScope } from "../kinds.js";
import { describeMemoryKind, MEMORY_KINDS, type MemoryKind } from "../kinds.js";
import type { L0Event } from "../l0/types.js";

export interface MemoryEntry {
  /** Physical bank name from the confirming event, used only for duplicate grouping. */
  bank: string;
  /** ISO 8601 timestamp of the latest confirming event */
  confirmedAt: string;
  content: string;
  /** Stable export id: session@position. */
  id: string;
  kind: MemoryKind;
  /** Mnemosyne backend id used to correlate memory_deleted events. */
  memoryId?: string;
  /** L0 position of the latest confirming event */
  position: number;
  /** Canonical semantic scope derived from kind metadata (task 2.4). */
  scope: MemoryScope;
  sessionId: string;
  supersededBy?: string;
}

export interface MemoryDoc {
  markdown: string;
  sections: Array<{
    kind: MemoryKind;
    title: string;
  }>;
}

export interface MemorySource {
  events: L0Event[];
  sessionId: string;
}

export interface MemoryDuplicateCounts {
  exact: number;
  near: number;
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

function sectionTitleOf(kind: MemoryKind): string {
  return describeMemoryKind(kind).sectionTitle;
}

function bankOf(payload: { bank?: unknown }): string {
  return typeof payload.bank === "string" && payload.bank.length > 0
    ? payload.bank
    : "default";
}

/**
 * Collect confirmed T1 writes. Exact duplicates stay in the export and are
 * marked `supersededBy` later; SQLite is never rewritten.
 */
// TODO(L2): rebuild MEMORY.md from the current T1 bank instead of projecting L0 history; see fast-fix plan.md.
export function collectMemoryEntries(sources: MemorySource[]): MemoryEntry[] {
  const deletedIds = new Set<string>();
  for (const source of sources) {
    for (const event of source.events) {
      if (event.type !== "memory_deleted") continue;
      const memoryId = event.payload.memoryId;
      if (typeof memoryId === "string" && memoryId.length > 0) deletedIds.add(memoryId);
    }
  }

  const entries: MemoryEntry[] = [];
  for (const source of sources) {
    for (const event of source.events) {
      if (event.type !== "t1_memory_write") continue;
      const payload = event.payload as {
        bank?: unknown;
        content?: unknown;
        kind?: unknown;
        memoryId?: unknown;
      };
      const memoryId =
        typeof payload.memoryId === "string" ? payload.memoryId : undefined;
      if (memoryId && deletedIds.has(memoryId)) continue;
      const content = typeof payload.content === "string" ? payload.content : "";
      if (!content) continue;
      const kind =
        typeof payload.kind === "string"
          ? (payload.kind as MemoryKind)
          : "session_context";
      entries.push({
        bank: bankOf(payload),
        confirmedAt: event.timestamp,
        content,
        id: `${source.sessionId}@${event.position}`,
        ...(memoryId
          ? {
              memoryId,
            }
          : {}),
        kind,
        position: event.position,
        scope: describeMemoryKind(kind).scope,
        sessionId: source.sessionId,
      });
    }
  }
  return entries.sort((a, b) => a.position - b.position);
}

export function annotateMemoryDuplicates(entries: MemoryEntry[]): MemoryEntry[] {
  return markExactDuplicates(
    entries,
    (entry) => Date.parse(entry.confirmedAt) || entry.position,
  );
}

export function reportNearDuplicates(entries: MemoryEntry[]): Array<{
  a: string;
  b: string;
  bank: string;
  kind: string;
}> {
  return nearDuplicatePairs(entries);
}

export function duplicateCounts(entries: MemoryEntry[]): MemoryDuplicateCounts {
  const marked = annotateMemoryDuplicates(entries);
  return {
    exact: marked.filter((entry) => entry.supersededBy).length,
    near: reportNearDuplicates(entries).length,
  };
}

/** Render MEMORY.md from confirmed T1 write events across sessions. */
export function generateMemoryMarkdown(sources: MemorySource[]): MemoryDoc {
  const entries = annotateMemoryDuplicates(collectMemoryEntries(sources));
  const grouped = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const title = sectionTitleOf(entry.kind);
    const bucket = grouped.get(title);
    if (bucket) bucket.push(entry);
    else
      grouped.set(title, [
        entry,
      ]);
  }

  const sections: Array<{
    kind: MemoryKind;
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
    ...(grouped.has("Other")
      ? [
          "Other",
        ]
      : []),
  ];
  for (const title of orderedTitles) {
    lines.push(`## ${title}`, "");
    for (const entry of grouped.get(title) ?? []) {
      const date = entry.confirmedAt.slice(0, 10);
      const superseded =
        entry.supersededBy === undefined
          ? ""
          : ` · supersededBy \`${entry.supersededBy}\``;
      lines.push(
        `- ${entry.content}`,
        `  <sub>confirmed ${date} · \`${entry.kind}\` · scope \`${entry.scope}\` · session \`${entry.sessionId}\` @ position ${entry.position}${superseded}</sub>`,
      );
    }
    lines.push("");
    const firstKind = grouped.get(title)?.[0]?.kind;
    if (firstKind)
      sections.push({
        kind: firstKind,
        title,
      });
  }
  if (entries.length === 0) lines.push("_No confirmed memories yet._", "");
  return {
    markdown: lines.join("\n"),
    sections,
  };
}
