import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enabled = process.env.XPI_MEMO_RUN_PI_INTEGRATION === "1";
const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-pi-integration-"));
  temporaryDirectories.push(directory);
  return directory;
}

function parseJsonLines(lines: string[]): unknown[] {
  return lines.flatMap((line) => {
    try {
      return [
        JSON.parse(line) as unknown,
      ];
    } catch {
      return [];
    }
  });
}

interface NotifyEvent {
  message: string;
  method: "notify";
  type: "extension_ui_request";
}

function isNotifyEvent(event: unknown): event is NotifyEvent {
  if (typeof event !== "object" || event === null) return false;
  const candidate = event as Record<string, unknown>;
  return (
    candidate.type === "extension_ui_request" &&
    candidate.method === "notify" &&
    typeof candidate.message === "string"
  );
}

function notifyMessages(events: unknown[]): string[] {
  return events.filter(isNotifyEvent).map((event) => event.message);
}

/** Ready when the extension registry, command list and status payload arrived. */
function registrationReady(events: unknown[]): boolean {
  const hasTools = events.some(
    (event) => isNotifyEvent(event) && event.message.includes('"kind":"tool-registry"'),
  );
  const hasCommands = events.some(
    (event) =>
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      event.type === "response" &&
      "command" in event &&
      event.command === "get_commands",
  );
  const hasStatus = events.some(
    (event) => isNotifyEvent(event) && event.message.includes('"tiers"'),
  );
  return hasTools && hasCommands && hasStatus;
}

interface IsolatedPiOptions {
  /** Stop collecting once this turns true for the accumulated events. */
  done?: (events: unknown[]) => boolean;
  env?: NodeJS.ProcessEnv;
  /** RPC request lines written to stdin after startup. */
  requests?: string[];
}

async function runIsolatedPi(
  extensionPath: string,
  probePath: string,
  options: IsolatedPiOptions = {},
): Promise<unknown[]> {
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
        extensionPath,
        "-e",
        probePath,
      ],
      {
        cwd: packageRoot,
        env: options.env ?? process.env,
        stdio: [
          "pipe",
          "pipe",
          "pipe",
        ],
      },
    );
    const stdout: string[] = [];
    let stderr = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      if (error) rejectPromise(error);
      else resolvePromise(parseJsonLines(stdout));
    };

    const timer = setTimeout(() => {
      finish(new Error(`isolated Pi timed out; stderr: ${stderr}`));
    }, 30_000);

    const isDone = options.done ?? registrationReady;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(...chunk.toString().split("\n").filter(Boolean));
      if (isDone(parseJsonLines(stdout))) finish();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!settled && code !== 0)
        finish(new Error(`isolated Pi exited with code ${code}; stderr: ${stderr}`));
    });

    const requests = options.requests ?? [
      JSON.stringify({
        id: "commands",
        type: "get_commands",
      }),
      JSON.stringify({
        id: "status",
        message: "/xpi-memo-status",
        type: "prompt",
      }),
    ];
    for (const request of requests) child.stdin.write(`${request}\n`);
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

describe.skipIf(!enabled)("isolated Pi registration", () => {
  it("loads only XpiMemo and registers each command and tool exactly once", async () => {
    const directory = createTemporaryDirectory();
    const probePath = join(directory, "probe.ts");
    const extensionPath = resolve(packageRoot, "src/index.ts");

    writeFileSync(
      probePath,
      `export default function (pi) {\n  pi.on("session_start", (_event, ctx) => {\n    ctx.ui.notify(JSON.stringify({ kind: "tool-registry", tools: pi.getAllTools().map(({ name }) => name) }), "info");\n  });\n}\n`,
    );

    const events = await runIsolatedPi(extensionPath, probePath);
    const notifications = events.filter(
      (
        event,
      ): event is {
        message: string;
        method: string;
        type: string;
      } =>
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "extension_ui_request" &&
        "method" in event &&
        event.method === "notify" &&
        "message" in event &&
        typeof event.message === "string",
    );
    const registry = JSON.parse(
      notifications.find(({ message }) => message.includes('"kind":"tool-registry"'))
        ?.message ?? "{}",
    ) as {
      tools?: string[];
    };
    const toolNames = registry.tools ?? [];
    const targetTools = [
      "xpi_memo_remember",
      "xpi_memo_recall",
      "xpi_memo_forget",
      "xpi_memo_sleep",
    ];

    expect(
      targetTools.every(
        (name) => toolNames.filter((tool) => tool === name).length === 1,
      ),
    ).toBe(true);

    const commandResponses = events.filter(
      (
        event,
      ): event is {
        command: string;
        data?: {
          commands?: Array<{
            name: string;
            source: string;
          }>;
        };
      } =>
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "response" &&
        "command" in event &&
        event.command === "get_commands",
    );
    const statusCommands = (commandResponses[0]?.data?.commands ?? []).filter(
      ({ name, source }) => name === "xpi-memo-status" && source === "extension",
    );
    expect(commandResponses).toHaveLength(1);
    expect(statusCommands).toHaveLength(1);

    const statusMessage = notifications.find(({ message }) =>
      message.includes('"tiers"'),
    )?.message;
    const status = JSON.parse(statusMessage ?? "{}") as {
      recall?: {
        queriedBanks?: string[];
        scope?: string;
      };
      tiers?: Record<string, string>;
    };
    expect(status.tiers).toEqual({
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    });
    // Backend state varies with the local CLI; the schema is what must hold.
    expect(status.recall).toMatchObject({
      queriedBanks: expect.arrayContaining([
        "default",
      ]),
      scope: "current-project-plus-global",
    });
  });
});

/**
 * Real-process smoke for the surfaces a command handler can reach: status,
 * trace and export. Tool execution (remember/recall/forget/sleep) is covered by
 * `live-rpc.integration.test.ts` and `real-cli.integration.test.ts`, which drive
 * the same registered tools against a real mnemosyne sandbox — the extension API
 * exposes tool metadata only, not a way to invoke another extension's tool.
 */
describe.skipIf(!enabled)("isolated Pi lifecycle smoke", () => {
  it("serves status, trace and export without hiding failure states", async () => {
    const directory = createTemporaryDirectory();
    const dataDir = createTemporaryDirectory();
    const probePath = join(directory, "smoke-probe.ts");
    writeFileSync(
      probePath,
      `export default function (pi) {\n  pi.on("session_start", (_event, ctx) => {\n    ctx.ui.notify(JSON.stringify({ kind: "tool-registry", tools: pi.getAllTools().map(({ name }) => name) }), "info");\n  });\n}\n`,
    );

    const events = await runIsolatedPi(
      resolve(packageRoot, "src/index.ts"),
      probePath,
      {
        done: (parsed) => {
          const seen = notifyMessages(parsed);
          return (
            seen.some((message) => message.includes('"tiers"')) &&
            seen.some((message) => message.includes("Usage: /xpi-memo-trace")) &&
            seen.some((message) => message.includes("Output:"))
          );
        },
        env: {
          ...process.env,
          XDG_CONFIG_HOME: dataDir,
          XPI_MEMO_DATA_DIR: dataDir,
        },
        requests: [
          JSON.stringify({
            id: "status",
            message: "/xpi-memo-status",
            type: "prompt",
          }),
          JSON.stringify({
            id: "trace",
            message: "/xpi-memo-trace",
            type: "prompt",
          }),
          JSON.stringify({
            id: "export",
            message: "/xpi-memo-export",
            type: "prompt",
          }),
        ],
      },
    );
    const messages = notifyMessages(events);

    const registry = JSON.parse(
      messages.find((message) => message.includes('"kind":"tool-registry"')) ?? "{}",
    ) as {
      tools?: string[];
    };
    expect(
      [
        "xpi_memo_remember",
        "xpi_memo_recall",
        "xpi_memo_forget",
        "xpi_memo_sleep",
      ].every(
        (name) => (registry.tools ?? []).filter((tool) => tool === name).length === 1,
      ),
    ).toBe(true);

    // Status schema stays machine-readable and body-free (task 2.2).
    const status = JSON.parse(
      messages.find((message) => message.includes('"tiers"')) ?? "{}",
    ) as {
      events?: unknown[];
      feedback?: Record<string, number>;
      tiers?: Record<string, string>;
    };
    expect(status.tiers?.T1).toBe("xpi-memo");
    expect(Array.isArray(status.events)).toBe(true);
    expect(typeof status.feedback?.passive).toBe("number");

    // A missing trace target is reported, never silently empty.
    expect(messages.some((message) => message.includes("Usage: /xpi-memo-trace"))).toBe(
      true,
    );
    // Export names its session count and output path.
    expect(messages.some((message) => message.includes("Exported "))).toBe(true);
    expect(messages.some((message) => message.includes("Output:"))).toBe(true);
  }, 60_000);
});
