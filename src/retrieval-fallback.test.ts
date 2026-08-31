import { describe, expect, it } from "vitest";

import { type RecallRunner, recall } from "./recall.js";

function payload(options: {
  available: boolean;
  fallback: boolean;
  ftsScore: number;
}): string {
  return JSON.stringify({
    engine: "linear",
    explain: {
      embedding: {
        available: options.available,
        computed: options.available,
      },
      stages: [
        {
          fallback_used: options.fallback,
          name: "em_fallback",
        },
      ],
    },
    results: [
      {
        content: "FTS5-compatible memory",
        fts_score: options.ftsScore,
        id: "memory-fts5",
        scope: "global",
        score: 0.4,
        source:
          "kind=global_preference;ev=explicit-user-statement;prov=user;ts=2026-01-01T00%3A00%3A00.000Z;src=user",
      },
    ],
  });
}

describe("T1 retrieval fallback", () => {
  it("preserves FTS5 results when embeddings are unavailable", async () => {
    const calls: Array<{
      args: string[];
      env: unknown;
    }> = [];
    const run: RecallRunner = async (args, options) => {
      calls.push({
        args,
        env: options?.env,
      });
      return payload({
        available: false,
        fallback: true,
        ftsScore: 1,
      });
    };

    const result = await recall(
      {
        query: "fallback",
        context: {
          dataDir: "/tmp/xpi-memo-fallback",
          projectBank: null,
        },
      },
      run,
    );

    expect(result.results).toEqual([
      expect.objectContaining({
        content: "FTS5-compatible memory",
        provenance: expect.objectContaining({
          source: "mnemosyne",
        }),
      }),
    ]);
    expect(result.retrieval).toEqual({
      embeddingAvailable: false,
      fallback: true,
      mode: "hybrid",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([
      "recall",
      "fallback",
      "5",
      "--explain",
      "--json",
    ]);
    expect(calls[0]?.env).toBeUndefined();
  });

  it("does not switch providers or request a local model during fallback", async () => {
    const calls: Array<{
      args: string[];
      options: unknown;
    }> = [];
    const run: RecallRunner = async (args, options) => {
      calls.push({
        args,
        options,
      });
      return payload({
        available: false,
        fallback: true,
        ftsScore: 0.8,
      });
    };

    await recall(
      {
        globalLimit: 2,
        query: "provider boundary",
        context: {
          dataDir: "/tmp/xpi-memo-fallback",
          projectBank: null,
        },
      },
      run,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).not.toContain("reindex");
    expect(calls[0]?.args).not.toContain("download");
    expect(calls[0]?.options).toEqual({
      dataDir: "/tmp/xpi-memo-fallback",
    });
  });

  it("reports fallback for malformed provider output without throwing", async () => {
    const run: RecallRunner = async () => "not-json";

    const result = await recall(
      {
        query: "malformed",
        context: {
          dataDir: "/tmp/xpi-memo-fallback",
          projectBank: null,
        },
      },
      run,
    );

    expect(result.results).toEqual([]);
    expect(result.retrieval).toEqual({
      embeddingAvailable: false,
      fallback: true,
      mode: "hybrid",
    });
  });
});
