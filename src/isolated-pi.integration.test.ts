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

async function runIsolatedPi(
  extensionPath: string,
  probePath: string,
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
        env: process.env,
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
    }, 15_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(...chunk.toString().split("\n").filter(Boolean));
      const events = parseJsonLines(stdout);
      const hasTools = events.some(
        (event) =>
          isNotifyEvent(event) && event.message.includes('"kind":"tool-registry"'),
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
      if (hasTools && hasCommands && hasStatus) finish();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!settled && code !== 0)
        finish(new Error(`isolated Pi exited with code ${code}; stderr: ${stderr}`));
    });

    child.stdin.write(
      `${JSON.stringify({
        id: "commands",
        type: "get_commands",
      })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        id: "status",
        message: "/xpi-memo-status",
        type: "prompt",
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
    expect(status.recall).toEqual({
      queriedBanks: expect.arrayContaining([
        "default",
      ]),
      scope: "current-project-plus-global",
    });
  });
});
