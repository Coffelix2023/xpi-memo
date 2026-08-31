import { join } from "node:path";
import { createEventLogWriter, type EventLogWriter } from "./event-log-writer.js";
import { createSession, sessionDirFor } from "./session-manager.js";
import type { L0Event, L0EventType } from "./types.js";

export interface L0Coordinator {
  /** Whether L0 writes are enabled by config. */
  readonly enabled: boolean;
  /**
   * Append an event. Throws on write failure — callers performing governed
   * T1 writes MUST abort the operation when this throws (dual-write, L0 first).
   */
  record(type: L0EventType, payload: Record<string, unknown>): L0Event;
  /** Best-effort append for hooks: never throws, returns null on failure. */
  recordSafe(type: L0EventType, payload: Record<string, unknown>): L0Event | null;
  /** Session id once initialized, null before the first event. */
  sessionId(): string | null;
}

export interface CreateL0CoordinatorOptions {
  dataDir: string;
  enabled: boolean;
  now?: () => Date;
}

/**
 * One coordinator per extension process = one L0 session per Pi session.
 * The session directory is created lazily on the first recorded event so
 * sessions that never write leave no artifacts.
 */
export function createL0Coordinator(
  options: CreateL0CoordinatorOptions,
): L0Coordinator {
  const now = options.now ?? (() => new Date());
  let writer: EventLogWriter | null = null;
  let sessionId: string | null = null;

  function writer_(): EventLogWriter {
    if (!writer) {
      const session = createSession(options.dataDir, now());
      sessionId = session.id;
      writer = createEventLogWriter({
        sessionDir: sessionDirFor(options.dataDir, session.id),
      });
    }
    return writer;
  }

  return {
    enabled: options.enabled,
    record(type, payload) {
      if (!options.enabled) {
        throw new Error("l0-disabled");
      }
      return writer_().append(type, payload);
    },
    recordSafe(type, payload) {
      try {
        return this.record(type, payload);
      } catch {
        return null;
      }
    },
    sessionId() {
      return sessionId;
    },
  };
}

export function sessionsDirFor(dataDir: string): string {
  return join(dataDir, "sessions");
}
