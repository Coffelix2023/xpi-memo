/**
 * Daily log generation (Tasks 8.3, 8.6).
 *
 * Groups exported entries into `daily/YYYY-MM-DD.md` files. Multi-session
 * days merge into one file with session-boundary markers; handoff entries
 * from compaction events carry a "Handoff:" prefix. Days without events
 * produce no file.
 */

import type { L0Event } from "../l0/types.js";
import { type ExportFilters, transformEvent } from "./transformer.js";

export interface DailyLog {
  /** ISO 8601 date, e.g. 2024-03-15 */
  date: string;
  markdown: string;
}

export interface DailyGeneratorOptions {
  filters?: ExportFilters;
}

function dateOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Group events by calendar day (UTC, from the event timestamp) and render one
 * Markdown document per day. Entries appear in event position order; session
 * boundaries are marked the first time a new session appears within a day.
 */
export interface DailyGeneratorInput {
  events: L0Event[];
  sessionId: string;
}

/**
 * Group events by calendar day (UTC, from the event timestamp) and render one
 * Markdown document per day. Events from multiple sessions merge into the
 * same day file; session boundaries are marked the first time a new session
 * appears within a day.
 */
export function generateDailyLogs(
  inputs: DailyGeneratorInput[],
  options: DailyGeneratorOptions = {},
): DailyLog[] {
  const byDay = new Map<string, L0Event[]>();
  for (const input of inputs)
    for (const event of input.events) {
      const date = dateOf(event.timestamp);
      const bucket = byDay.get(date);
      if (bucket) bucket.push(event);
      else
        byDay.set(date, [
          event,
        ]);
    }

  const logs: DailyLog[] = [];
  for (const [date, dayEvents] of [
    ...byDay.entries(),
  ].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lines: string[] = [
      `# ${date}`,
      "",
    ];
    let currentSession: string | null = null;
    for (const event of dayEvents) {
      const session = sessionOf(event, inputs);
      if (event.type === "compaction") {
        if (currentSession !== session) {
          currentSession = session;
          lines.push("", `## Session \`${currentSession}\``, "");
        }
        lines.push("", "## Handoff", "");
        lines.push(renderHandoff(event, currentSession));
        continue;
      }
      if (session !== currentSession) {
        currentSession = session;
        lines.push("", `## Session \`${currentSession}\``, "");
      }
      const entry = transformEvent(event, currentSession, options.filters);
      if (entry) lines.push(entry);
    }
    lines.push("");
    logs.push({
      date,
      markdown: lines.join("\n"),
    });
  }
  return logs;
}

/** Find the owning session id by matching position against each input's events. */
function sessionOf(event: L0Event, inputs: DailyGeneratorInput[]): string {
  for (const input of inputs) if (input.events.includes(event)) return input.sessionId;
  return "unknown";
}
/** "Handoff:" prefixed entry (spec: compaction preserves progress across resets). */
function renderHandoff(event: L0Event, sessionId: string | null): string {
  const payload = event.payload as {
    activeTasks?: unknown;
    decisions?: unknown;
    reason?: unknown;
    summary?: unknown;
  };
  const parts = [
    `Handoff: ${String(payload.summary ?? "session context compacted")}`,
  ];
  if (payload.decisions !== undefined)
    parts.push(`Decisions: ${JSON.stringify(payload.decisions)}`);
  if (payload.activeTasks !== undefined)
    parts.push(`Active tasks: ${JSON.stringify(payload.activeTasks)}`);
  if (payload.reason !== undefined) parts.push(`Reason: ${String(payload.reason)}`);
  parts.push(
    `(session \`${sessionId ?? "unknown"}\` @ position ${event.position}, ${event.timestamp})`,
  );
  return `- \`${event.timestamp.slice(11, 19)}\` ${parts.join(" — ")}`;
}
