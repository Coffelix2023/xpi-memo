import { describe, expect, it } from "vitest";

import type { CliOptions } from "./cli.ts";
import {
  createMnemosyneAdapter,
  decodeSourceMetadata,
  encodeSourceMetadata,
  type T1MemoryOperation,
} from "./operations.js";

const operation: T1MemoryOperation = {
  confidence: 0.91,
  content: "Use pnpm for repository scripts.",
  dataDir: "/tmp/xpi-memo-data",
  kind: "project_gene",
  provenance: "verified-repository-file",
  scope: "global",
  targetBank: "project-p-0123456789ab",
  source: {
    evidenceType: "verified-repository-fact",
    revision: "abc123",
    source: "package.json",
    timestamp: "2026-01-01T00:00:00.000Z",
  },
};

describe("routing-aware Mnemosyne operations", () => {
  it("forwards the complete operation envelope and supported CLI fields", async () => {
    const calls: Array<{
      args: string[];
      options: CliOptions | undefined;
    }> = [];
    const adapter = createMnemosyneAdapter(
      async (args: string[], options: CliOptions | undefined) => {
        calls.push({
          args,
          options,
        });
        return "Stored: memory-123";
      },
    );

    const result = await adapter.store(operation);
    const call = calls[0];
    if (!call) throw new Error("adapter did not call Mnemosyne");

    expect(call.args).toEqual([
      "store",
      operation.content,
      encodeSourceMetadata(operation),
      String(operation.confidence),
    ]);
    expect(call.options).toEqual({
      bank: operation.targetBank,
      dataDir: operation.dataDir,
      scope: operation.scope,
    });
    expect(result).toEqual({
      id: "memory-123",
      operation,
      output: "Stored: memory-123",
    });
  });

  it("keeps the global bank on Mnemosyne's default database", async () => {
    const calls: Array<{
      args: string[];
      options: CliOptions | undefined;
    }> = [];
    const adapter = createMnemosyneAdapter(
      async (args: string[], options: CliOptions | undefined) => {
        calls.push({
          args,
          options,
        });
        return "Stored: global-123";
      },
    );

    await adapter.store({
      ...operation,
      kind: "global_preference",
      scope: "global",
      targetBank: "default",
    });
    const call = calls[0];
    if (!call) throw new Error("adapter did not call Mnemosyne");

    expect(call.args[2]).toContain("kind=global_preference");
    expect(call.options).toEqual({
      dataDir: operation.dataDir,
      scope: "global",
    });
  });

  it("encodes kind, provenance, and evidence into the CLI source field", () => {
    expect(encodeSourceMetadata(operation)).toBe(
      "kind=project_gene;ev=verified-repository-fact;prov=verified-repository-file;ts=2026-01-01T00%3A00%3A00.000Z;src=package.json;rev=abc123",
    );
  });

  it("decodes encoded source and leaves legacy source untouched", () => {
    expect(decodeSourceMetadata(encodeSourceMetadata(operation))).toEqual({
      kind: "project_gene",
      source: "package.json",
    });
    expect(decodeSourceMetadata("package.json")).toEqual({
      kind: null,
      source: "package.json",
    });
  });
});
