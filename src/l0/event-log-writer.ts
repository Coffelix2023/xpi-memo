import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createL0Event, type L0Event, type L0EventType } from "./types.js";

/** Rotate the log when the active events.jsonl exceeds this size. */
export const L0_ROTATE_BYTES = 10 * 1024 * 1024;

export interface EventLogWriterOptions {
  rotateBytes?: number;
  /** session directory: <dataDir>/sessions/<sessionId> */
  sessionDir: string;
}

export interface EventLogWriter {
  /** Append one event with the next position; returns the event written. */
  append(type: L0EventType, payload: Record<string, unknown>): L0Event;
  /** Read current position without writing (for process restarts). */
  currentPosition(): number;
  path(): string;
}

/**
 * JSONL append: single-line appendFileSync writes are atomic in practice on
 * local filesystems for line-sized payloads. Rotation is same-dir rename.
 */
export function createEventLogWriter(options: EventLogWriterOptions): EventLogWriter {
  const rotateBytes = options.rotateBytes ?? L0_ROTATE_BYTES;
  mkdirSync(options.sessionDir, {
    mode: 0o700,
    recursive: true,
  });
  const activePath = join(options.sessionDir, "events.jsonl");

  let nextPosition = scanLastPosition(activePath);

  return {
    append(type, payload) {
      rotateIfNeeded(activePath, rotateBytes);
      const event = createL0Event(type, nextPosition + 1, payload);
      mkdirSync(dirname(activePath), {
        mode: 0o700,
        recursive: true,
      });
      appendFileSync(activePath, `${JSON.stringify(event)}\n`, {
        mode: 0o600,
      });
      nextPosition = event.position;
      return event;
    },
    currentPosition() {
      return nextPosition;
    },
    path() {
      return activePath;
    },
  };
}

function rotateIfNeeded(activePath: string, rotateBytes: number): void {
  if (!existsSync(activePath) || statSync(activePath).size < rotateBytes) return;
  const dir = dirname(activePath);
  // Count existing rotations, shift each up: .003 -> .004 ... .001 -> .002
  let count = 0;
  while (
    count < 999 &&
    existsSync(join(dir, `events.${String(count + 1).padStart(3, "0")}.jsonl`))
  )
    count += 1;
  for (let index = count; index >= 1; index -= 1) {
    const suffix = String(index).padStart(3, "0");
    const next = String(index + 1).padStart(3, "0");
    renameSync(join(dir, `events.${suffix}.jsonl`), join(dir, `events.${next}.jsonl`));
  }
  renameSync(activePath, join(dir, "events.001.jsonl"));
}

/** Scan the active log for the highest position so writers survive restarts. */
function scanLastPosition(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const content = readFileSync(path, "utf8");
    let max = 0;
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          position?: unknown;
        };
        if (typeof parsed.position === "number" && Number.isFinite(parsed.position))
          max = Math.max(max, parsed.position);
      } catch {
        // corrupt line: skip
      }
    }
    return max;
  } catch {
    return 0;
  }
}
