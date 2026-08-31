import { randomUUID } from "node:crypto";
import { join } from "node:path";

/**
 * Session identity and log-path resolution.
 * Layout: <dataDir>/sessions/<sessionId>/events.jsonl
 */
export interface SessionInfo {
  /** <dataDir>/sessions/<sessionId> */
  dir: string;
  id: string;
  startedAt: string;
}

export function sessionDirFor(dataDir: string, sessionId: string): string {
  return join(dataDir, "sessions", sessionId);
}

export function createSession(dataDir: string, now = new Date()): SessionInfo {
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  return {
    dir: sessionDirFor(dataDir, id),
    id,
    startedAt: now.toISOString(),
  };
}
