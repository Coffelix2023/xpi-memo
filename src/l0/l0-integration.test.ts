/**
 * L0 end-to-end integration (Task 7.5).
 *
 * Simulates a session: user input -> routing -> governed write -> candidate
 * flow -> compaction, verifying the L0 log captures the full ordered trace
 * and derives a deterministic context view.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deriveContext } from "./context-derivation.js";
import { createEventLogReader } from "./event-log-reader.js";
import { createL0Coordinator } from "./l0-runtime.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir)
      rmSync(dir, {
        force: true,
        recursive: true,
      });
  }
});

describe("L0 end-to-end (Task 7.5)", () => {
  it("captures a full governed session in order and derives context", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "xpi-l0-e2e-"));
    tempDirs.push(dataDir);
    const l0 = createL0Coordinator({
      dataDir,
      enabled: true,
    });

    // 1. user asks to remember something
    l0.recordSafe("user_message", {
      source: "tui",
      text: "remember: deploy needs podman",
    });
    // 2. routing decision
    l0.recordSafe("routing_decision", {
      bank: "project-deploy",
      kind: "project_gotcha",
    });
    // 3. candidate created pending confirmation
    l0.recordSafe("candidate_created", {
      kind: "project_gotcha",
      reason: "broad-gotcha",
    });
    // 4. user confirms
    l0.recordSafe("candidate_confirmed", {
      kind: "project_gotcha",
    });
    // 5. governed dual-write lands in L0 (throws => aborts the operation)
    l0.record("t1_memory_write", {
      bank: "project-deploy",
      kind: "project_gotcha",
    });
    // 6. unrelated tool activity
    l0.recordSafe("tool_call", {
      toolName: "bash",
    });
    l0.recordSafe("tool_result", {
      isError: false,
    });
    // 7. session compacts
    l0.recordSafe("compaction", {
      reason: "threshold",
    });

    const sessionsRoot = join(dataDir, "sessions");
    const [sessionId] = readdirSync(sessionsRoot);
    const reader = createEventLogReader({
      sessionDir: join(sessionsRoot, String(sessionId)),
    });
    const events = await reader.readAll();

    const types = events.map((event) => event.type);
    expect(types).toEqual([
      "user_message",
      "routing_decision",
      "candidate_created",
      "candidate_confirmed",
      "t1_memory_write",
      "tool_call",
      "tool_result",
      "compaction",
    ]);
    // positions strictly increasing 1..8
    expect(events.map((event) => event.position)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
    ]);

    // deterministic derivation over the same log
    const derived = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
          "t1_memory_write",
        ],
      },
      3,
    );
    // user_message + t1_memory_write = 2 allowed events, budget 3 => no folding
    expect(derived.shownEvents).toBe(2);
    expect(derived.foldedPositions).toBe(0);
    const again = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
          "t1_memory_write",
        ],
      },
      3,
    );
    expect(JSON.stringify(derived)).toBe(JSON.stringify(again));
  });

  it("disabled coordinator produces no session artifacts (v0.1 fallback)", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "xpi-l0-off-"));
    tempDirs.push(dataDir);
    const l0 = createL0Coordinator({
      dataDir,
      enabled: false,
    });
    expect(
      l0.recordSafe("user_message", {
        text: "x",
      }),
    ).toBeNull();
    expect(existsSync(join(dataDir, "sessions"))).toBe(false);
  });
});
