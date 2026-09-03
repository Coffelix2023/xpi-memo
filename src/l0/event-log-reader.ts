import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { L0Event, L0EventType } from "./types.js";
import { isL0EventType } from "./types.js";

const ROTATED_PATTERN = /^events\.(\d{3})\.jsonl$/;

export interface EventLogReaderOptions {
  /** session directory containing events.jsonl and rotated files */
  sessionDir: string;
}
export interface EventLogReader {
  /** Raw lines that failed to parse during the most recent read (visible-warning support). */
  corruptLines(): string[];
  /** JSONL file paths in read order (oldest rotation first, active last). */
  files(): string[];
  /**
   * Read events with position > fromPosition, skipping files that cannot
   * contain them (incremental-export fast path, task 14.2). Positions are
   * monotonic per session, so a file whose maximum position is ≤ the mark
   * holds nothing new.
   */
  readAfter(fromPosition: number): Promise<L0Event[]>;
  /** Read all events (active + rotated) in position order, streaming. */
  readAll(): Promise<L0Event[]>;
  /** Read events of one type, preserving order. */
  readByType(type: L0EventType): Promise<L0Event[]>;
  /** Read events with position in [from, to] inclusive. */
  readRange(from: number, to: number): Promise<L0Event[]>;
}

function listFiles(sessionDir: string): string[] {
  const active = join(sessionDir, "events.jsonl");
  const rotated: Array<{
    index: number;
    path: string;
  }> = [];
  try {
    for (const entry of readdirSync(sessionDir)) {
      const match = ROTATED_PATTERN.exec(entry);
      if (match)
        rotated.push({
          index: Number(match[1]),
          path: join(sessionDir, entry),
        });
    }
  } catch {
    // session dir missing: no files
  }
  // Rotation shifts older content to higher indices, so oldest = highest index.
  rotated.sort((a, b) => b.index - a.index);
  const files = rotated.map((entry) => entry.path);
  if (existsSync(active)) files.push(active);
  return files;
}

function parseLine(line: string): L0Event | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as Partial<L0Event>;
    if (
      typeof parsed.position !== "number" ||
      typeof parsed.timestamp !== "string" ||
      !isL0EventType(parsed.type) ||
      typeof parsed.payload !== "object" ||
      parsed.payload === null
    )
      return null;
    return parsed as L0Event;
  } catch {
    // corrupt line: skip per spec (graceful handling)
    return null;
  }
}

interface ReadResult {
  corruptLines: string[];
  events: L0Event[];
}

async function readFilter(
  sessionDir: string,
  accept: (event: L0Event) => boolean,
): Promise<ReadResult> {
  const corruptLines: string[] = [];
  const files = listFiles(sessionDir);
  const perFile = await Promise.all(files.map((file) => readLines(file, corruptLines)));
  const events: L0Event[] = [];
  for (const content of perFile)
    for (const event of content) if (accept(event)) events.push(event);
  return {
    corruptLines,
    events,
  };
}

/** Read one JSONL file into parsed events, tolerating corrupt lines. */
async function readLines(
  file: string,
  corruptLines: string[] = [],
): Promise<L0Event[]> {
  const events: L0Event[] = [];
  const stream = createReadStream(file, {
    encoding: "utf8",
  });
  const lines = createInterface({
    crlfDelay: Infinity,
    input: stream,
  });
  for await (const line of lines) {
    const event = parseLine(line);
    if (event) events.push(event);
    else if (line.trim()) corruptLines.push(line);
  }
  return events;
}

export function createEventLogReader(options: EventLogReaderOptions): EventLogReader {
  let lastCorruptLines: string[] = [];
  const run = async (accept: (event: L0Event) => boolean): Promise<L0Event[]> => {
    const result = await readFilter(options.sessionDir, accept);
    lastCorruptLines = result.corruptLines;
    return result.events;
  };
  return {
    corruptLines: () => lastCorruptLines,
    files: () => listFiles(options.sessionDir),
    readAfter: async (fromPosition) => {
      const result = await readAfter(options.sessionDir, fromPosition);
      lastCorruptLines = result.corruptLines;
      return result.events;
    },
    readAll: () => run(() => true),
    readByType: (type) => run((event) => event.type === type),
    readRange: (from, to) =>
      run((event) => event.position >= from && event.position <= to),
  };
}

/**
 * Incremental fast path (task 14.2): read only events with position >
 * fromPosition. Positions are monotonic within a session, so each file is
 * pre-checked with a bounded tail read; a rotated file whose highest position
 * is <= fromPosition is skipped entirely. The active file is always read
 * (a writer may have appended since the mark). Corrupt lines are tolerated
 * the same way as readAll.
 */
async function readAfter(
  sessionDir: string,
  fromPosition: number,
): Promise<ReadResult> {
  const corruptLines: string[] = [];
  const files = listFiles(sessionDir);
  if (files.length === 0)
    return {
      corruptLines: [],
      events: [],
    };
  const toRead: string[] = [];
  // All but the last file are rotated files; the last is always the active one.
  for (const file of files.slice(0, -1)) {
    // biome-ignore lint/performance/noAwaitInLoops: 只过滤需要的文件,实际读取已用 Promise.all 并行
    const max = await maxPositionTail(file, corruptLines);
    if (max > fromPosition || max === -1) toRead.push(file);
  }
  toRead.push(files.at(-1) as string);
  const perFile = await Promise.all(
    toRead.map((file) => readLines(file, corruptLines)),
  );
  const events: L0Event[] = [];
  for (const content of perFile)
    for (const event of content) if (event.position > fromPosition) events.push(event);
  return {
    corruptLines,
    events,
  };
}

/**
 * Highest event position in a file, via a bounded tail scan (rotated files
 * are position-ordered, so the max is the last valid line). Returns -1 when
 * the tail is inconclusive (e.g. corrupt tail lines), forcing a full read.
 */
async function maxPositionTail(file: string, corruptLines: string[]): Promise<number> {
  try {
    const stats = statSync(file);
    const tailSize = Math.min(stats.size, 64 * 1024);
    const handle = openSync(file, "r");
    try {
      const buffer = Buffer.alloc(tailSize);
      const read = readSync(handle, buffer, 0, tailSize, stats.size - tailSize);
      const text = buffer.toString("utf8", 0, read);
      // Drop the first partial line when reading from mid-file.
      const lines = text.split("\n");
      const relevant = stats.size > tailSize ? lines.slice(1) : lines;
      let max = -1;
      for (const line of relevant) {
        if (!line.trim()) continue;
        const parsed = parseLine(line);
        if (parsed) max = Math.max(max, parsed.position);
        else corruptLines.push(line);
      }
      return max;
    } finally {
      closeSync(handle);
    }
  } catch {
    return -1;
  }
}
