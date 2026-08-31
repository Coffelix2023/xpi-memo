/**
 * Thin async wrapper around the `mnemosyne` CLI.
 *
 * Routing is pure environment injection: MNEMOSYNE_BANK selects the physical
 * bank, MNEMOSYNE_DEFAULT_SCOPE selects durable-vs-session for store calls.
 * Secrets stay in the inherited environment; we only add non-sensitive
 * routing variables.
 */

import { spawn } from "node:child_process";

export interface CliOptions {
  bank?: string;
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  scope?: "global" | "session";
  timeoutMs?: number;
}

interface CliChild {
  kill(signal: "SIGKILL"): void;
  on(event: "close", listener: (code: number | null) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  stderr: {
    on(event: "data", listener: (data: Buffer) => void): void;
  };
  stdout: {
    on(event: "data", listener: (data: Buffer) => void): void;
  };
}

interface CliSpawnOptions {
  env: NodeJS.ProcessEnv;
  stdio: [
    "ignore",
    "pipe",
    "pipe",
  ];
}

export type CliSpawner = (
  command: string,
  args: string[],
  options: CliSpawnOptions,
) => CliChild;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 256_000;
const STORED_ID_PATTERN = /^Stored:\s*(\S+)/m;
const EPISODIC_STATS_PATTERN = /^\s*Episodic memory:\s*(\d+)\s*$/m;
const TOTAL_STATS_PATTERN = /^\s*Total memories:\s*(\d+)\s*$/m;
const WORKING_STATS_PATTERN = /^\s*Working memory:\s*(\d+)\s*$/m;

export function runMnemosyne(
  args: string[],
  opts: CliOptions = {},
  spawnCli: CliSpawner = (command, childArgs, spawnOptions) =>
    spawn(command, childArgs, spawnOptions),
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const env: NodeJS.ProcessEnv = {
      ...(opts.env ?? process.env),
    };
    env.MNEMOSYNE_LLM_ENABLED = "false"; // v1 product boundary, always enforced
    if (opts.bank) env.MNEMOSYNE_BANK = opts.bank;
    if (opts.scope) env.MNEMOSYNE_DEFAULT_SCOPE = opts.scope;
    if (opts.dataDir) env.MNEMOSYNE_DATA_DIR = opts.dataDir;

    const child = spawnCli("mnemosyne", args, {
      env,
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    });

    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";
    let stderrBytes = 0;
    let settled = false;

    const finish = (err: Error | null, out?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) rejectPromise(err);
      else resolvePromise(out ?? "");
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(
        new Error(
          `mnemosyne timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        ),
      );
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => {
      if (stdoutBytes + d.byteLength > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new Error(`mnemosyne output exceeded ${MAX_OUTPUT_BYTES} bytes`));
        return;
      }
      stdoutBytes += d.byteLength;
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderrBytes + d.byteLength > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new Error(`mnemosyne output exceeded ${MAX_OUTPUT_BYTES} bytes`));
        return;
      }
      stderrBytes += d.byteLength;
      stderr += d.toString();
    });
    child.on("error", (err) =>
      finish(
        new Error(
          `Failed to run mnemosyne: ${err.message}\nInstall: uv tool install mnemosyne-memory`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(stderr.trim() || `mnemosyne exited with code ${code}`));
        return;
      }
      finish(null, stdout.trim());
    });
  });
}

/** Parse count fields from `mnemosyne stats` human-readable output. */
export function parseStats(output: string): {
  episodic: number;
  total: number;
  working: number;
} {
  const episodic = EPISODIC_STATS_PATTERN.exec(output);
  const total = TOTAL_STATS_PATTERN.exec(output);
  const working = WORKING_STATS_PATTERN.exec(output);
  return {
    episodic: episodic ? Number(episodic[1]) : 0,
    total: total ? Number(total[1]) : 0,
    working: working ? Number(working[1]) : 0,
  };
}
/** Parse the hex id out of `mnemosyne store` output ("Stored: <id>"). */

export function parseStoredId(output: string): string | null {
  return STORED_ID_PATTERN.exec(output)?.[1] ?? null;
}
