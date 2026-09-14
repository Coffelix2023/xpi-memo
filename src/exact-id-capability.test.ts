import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXACT_ID_READ_UNAVAILABLE,
  EXACT_ID_READ_UNPARSEABLE,
  isMemoryNotFoundError,
  parseExactIdReadOutcome,
  probeExactIdReadCapability,
  resetExactIdReadCapabilityCache,
} from "./banks.ts";
import { createExactIdReader } from "./operations.ts";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-capability-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  resetExactIdReadCapabilityCache();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("exact-ID read capability probe", () => {
  it("reports unavailable when the subcommand is absent", async () => {
    const calls: string[][] = [];
    const capability = await probeExactIdReadCapability(async (args) => {
      calls.push(args);
      throw new Error("Unknown command: get\nRun 'mnemosyne --help' for usage.");
    }, createTemporaryDirectory());

    expect(capability).toEqual({
      available: false,
      reason: EXACT_ID_READ_UNAVAILABLE,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("get");
  });

  it("reports available when the subcommand answers about the id itself", async () => {
    const capability = await probeExactIdReadCapability(async () => {
      throw new Error("Memory not found: 00000000000000000000000000000000");
    }, createTemporaryDirectory());

    expect(capability).toEqual({
      available: true,
      command: "get",
    });
  });

  it("reports available when the subcommand returns a parseable record", async () => {
    const capability = await probeExactIdReadCapability(
      async () =>
        JSON.stringify({
          content: "Keep the adapter boundary.",
          id: "memory-1",
          source: "kind=project_decision;src=test",
          timestamp: "2026-01-01T00:00:00.000Z",
        }),
      createTemporaryDirectory(),
    );

    expect(capability).toEqual({
      available: true,
      command: "get",
    });
  });

  it("reports unavailable when the response cannot be classified", async () => {
    const capability = await probeExactIdReadCapability(
      async () => "Memory 0000 is a prose dump with no fields",
      createTemporaryDirectory(),
    );

    expect(capability).toEqual({
      available: false,
      reason: EXACT_ID_READ_UNPARSEABLE,
    });
  });

  it("caches the verdict per process and data dir", async () => {
    const dataDir = createTemporaryDirectory();
    let calls = 0;
    const run = async () => {
      calls += 1;
      throw new Error("Unknown command: get");
    };

    await probeExactIdReadCapability(run, dataDir);
    await probeExactIdReadCapability(run, dataDir);

    expect(calls).toBe(1);
  });
});

describe("exact-ID read outcome parsing", () => {
  it("classifies a structured record", () => {
    expect(parseExactIdReadOutcome('{"id":"memory-1","content":"body"}')).toEqual({
      kind: "record",
      memory: {
        content: "body",
        id: "memory-1",
      },
    });
  });

  it("classifies a structured not-found", () => {
    expect(parseExactIdReadOutcome("Memory not found: memory-1")).toEqual({
      kind: "not-found",
    });
  });

  it("classifies prose and empty output as unparseable", () => {
    expect(
      parseExactIdReadOutcome("Memory memory-1 lives in the project bank"),
    ).toEqual({
      kind: "unparseable",
    });
    expect(parseExactIdReadOutcome("   ")).toEqual({
      kind: "unparseable",
    });
  });
});

describe("exact-ID reader", () => {
  it("decodes kind and scope from the backend source metadata", async () => {
    const reader = createExactIdReader(async () =>
      JSON.stringify({
        content: "Keep the existing adapter boundary.",
        id: "memory-1",
        source:
          "kind=project_decision;ev=explicit;prov=a;ts=2026-01-01T00:00:00Z;src=test",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    );

    await expect(reader("memory-1", "/tmp", "project-test")).resolves.toMatchObject({
      bank: "project-test",
      content: "Keep the existing adapter boundary.",
      id: "memory-1",
      kind: "project_decision",
      scope: "project",
    });
  });

  it("returns null for a structured not-found instead of failing", async () => {
    const reader = createExactIdReader(async () => {
      throw new Error("Memory not found: memory-1");
    });

    await expect(reader("memory-1", "/tmp", "default")).rejects.toThrow(
      "Memory not found: memory-1",
    );

    const readerWithOutput = createExactIdReader(
      async () => "Memory not found: memory-1",
    );
    await expect(readerWithOutput("memory-1", "/tmp", "default")).resolves.toBeNull();
  });

  it("throws instead of pretending the memory is missing", async () => {
    const reader = createExactIdReader(async () => "unclassified prose");

    await expect(reader("memory-1", "/tmp", "default")).rejects.toThrow(
      "exact-id-read-unparseable",
    );
  });
});

describe("backend delete result parsing", () => {
  it("treats only not-found as a missing target", () => {
    expect(isMemoryNotFoundError(new Error("Memory not found: memory-1"))).toBe(true);
    expect(isMemoryNotFoundError(new Error("database is locked"))).toBe(false);
    expect(isMemoryNotFoundError("not-an-error")).toBe(false);
  });
});
