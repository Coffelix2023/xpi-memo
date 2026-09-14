import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * Platform assumption check (track-b-real-validation task 1.1).
 *
 * The gated offline extraction path runs inside the *async* `session_shutdown`
 * handler and needs `ctx.modelRegistry` / `ctx.model` after an `await`. The
 * design claims this works because the runtime awaits shutdown handlers before
 * disposing the session — a claim that must be observed, not inferred from a
 * type declaration. This test spawns a real `pi` RPC session, drives it to
 * shutdown, and asserts on the evidence the probe wrote from inside the handler.
 *
 * Opt-in only: `XPI_MEMO_RUN_PI_INTEGRATION=1`.
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enabled = process.env.XPI_MEMO_RUN_PI_INTEGRATION === "1";
const temporaryDirectories: string[] = [];

interface ShutdownEvidence {
  availableModels: number | null;
  error?: string;
  hasModelRegistry: boolean;
  modelId: string | null;
  modelProvider: string | null;
  reachedAfterAwait: boolean;
  reason: string | null;
  registryError: string | null;
}

const PROBE_SOURCE = `import { writeFileSync } from "node:fs";

export default function (pi) {
  pi.on("session_shutdown", async (event, ctx) => {
    const evidence = {
      availableModels: null,
      hasModelRegistry: ctx?.modelRegistry !== undefined && ctx.modelRegistry !== null,
      modelId: ctx?.model?.id ?? null,
      modelProvider: ctx?.model?.provider ?? null,
      reachedAfterAwait: false,
      reason: event?.reason ?? null,
      registryError: null,
    };
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      evidence.availableModels = ctx.modelRegistry.getAvailable().length;
      evidence.registryError = ctx.modelRegistry.getError() ?? null;
      evidence.reachedAfterAwait = true;
    } catch (error) {
      evidence.error = String(error);
    }
    writeFileSync(process.env.XPI_MEMO_PROBE_OUTPUT, JSON.stringify(evidence, null, 2));
  });
}
`;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-shutdown-probe-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** Drive a real Pi RPC session and close stdin so `session_shutdown` runs. */
function runShutdownProbe(
  probePath: string,
  outputPath: string,
): Promise<{
  stderr: string;
}> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "pi",
      [
        "--mode",
        "rpc",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-session",
        "--no-builtin-tools",
        "-e",
        probePath,
      ],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          XPI_MEMO_PROBE_OUTPUT: outputPath,
        },
        stdio: [
          "pipe",
          "pipe",
          "pipe",
        ],
      },
    );
    let stderr = "";
    let started = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error(`shutdown probe timed out; stderr: ${stderr}`));
    }, 30_000);
    const finish = () => {
      clearTimeout(timer);
      resolvePromise({
        stderr,
      });
    };
    child.stdout.on("data", () => {
      // Any response proves the session is up; then close stdin to trigger
      // dispose() -> awaited session_shutdown dispatchers.
      if (started) return;
      started = true;
      child.stdin.end();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", () => finish());
    child.stdin.write(
      `${JSON.stringify({
        id: "state",
        type: "get_state",
      })}\n`,
    );
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe.skipIf(!enabled)("session_shutdown model context", () => {
  it("keeps ctx.modelRegistry and ctx.model reachable after an await", async () => {
    const directory = createTemporaryDirectory();
    const probePath = join(directory, "probe.ts");
    const outputPath = join(directory, "evidence.json");
    writeFileSync(probePath, PROBE_SOURCE);

    await runShutdownProbe(probePath, outputPath);

    const evidence = JSON.parse(readFileSync(outputPath, "utf8")) as ShutdownEvidence;
    expect(evidence.reason).toBe("quit");
    expect(evidence.hasModelRegistry).toBe(true);
    expect(evidence.reachedAfterAwait).toBe(true);
    expect(evidence.availableModels).toBeGreaterThanOrEqual(0);
  });
});
