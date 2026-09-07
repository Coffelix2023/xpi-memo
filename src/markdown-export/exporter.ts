/**
 * Markdown export orchestration (Tasks 8.x, 9.5, 9.6, 10.1, 10.2).
 *
 * Derives Markdown from L0 session logs into <dataDir>/markdown/:
 * - MEMORY.md: long-term memory view (latest-wins across sessions)
 * - daily/YYYY-MM-DD.md: activity logs, append-only per day
 *
 * Incremental export tracks the highest exported L0 position per session in
 * a state file and skips already-exported events. Per-session failures are
 * reported via SessionExportResult; write failures surface as warnings.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { createEventLogReader } from "../l0/event-log-reader.js";
import { sessionsDirFor } from "../l0/l0-runtime.js";
import { sessionDirFor } from "../l0/session-manager.js";
import type { L0Event } from "../l0/types.js";
import { type DailyLog, generateDailyLogs } from "./daily-generator.js";
import {
  collectMemoryEntries,
  duplicateCounts,
  generateMemoryMarkdown,
  type MemorySource,
  memoryProjectionDiagnostics,
} from "./memory-generator.js";
import {
  corruptEventLine,
  type ExportFilters,
  redactSensitive,
} from "./transformer.js";

export interface ExportOptions {
  configHome?: string;
  env?: NodeJS.ProcessEnv;
  filters?: ExportFilters;
  /** Full regeneration: ignore incremental state and re-export everything. */
  force?: boolean;
  /** Rebuild MEMORY.md from all events without appending daily logs. */
  memoryOnly?: boolean;
  /** Restrict export to one session id. */
  sessionId?: string;
}

export interface SessionExportResult {
  error?: string;
  exportedEvents: number;
  sessionId: string;
}

export interface ExportResult {
  dailyFiles: number;
  duplicates: {
    exact: number;
    near: number;
  };
  /** Highest exported L0 position per session, persisted for incremental runs. */
  exportedPositions: Record<string, number>;
  markdownDir: string;
  memoryMd: boolean;
  /** Independent MEMORY.md projection outcome. */
  memoryProjection: "complete" | "pending" | "failed" | "unchanged";
  sessions: SessionExportResult[];
  warnings: string[];
}

interface SessionRead {
  corruptLines: string[];
  error?: string;
  events: L0Event[];
  filters?: ExportFilters;
  fromPosition: number;
  sessionId: string;
}

const STATE_FILE = "export-state.json";
const MEMORY_PROJECTION_STATE_FILE = "memory-projection-state.json";
const LEADING_BLANKS = /^\n+/;
const TRAILING_NEWLINES = /\n*$/;

interface ExportState {
  positions: Record<string, number>;
  version: 1;
}

export type MemoryProjectionStatus = "complete" | "pending" | "failed";

interface MemoryProjectionState {
  status: MemoryProjectionStatus;
  version: 1;
}
export function markdownDirFor(dataDir: string): string {
  return join(dataDir, "markdown");
}

function readState(markdownDir: string): ExportState {
  const path = join(markdownDir, STATE_FILE);
  if (!existsSync(path))
    return {
      positions: {},
      version: 1,
    };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ExportState>;
    if (typeof parsed.positions !== "object" || parsed.positions === null)
      return {
        positions: {},
        version: 1,
      };
    return {
      positions: parsed.positions,
      version: 1,
    };
  } catch {
    return {
      positions: {},
      version: 1,
    };
  }
}

function writeState(markdownDir: string, state: ExportState): void {
  const path = join(markdownDir, STATE_FILE);
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

/** Atomic-ish write: temp file then rename, so a crash never leaves a partial file. */
function writeFileAtomic(path: string, content: string): void {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, content, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

async function readSession(
  sessionId: string,
  dataDir: string,
  fromPosition: number,
  filters?: ExportFilters,
): Promise<SessionRead> {
  try {
    const reader = createEventLogReader({
      sessionDir: sessionDirFor(dataDir, sessionId),
    });
    // Incremental fast path (task 14.2): readAfter skips rotated files whose
    // positions are all below the export mark; positions are monotonic.
    const events = await reader.readAfter(fromPosition);
    return {
      corruptLines: reader.corruptLines(),
      events,
      filters,
      fromPosition,
      sessionId,
    };
  } catch (error) {
    return {
      corruptLines: [],
      error: error instanceof Error ? error.message : "export-failed",
      events: [],
      filters,
      fromPosition,
      sessionId,
    };
  }
}
async function readAllSession(
  sessionId: string,
  dataDir: string,
  filters?: ExportFilters,
): Promise<SessionRead> {
  try {
    const reader = createEventLogReader({
      sessionDir: sessionDirFor(dataDir, sessionId),
    });
    const events = await reader.readAll();
    return {
      corruptLines: reader.corruptLines(),
      events,
      filters,
      fromPosition: 0,
      sessionId,
    };
  } catch (error) {
    return {
      corruptLines: [],
      error: error instanceof Error ? error.message : "export-failed",
      events: [],
      filters,
      fromPosition: 0,
      sessionId,
    };
  }
}

function readMemoryProjectionState(markdownDir: string): MemoryProjectionState | null {
  const path = join(markdownDir, MEMORY_PROJECTION_STATE_FILE);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<MemoryProjectionState>;
    if (
      parsed.status !== "complete" &&
      parsed.status !== "pending" &&
      parsed.status !== "failed"
    )
      return null;
    return {
      status: parsed.status,
      version: 1,
    };
  } catch {
    return null;
  }
}

/** Read only the persisted MEMORY projection state for status diagnostics. */
export function memoryProjectionStatusFor(
  dataDir: string,
): MemoryProjectionStatus | null {
  return readMemoryProjectionState(markdownDirFor(dataDir))?.status ?? null;
}

function writeMemoryProjectionState(
  markdownDir: string,
  status: MemoryProjectionStatus,
): void {
  writeFileAtomic(
    join(markdownDir, MEMORY_PROJECTION_STATE_FILE),
    `${JSON.stringify(
      {
        status,
        version: 1,
      },
      null,
      2,
    )}\n`,
  );
}

function memoryAffecting(events: L0Event[]): boolean {
  return events.some(
    (event) => event.type === "t1_memory_write" || event.type === "memory_deleted",
  );
}

export async function exportMarkdown(
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { config } = loadConfig({
    configHome: options.configHome,
    env: options.env,
  });
  const dataDir = config.dataDir;
  const markdownDir = markdownDirFor(dataDir);
  const filters: ExportFilters = {
    excludeToolResults: config.excludeToolResults,
    privacy: config.privacy,
    ...options.filters,
  };
  const state = readState(markdownDir);
  const projectionState = readMemoryProjectionState(markdownDir);
  const memoryOnly = options.memoryOnly === true;

  const sessionsRoot = sessionsDirFor(dataDir);
  let sessionIds: string[] = [];
  // MEMORY projection is a global derived view: it must always fold every
  // session's full history, even when the daily export is filtered to one.
  const projectionSessionIds = existsSync(sessionsRoot)
    ? readdirSync(sessionsRoot).sort()
    : [];
  if (options.sessionId)
    sessionIds = [
      options.sessionId,
    ];
  else sessionIds = projectionSessionIds;
  const reads = await Promise.all(
    sessionIds.map((sessionId) => {
      const fromPosition =
        memoryOnly || options.force ? 0 : (state.positions[sessionId] ?? 0);
      return memoryOnly
        ? readAllSession(sessionId, dataDir, filters)
        : readSession(sessionId, dataDir, fromPosition, filters);
    }),
  );

  const warnings: string[] = [];
  const sessions: SessionExportResult[] = [];
  const dailyByDate = new Map<string, DailyLog[]>();
  const nextPositions: Record<string, number> = {
    ...state.positions,
  };
  const incrementalMemoryInputs: MemorySource[] = [];
  for (const read of reads)
    foldSession(read, {
      dailyByDate,
      memoryInputs: incrementalMemoryInputs,
      nextPositions,
      sessions,
      warnings,
    });

  const shouldProject =
    memoryOnly ||
    options.force === true ||
    projectionState?.status === "pending" ||
    projectionState?.status === "failed" ||
    incrementalMemoryInputs.some(({ events }) => memoryAffecting(events));
  let projectionInputs = incrementalMemoryInputs;
  let projectionBlocked = false;
  if (shouldProject && !memoryOnly) {
    const fullReads = await Promise.all(
      projectionSessionIds.map((sessionId) =>
        readAllSession(sessionId, dataDir, filters),
      ),
    );
    projectionInputs = [];
    for (const read of fullReads) {
      if (read.error) {
        projectionBlocked = true;
        warnings.push(
          `MEMORY.md: session ${read.sessionId} unreadable (${read.error})`,
        );
        continue;
      }
      if (read.corruptLines.length > 0)
        warnings.push(
          `MEMORY.md: session ${read.sessionId} skipped ${read.corruptLines.length} corrupt event line(s)`,
        );
      projectionInputs.push({
        events: read.events,
        sessionId: read.sessionId,
      });
    }
  }
  for (const diagnostic of memoryProjectionDiagnostics(projectionInputs))
    warnings.push(
      `MEMORY.md: ${diagnostic.code} at session ${diagnostic.sessionId} position ${diagnostic.position}`,
    );

  const persisted = persistOutputs({
    dailyByDate,
    filters,
    markdownDir,
    memoryInputs: projectionInputs,
    nextPositions,
    projectionBlocked,
    projectionRequested: shouldProject,
    skipDaily: memoryOnly,
    skipState: memoryOnly,
    warnings,
  });
  return {
    dailyFiles: persisted.dailyFiles,
    duplicates: duplicateCounts(collectMemoryEntries(projectionInputs)),
    exportedPositions: nextPositions,
    markdownDir,
    memoryMd: persisted.memoryMd,
    memoryProjection: persisted.memoryProjection,
    sessions,
    warnings,
  };
}

/** Fold one session's read result into the export accumulators. */
function foldSession(
  read: SessionRead,
  into: {
    dailyByDate: Map<string, DailyLog[]>;
    memoryInputs: MemorySource[];
    nextPositions: Record<string, number>;
    sessions: SessionExportResult[];
    warnings: string[];
  },
): void {
  const { sessions, warnings } = into;
  if (read.error) {
    sessions.push({
      error: read.error,
      exportedEvents: 0,
      sessionId: read.sessionId,
    });
    return;
  }
  if (read.events.length === 0 && read.corruptLines.length === 0) {
    sessions.push({
      exportedEvents: 0,
      sessionId: read.sessionId,
    });
    return;
  }
  const { corruptLines, events, sessionId } = read;
  for (const log of generateDailyLogs(
    [
      {
        events,
        sessionId,
      },
    ],
    {
      filters: read.filters,
    },
  )) {
    const bucket = into.dailyByDate.get(log.date);
    if (bucket) bucket.push(log);
    else
      into.dailyByDate.set(log.date, [
        log,
      ]);
  }
  // Corrupt lines carry no timestamp; attach them to the day of the last parsed event.
  if (corruptLines.length > 0) {
    warnings.push(
      `session ${sessionId}: skipped ${corruptLines.length} corrupt event line(s)`,
    );
    const last = events.at(-1);
    const fallbackDate = last
      ? last.timestamp.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const bucket = into.dailyByDate.get(fallbackDate) ?? [];
    for (const raw of corruptLines)
      bucket.push({
        date: fallbackDate,
        markdown: corruptEventLine(raw),
      });
    into.dailyByDate.set(fallbackDate, bucket);
  }
  into.memoryInputs.push({
    events,
    sessionId,
  });
  into.nextPositions[sessionId] = events.reduce(
    (max, event) => Math.max(max, event.position),
    read.fromPosition,
  );
  sessions.push({
    exportedEvents: events.length,
    sessionId,
  });
}

/** Write daily logs, complete MEMORY projection, and independent state. */
function persistOutputs(into: {
  dailyByDate: Map<string, DailyLog[]>;
  filters: ExportFilters;
  markdownDir: string;
  memoryInputs: MemorySource[];
  nextPositions: Record<string, number>;
  projectionBlocked: boolean;
  projectionRequested: boolean;
  skipDaily?: boolean;
  skipState?: boolean;
  warnings: string[];
}): {
  dailyFiles: number;
  memoryMd: boolean;
  memoryProjection: "complete" | "failed" | "unchanged";
} {
  mkdirSync(join(into.markdownDir, "daily"), {
    recursive: true,
  });
  let dailyFiles = 0;
  if (!into.skipDaily) {
    for (const date of [
      ...into.dailyByDate.keys(),
    ].sort()) {
      const logs = into.dailyByDate.get(date) ?? [];
      try {
        appendDailyFile(join(into.markdownDir, "daily", `${date}.md`), logs);
        dailyFiles += 1;
      } catch (error) {
        into.warnings.push(
          `daily ${date}: write failed (${error instanceof Error ? error.message : "daily-write-failed"})`,
        );
      }
    }
  }

  let memoryMd = false;
  let memoryProjection: "complete" | "failed" | "unchanged" = "unchanged";
  if (into.projectionRequested) {
    if (into.projectionBlocked) {
      memoryProjection = "failed";
      into.warnings.push(
        "MEMORY.md: projection pending because L0 history is incomplete",
      );
      try {
        writeMemoryProjectionState(into.markdownDir, "pending");
      } catch {
        // The returned warning still identifies the retry condition.
      }
    } else {
      try {
        writeFileAtomic(
          join(into.markdownDir, "MEMORY.md"),
          into.filters.privacy
            ? redactSensitive(generateMemoryMarkdown(into.memoryInputs).markdown)
            : generateMemoryMarkdown(into.memoryInputs).markdown,
        );
        writeMemoryProjectionState(into.markdownDir, "complete");
        memoryMd = true;
        memoryProjection = "complete";
      } catch (error) {
        memoryProjection = "failed";
        into.warnings.push(
          `MEMORY.md: write failed (${error instanceof Error ? error.message : "memory-write-failed"})`,
        );
        try {
          writeMemoryProjectionState(into.markdownDir, "failed");
        } catch {
          // Keep the failed projection observable through the returned warning.
        }
      }
    }
  }
  if (!into.skipState) {
    try {
      writeState(into.markdownDir, {
        positions: into.nextPositions,
        version: 1,
      });
    } catch (error) {
      into.warnings.push(
        `state: could not persist export positions (${error instanceof Error ? error.message : "unknown"}) — next run re-exports`,
      );
    }
  }
  return {
    dailyFiles,
    memoryMd,
    memoryProjection,
  };
}

/** Append-only day file: create with its own header when missing, append entry lines otherwise. */
function appendDailyFile(path: string, logs: DailyLog[]): void {
  // Multi-line blocks carry their own "# date" header (first two lines); drop it so the
  // file has exactly one. Single-line entries (corrupt-line warnings) pass through whole.
  const bodies = logs.map((log) => {
    const lines = log.markdown.split("\n");
    const body = lines.length > 1 ? lines.slice(2).join("\n") : lines.join("\n");
    return body.replace(LEADING_BLANKS, "");
  });
  if (!existsSync(path)) {
    writeFileAtomic(path, `# ${logs[0].date}\n\n${bodies.join("\n")}`);
    return;
  }
  const existing = readFileSync(path, "utf8").replace(TRAILING_NEWLINES, "\n");
  writeFileAtomic(path, `${existing}${bodies.join("\n")}\n`);
}

/** Validation: all L0 events are covered by the persisted export positions (Task 10.1). */
export async function validateExport(dataDir: string): Promise<{
  missing: number;
  ok: boolean;
  sessions: number;
}> {
  const state = readState(markdownDirFor(dataDir));
  const sessionsRoot = sessionsDirFor(dataDir);
  if (!existsSync(sessionsRoot))
    return {
      missing: 0,
      ok: true,
      sessions: 0,
    };
  let missing = 0;
  let sessions = 0;
  const maxes = await Promise.all(
    readdirSync(sessionsRoot).map(async (sessionId) => {
      const reader = createEventLogReader({
        sessionDir: sessionDirFor(dataDir, sessionId),
      });
      if (reader.files().length === 0) return null;
      const events = await reader.readAll();
      return {
        max: events.reduce((acc, event) => Math.max(acc, event.position), 0),
        sessionId,
      };
    }),
  );
  for (const item of maxes) {
    if (!item) continue;
    sessions += 1;
    missing += Math.max(0, item.max - (state.positions[item.sessionId] ?? 0));
  }
  return {
    missing,
    ok: missing === 0,
    sessions,
  };
}
