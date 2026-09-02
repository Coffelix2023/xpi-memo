/**
 * MEMORY.md generation (Tasks 8.2, 8.5).
 *
 * Long-term memory view derived from confirmed T1 writes (t1_memory_write
 * events). Sections are derived from the canonical T1 taxonomy.
 * Duplicate content keeps only its latest version; entry order within a
 * section is stable (by L0 position) so Git diffs stay minimal.
 */

import { describeMemoryKind, MEMORY_KINDS, type MemoryKind } from "../kinds.js";
import type { L0Event } from "../l0/types.js";

export interface MemoryEntry {
  /** ISO 8601 timestamp of the latest confirming event */
  confirmedAt: string;
  content: string;
  kind: MemoryKind;
  /** L0 position of the latest confirming event */
  position: number;
  sessionId: string;
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

export const MEMORY_SECTION_TITLES: ReadonlyArray<{
  kinds: readonly MemoryKind[];
  title: string;
}> = MEMORY_KINDS.map((kind) => ({
  title: describeMemoryKind(kind).sectionTitle,
  kinds: [
    kind,
  ],
}));

const WHITESPACE = /\s+/g;

function sectionTitleOf(kind: MemoryKind): string {
  return describeMemoryKind(kind).sectionTitle;
}

function normalize(content: string): string {
  return content.trim().replace(WHITESPACE, " ");
}

/**
 * Latest-wins dedupe on normalized content across all sessions: later L0
 * positions override earlier ones, matching supersession semantics.
 */
export function collectMemoryEntries(sources: MemorySource[]): MemoryEntry[] {
  const byContent = new Map<string, MemoryEntry>();
  for (const source of sources) {
    for (const event of source.events) {
      if (event.type !== "t1_memory_write") continue;
      const payload = event.payload as {
        content?: unknown;
        kind?: unknown;
      };
      const content = typeof payload.content === "string" ? payload.content : "";
      if (!content) continue;
      const kind =
        typeof payload.kind === "string"
          ? (payload.kind as MemoryKind)
          : "session_context";
      const entry: MemoryEntry = {
        confirmedAt: event.timestamp,
        content,
        kind,
        position: event.position,
        sessionId: source.sessionId,
      };
      const key = normalize(content);
      const existing = byContent.get(key);
      if (!existing || event.position > existing.position) byContent.set(key, entry);
    }
  }
  return [
    ...byContent.values(),
  ].sort((a, b) => a.position - b.position);
}

/** Render MEMORY.md from confirmed T1 write events across sessions. */
export function generateMemoryMarkdown(sources: MemorySource[]): MemoryDoc {
  const entries = collectMemoryEntries(sources);
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
      lines.push(
        `- ${entry.content}`,
        `  <sub>confirmed ${date} · \`${entry.kind}\` · session \`${entry.sessionId}\` @ position ${entry.position}</sub>`,
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
