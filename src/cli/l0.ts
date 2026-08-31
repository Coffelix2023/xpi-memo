/**
 * L0 operational commands (Task 7.1-7.3).
 *
 * - `l0 status`: session count, event count, disk usage per session.
 * - `doctor --reconcile`: compare L0 t1_memory_write events with audit.json
 *   writes; report divergence and whether replay can recover missing writes.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { createEventLogReader } from "../l0/event-log-reader.js";
import { sessionsDirFor } from "../l0/l0-runtime.js";
import type { L0Event } from "../l0/types.js";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export interface ReconcileReport {
  /** write entries recorded in audit.json */
  auditWrites: number;
  /** true when L0 has writes missing from audit (replayable) */
  canReplay: boolean;
  divergences: string[];
  /** t1_memory_write events found in L0 */
  l0Writes: number;
}

export async function reconcile(
  options: { configHome?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<ReconcileReport> {
  const { config } = loadConfig({
    configHome: options.configHome,
    env: options.env,
  });
  const sessionsRoot = sessionsDirFor(config.dataDir);
  const l0Writes: L0Event[] = [];

  if (existsSync(sessionsRoot)) {
    const readers = readdirSync(sessionsRoot).map((entry) =>
      createEventLogReader({
        sessionDir: join(sessionsRoot, entry),
      }),
    );
    const allEvents = await Promise.all(readers.map((reader) => reader.readAll()));
    for (const events of allEvents)
      for (const event of events)
        if (event.type === "t1_memory_write") l0Writes.push(event);
  }

  const auditPath = join(config.dataDir, "audit.json");
  let auditWrites = 0;
  if (existsSync(auditPath)) {
    try {
      const parsed = JSON.parse(readFileSync(auditPath, "utf8")) as {
        entries?: Array<{
          action?: unknown;
        }>;
      };
      auditWrites = (parsed.entries ?? []).filter(
        (entry) => entry.action === "write",
      ).length;
    } catch {
      // corrupt audit counts as zero; divergence is reported below
    }
  }

  const divergences: string[] = [];
  if (l0Writes.length !== auditWrites) {
    divergences.push(
      `L0 has ${l0Writes.length} t1_memory_write events but audit.json has ${auditWrites} write entries`,
    );
  }

  return {
    auditWrites,
    canReplay: l0Writes.length > auditWrites,
    divergences,
    l0Writes: l0Writes.length,
  };
}

export function formatL0Status(status: L0Status): string {
  const lines = [
    `L0 ${status.enabled ? "enabled" : "DISABLED (v0.1 behavior)"}`,
    `Sessions: ${status.sessionCount}`,
    `Events: ${status.totalEvents}`,
    `Disk usage: ${formatBytes(status.totalBytes)}`,
  ];
  for (const session of status.sessions.slice(-5)) {
    lines.push(
      `  ${session.sessionId}: ${session.eventCount} events, ${formatBytes(session.bytes)}`,
    );
  }
  return lines.join("\n");
}
