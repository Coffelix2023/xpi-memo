/**
 * Task 1.2 (session-switch-export-nonblocking): the session_shutdown handler
 * must initiate the Markdown export without awaiting it — pi awaits shutdown
 * handlers during /new, /resume and /fork, so an awaited export (up to a
 * multi-second full projection re-read) blocks the whole session switch.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import xpiMemo from "./index.ts";

const exporterControl = vi.hoisted(() => ({
  /** Resolves the in-flight export promise; null while none is pending. */
  release: null as null | (() => void),
}));

vi.mock("./markdown-export/exporter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./markdown-export/exporter.js")>();
  return {
    ...actual,
    exportMarkdown: vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          exporterControl.release = () => resolve({});
        }),
    ),
  };
});

interface RegisteredEvent {
  handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>;
  name: string;
}

function loadExtension(env: NodeJS.ProcessEnv): RegisteredEvent[] {
  const events: RegisteredEvent[] = [];
  const pi = {
    on(name: string, handler: () => Promise<void>) {
      events.push({
        name,
        handler,
      });
    },
    registerCommand: () => undefined,
    registerTool: () => undefined,
  } as unknown as ExtensionAPI;
  xpiMemo(pi, {
    env,
  });
  return events;
}

function createShutdownContext(): Parameters<ToolDefinition["execute"]>[4] {
  return {
    cwd: "/tmp",
    mode: "rpc",
    ui: {
      notify: () => undefined,
      setStatus: () => undefined,
    },
  } as unknown as Parameters<ToolDefinition["execute"]>[4];
}

describe("session_shutdown export non-blocking", () => {
  it("resolves while the export is still in flight", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "xpi-memo-shutdown-"));
    const events = loadExtension({
      XPI_MEMO_AUTO_EXPORT: "true",
      XPI_MEMO_DATA_DIR: dataDir,
      XPI_MEMO_L0_ENABLED: "true",
    });
    const shutdown = events.find(({ name }) => name === "session_shutdown");
    if (!shutdown) throw new Error("session_shutdown hook not registered");

    const handlerPromise = shutdown.handler(
      {
        type: "session_shutdown",
      },
      createShutdownContext(),
    ) as Promise<void>;

    // The handler must settle while the export promise is still pending:
    // the macrotask tick fires only if the handler is still awaiting.
    const outcome = await Promise.race([
      handlerPromise.then(() => "resolved" as const),
      new Promise<"pending">((resolve) => {
        setImmediate(() => resolve("pending"));
      }),
    ]);
    expect(outcome).toBe("resolved");
    expect(exporterControl.release).toBeTypeOf("function");

    exporterControl.release?.();
    await handlerPromise;
  });
});
