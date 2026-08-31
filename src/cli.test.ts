import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { type CliSpawner, parseStats, parseStoredId, runMnemosyne } from "./cli.ts";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
interface FakeChild extends EventEmitter {
  kill: ReturnType<typeof vi.fn>;
  stderr: EventEmitter;
  stdout: EventEmitter;
}

function createChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
  });
}

function spawnerFor(child: FakeChild): CliSpawner {
  return () => child;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Mnemosyne CLI adapter", () => {
  it("injects bank, scope, data directory, and disables upstream LLM", async () => {
    const child = createChild();
    const spawn = vi.fn(spawnerFor(child));
    const pending = runMnemosyne(
      [
        "store",
        "content",
      ],
      {
        bank: "project-p-0123456789ab",
        dataDir: "/tmp/xpi-memo-cli",
        scope: "session",
        env: {
          KEEP: "1",
        },
      },
      spawn,
    );
    child.emit("close", 0);

    await expect(pending).resolves.toBe("");
    expect(spawn).toHaveBeenCalledWith(
      "mnemosyne",
      [
        "store",
        "content",
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          KEEP: "1",
          MNEMOSYNE_BANK: "project-p-0123456789ab",
          MNEMOSYNE_DATA_DIR: "/tmp/xpi-memo-cli",
          MNEMOSYNE_DEFAULT_SCOPE: "session",
          MNEMOSYNE_LLM_ENABLED: "false",
        }),
      }),
    );
  });

  it("reports stderr for a non-zero process exit", async () => {
    const child = createChild();
    const pending = runMnemosyne(
      [
        "store",
        "content",
      ],
      {},
      spawnerFor(child),
    );
    child.stderr.emit("data", Buffer.from("invalid source\n"));
    child.emit("close", 2);

    await expect(pending).rejects.toThrow("invalid source");
  });

  it("reports a missing CLI with an installation hint", async () => {
    const child = createChild();
    const pending = runMnemosyne(
      [
        "stats",
      ],
      {},
      spawnerFor(child),
    );
    child.emit("error", new Error("spawn mnemosyne ENOENT"));

    await expect(pending).rejects.toThrow("uv tool install mnemosyne-memory");
  });

  it("kills and rejects a timed-out CLI process", async () => {
    vi.useFakeTimers();
    const child = createChild();
    const pending = runMnemosyne(
      [
        "recall",
        "query",
      ],
      {
        timeoutMs: 5,
      },
      spawnerFor(child),
    );
    const timedOut = expect(pending).rejects.toThrow("timed out after 5ms");
    await vi.advanceTimersByTimeAsync(5);
    await timedOut;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kills and rejects output exceeding the bounded limit", async () => {
    const child = createChild();
    const pending = runMnemosyne(
      [
        "recall",
        "query",
      ],
      {},
      spawnerFor(child),
    );
    child.stdout.emit("data", Buffer.alloc(256_001, "x"));

    await expect(pending).rejects.toThrow("output exceeded 256000 bytes");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("parses stored identifiers and rejects unrelated output", () => {
    expect(parseStoredId("Stored: memory-1")).toBe("memory-1");
    expect(parseStoredId("stored memory-1")).toBeNull();
    expect(
      parseStoredId(readFileSync(join(fixtureDirectory, "store-output.txt"), "utf8")),
    ).toBe("c125856f46eb7362");
  });

  it("parses real stats counts without inventing values", () => {
    expect(
      parseStats(
        "Mnemosyne Stats\n\n  Total memories: 7\n  Working memory: 5\n  Episodic memory: 2\n  Knowledge triples: 0\n\n  Banks: default, project-demo\n  DB path: /tmp/mnemosyne.db",
      ),
    ).toEqual({
      episodic: 2,
      total: 7,
      working: 5,
    });
  });
});
