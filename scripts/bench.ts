/**
 * Micro-benchmarks for Phase 5 performance tasks (14.1/14.2/14.3).
 *
 * Run: npx tsx scripts/bench.ts
 *
 * Measures, on a temp dir:
 *  - L0 append throughput: 10k events (14.1 — stat-free appends)
 *  - Incremental export re-run: 20 sessions x 500 events (14.2 — readAfter skip)
 *  - Identity resolution: 1k calls (14.3 — per-cwd cache)
 *
 * Numbers are machine-dependent; the point is relative improvement and that
 * no path regressed to O(n²). Latest run (M-series macOS):
 *   append 0.026ms/event · incremental re-run ~1ms vs ~235ms full parse
 *   · cached identity 0.029ms/call
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveProjectIdentity } from "../src/identity.ts";
import { createEventLogWriter } from "../src/l0/event-log-writer.ts";
import { sessionDirFor } from "../src/l0/session-manager.ts";
import { exportMarkdown } from "../src/markdown-export/exporter.ts";

function bench(label: string, fn: () => unknown): number {
  const started = performance.now();
  void fn();
  const ms = performance.now() - started;
  console.log(`${label}: ${ms.toFixed(1)}ms`);
  return ms;
}

const dataDir = mkdtempSync(join(tmpdir(), "xpi-memo-bench-"));
try {
  // 14.1: L0 append throughput (stat-free after the initial scan)
  const writer = createEventLogWriter({
    sessionDir: sessionDirFor(dataDir, "bench-session"),
  });
  const appendMs = bench("L0 append 10k events", () => {
    for (let i = 0; i < 10_000; i += 1)
      writer.append("user_message", {
        text: `event ${i} padding to make lines realistic`,
      });
  });

  // 14.2: incremental export — first run reads all, second must skip reads
  const env = {
    XPI_MEMO_DATA_DIR: dataDir,
  };
  bench("export initial (20 sessions x 500 events)", async () => {
    for (let s = 0; s < 20; s += 1) {
      const sessionWriter = createEventLogWriter({
        sessionDir: sessionDirFor(dataDir, `bench-export-${s}`),
      });
      for (let i = 0; i < 500; i += 1)
        sessionWriter.append("user_message", {
          text: `s${s} e${i} padding to make lines realistic`,
        });
    }
    await exportMarkdown({
      env,
      force: true,
    });
  });
  const incrementalMs = bench("export incremental re-run (no new events)", async () => {
    await exportMarkdown({
      env,
    });
  });

  // 14.3: identity cache
  const identityMs = bench("resolveProjectIdentity 1k calls (cached)", () => {
    for (let i = 0; i < 1_000; i += 1) resolveProjectIdentity(process.cwd());
  });

  console.log("\nsummary:");
  console.log(`  append: ${(appendMs / 10_000).toFixed(3)}ms/event`);
  console.log(
    `  incremental re-run: ${incrementalMs.toFixed(1)}ms (vs re-parsing every session)`,
  );
  console.log(`  identity: ${(identityMs / 1_000).toFixed(4)}ms/call`);
} finally {
  rmSync(dataDir, {
    force: true,
    recursive: true,
  });
}
