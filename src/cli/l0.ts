/**
 * L0 operational status (Task 7.1).
 *
 * - `l0Status`: session count, event count, disk usage per session.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { createEventLogReader } from "../l0/event-log-reader.js";
import { sessionsDirFor } from "../l0/l0-runtime.js";
export interface SessionStats {
  bytes: number;
  eventCount: number;
  sessionId: string;
}

export interface L0Status {
  enabled: boolean;
  sessionCount: number;
  sessions: SessionStats[];
  totalBytes: number;
  totalEvents: number;
}

function countLines(file: string): number {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

export function l0Status(
  options: { configHome?: string; env?: NodeJS.ProcessEnv } = {},
): L0Status {
  const { config } = loadConfig({
    configHome: options.configHome,
    env: options.env,
  });
  const sessionsRoot = sessionsDirFor(config.dataDir);
  const sessions: SessionStats[] = [];

  if (existsSync(sessionsRoot)) {
    for (const entry of readdirSync(sessionsRoot)) {
      const sessionDir = join(sessionsRoot, entry);
      const reader = createEventLogReader({
        sessionDir,
      });
      let eventCount = 0;
      let bytes = 0;
      for (const file of reader.files()) {
        bytes += statSync(file).size;
        eventCount += countLines(file);
      }
      sessions.push({
        bytes,
        eventCount,
        sessionId: entry,
      });
    }
  }
  sessions.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

  return {
    enabled: config.l0Enabled,
    sessionCount: sessions.length,
    sessions,
    totalBytes: sessions.reduce((sum, session) => sum + session.bytes, 0),
    totalEvents: sessions.reduce((sum, session) => sum + session.eventCount, 0),
  };
}
