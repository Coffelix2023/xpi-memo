import { createReadStream, existsSync, readdirSync } from "node:fs";
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
    readAll: () => run(() => true),
    readByType: (type) => run((event) => event.type === type),
    readRange: (from, to) =>
      run((event) => event.position >= from && event.position <= to),
  };
}
