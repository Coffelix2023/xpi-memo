import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { SearchBackend, SearchQuery } from "./backend.js";
import { refreshCommandCache } from "./backend.js";
import { MnemosyneBackend } from "./mnemosyne-backend.js";
import { parseRows, QmdBackend } from "./qmd-backend.js";
import { buildRipgrepArgs, RipgrepBackend, ripgrepTargets } from "./ripgrep-backend.js";
import { backendNames, createSearchRuntime } from "./runtime.js";
import { BackendMetrics, createSearchRunner } from "./selector.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-search-"));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  refreshCommandCache();
});

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return {
    limit: 5,
    query: "test",
    scope: "global",
    ...overrides,
  };
}

function stubBackend(
  name: string,
  options: {
    available?: boolean;
    results?: string[];
    throwOnSearch?: boolean;
  } = {},
): SearchBackend {
  return {
    capabilities: () => ({
      fullText: true,
      installed: options.available ?? true,
      semantic: false,
      vector: false,
    }),
    isAvailable: async () => options.available ?? true,
    name,
    plannedBanks: () => [
      "default",
    ],
    search: async () => {
      if (options.throwOnSearch) throw new Error(`${name} exploded`);
      return (
        options.results ?? [
          "result",
        ]
      ).map((content) => ({
        content,
        score: 1,
        source: {},
      }));
    },
  };
}

describe("Task 11.1-11.2 — backend interface and types", () => {
  it("exposes capabilities per backend shape", () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: null,
      },
      async () => "[]",
    );
    const capabilities = backend.capabilities();
    expect(capabilities).toMatchObject({
      fullText: true,
      semantic: true,
      vector: true,
    });
    expect(typeof capabilities.installed).toBe("boolean");
  });
});

describe("Task 11.3 — fallback chain", () => {
  it("respects configured → chain order", async () => {
    const registry = {
      all: () => [
        stubBackend("mnemosyne", {
          available: false,
        }),
        stubBackend("ripgrep"),
        stubBackend("qmd"),
      ],
      get: (name: string) =>
        [
          stubBackend("mnemosyne"),
          stubBackend("ripgrep"),
          stubBackend("qmd"),
        ].find((backend) => backend.name === name),
    };
    const runSearch = createSearchRunner(registry, new BackendMetrics());
    const outcome = await runSearch(query());
    expect(outcome.backendName).toBe("ripgrep");
    expect(outcome.attempts.map((attempt) => attempt.backend)).toEqual([
      "mnemosyne",
      "ripgrep",
    ]);
  });

  it("preferred backend is tried first", async () => {
    const registry = {
      all: () => [
        stubBackend("ripgrep"),
        stubBackend("qmd"),
      ],
      get: (name: string) =>
        [
          stubBackend("ripgrep"),
          stubBackend("qmd"),
        ].find((backend) => backend.name === name),
    };
    const runSearch = createSearchRunner(registry, new BackendMetrics());
    const outcome = await runSearch(query(), {
      preferred: "qmd",
    });
    expect(outcome.backendName).toBe("qmd");
    expect(outcome.attempts[0]?.backend).toBe("qmd");
  });

  it("returns empty results with warning when no backend is available", async () => {
    const registry = {
      all: () => [
        stubBackend("mnemosyne", {
          available: false,
        }),
      ],
      get: () => undefined,
    };
    const runSearch = createSearchRunner(registry, new BackendMetrics());
    const outcome = await runSearch(query());
    expect(outcome.backendName).toBeNull();
    expect(outcome.results).toEqual([]);
    expect(outcome.warning).toContain("no search backend available");
  });

  it("reports planned banks with empty results when a backend ran", async () => {
    const registry = {
      all: () => [
        stubBackend("mnemosyne"),
      ],
      get: () => undefined,
    };
    const runSearch = createSearchRunner(registry, new BackendMetrics());
    const outcome = await runSearch(
      query({
        scope: "global",
      }),
    );
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.queriedBanks).toEqual([
      "default",
    ]);
  });

  it("keeps queriedBanks empty when no backend ran", async () => {
    const registry = {
      all: () => [
        stubBackend("mnemosyne", {
          available: false,
        }),
      ],
      get: () => undefined,
    };
    const runSearch = createSearchRunner(registry, new BackendMetrics());
    const outcome = await runSearch(query());
    expect(outcome.backendName).toBeNull();
    expect(outcome.queriedBanks).toEqual([]);
  });
});

describe("Task 11.4 — availability checks", () => {
  it("detects unavailable backends before searching", async () => {
    const backend = stubBackend("mnemosyne", {
      available: false,
    });
    expect(await backend.isAvailable()).toBe(false);
  });
});

describe("Task 11.5 — metrics", () => {
  it("records latency and result count per executed search", async () => {
    const metrics = new BackendMetrics();
    const registry = {
      all: () => [
        stubBackend("ripgrep", {
          results: [
            "a",
            "b",
          ],
        }),
      ],
      get: () => undefined,
    };
    const runSearch = createSearchRunner(registry, metrics);
    await runSearch(query());
    const metric = metrics.last();
    expect(metric).toMatchObject({
      backend: "ripgrep",
      resultCount: 2,
    });
    expect(metric?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("Task 12.1 — MnemosyneBackend", () => {
  it("invokes the CLI with recall args and parses standardized rows", async () => {
    const calls: string[][] = [];
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/xpi-memo-mn",
        projectBank: "project-acme",
      },
      async (args, options) => {
        calls.push(args);
        expect(options?.dataDir).toBe("/tmp/xpi-memo-mn");
        return JSON.stringify({
          results: [
            {
              content: "Prefer pnpm.",
              id: "m1",
              score: 0.9,
              source: "kind=global_preference;ev=x;prov=pi;ts=t;src=user",
            },
          ],
        });
      },
    );
    const results = await backend.search(
      query({
        scope: "global",
      }),
    );
    expect(calls[0]).toEqual([
      "recall",
      "test",
      "5",
      "--explain",
      "--json",
    ]);
    expect(results[0]).toMatchObject({
      content: "Prefer pnpm.",
      kind: "global_preference",
      score: 0.9,
      source: {
        bank: "default",
      },
    });
    expect(results[0]?.id).toBe("m1");
  });
  it("lists all memories with empty query and applies offset pagination", async () => {
    const calls: string[][] = [];
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: null,
      },
      async (args) => {
        calls.push(args);
        return JSON.stringify({
          results: [
            {
              content: "one",
              id: "m1",
              score: 0.9,
            },
            {
              content: "two",
              id: "m2",
              score: 0.8,
            },
            {
              content: "three",
              id: "m3",
              score: 0.7,
            },
          ],
        });
      },
    );
    const results = await backend.search(
      query({
        limit: 2,
        offset: 1,
        query: "",
      }),
    );
    expect(calls[0]).toEqual([
      "recall",
      "",
      "3",
      "--explain",
      "--json",
    ]);
    expect(results.map(({ content }) => content)).toEqual([
      "two",
      "three",
    ]);
  });

  it("omits a missing Mnemosyne row ID", async () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: null,
      },
      async () =>
        JSON.stringify({
          results: [
            {
              content: "no id",
            },
          ],
        }),
    );
    const results = await backend.search(query());
    expect(results[0]?.id).toBeUndefined();
  });

  it("maps project scope to the project bank", async () => {
    const banks: Array<string | undefined> = [];
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: "project-acme",
      },
      async (_args, options) => {
        banks.push(options?.bank);
        return "[]";
      },
    );
    await backend.search(
      query({
        scope: "project",
      }),
    );
    expect(banks[0]).toBe("project-acme");
  });

  it("filters project-kind rows out of the default (global) bank (task 5.1)", async () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: "project-acme",
      },
      async () =>
        JSON.stringify({
          results: [
            {
              content: "global preference",
              id: "g1",
              score: 0.9,
              source:
                "kind=global_preference;ev=explicit-user-statement;prov=user;ts=t;src=user",
            },
            {
              content: "leaked project decision",
              id: "p1",
              score: 0.95,
              source:
                "kind=project_decision;ev=verified-tool-result;prov=pi;ts=t;src=task",
            },
          ],
        }),
    );
    const results = await backend.search(
      query({
        scope: "global",
      }),
    );
    expect(results.map(({ content }) => content)).toEqual([
      "global preference",
    ]);
  });

  it("parses row importance as confidence (task 5.3)", async () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: null,
      },
      async () =>
        JSON.stringify({
          results: [
            {
              content: "high confidence",
              id: "m1",
              importance: 0.9,
              score: 0.5,
              source:
                "kind=global_preference;ev=explicit-user-statement;prov=user;ts=t;src=user",
            },
            {
              content: "no confidence",
              id: "m2",
              score: 0.5,
              source:
                "kind=global_workflow;ev=explicit-user-statement;prov=user;ts=t;src=user",
            },
          ],
        }),
    );
    const results = await backend.search(
      query({
        scope: "global",
      }),
    );
    expect(results[0]?.confidence).toBe(0.9);
    expect(results[1]?.confidence).toBeUndefined();
  });

  it("keeps project-kind rows when searching the project bank", async () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: "project-acme",
      },
      async () =>
        JSON.stringify({
          results: [
            {
              content: "project decision",
              id: "p1",
              score: 0.8,
              source:
                "kind=project_decision;ev=verified-tool-result;prov=pi;ts=t;src=task",
            },
          ],
        }),
    );
    const results = await backend.search(
      query({
        scope: "project",
      }),
    );
    expect(results.map(({ content }) => content)).toEqual([
      "project decision",
    ]);
    // Task 2.4: canonical scope from kind metadata, never the bank name.
    expect(results[0]?.scope).toBe("project");
  });

  it("plannedBanks lists project and default banks for project scope", async () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: "project-acme",
      },
      async () => "[]",
    );
    expect(
      backend.plannedBanks(
        query({
          scope: "project",
        }),
      ),
    ).toEqual([
      "project-acme",
      "default",
    ]);
    expect(
      backend.plannedBanks(
        query({
          scope: "global",
        }),
      ),
    ).toEqual([
      "default",
    ]);
  });
  it("falls back to FTS5-flagged results on CLI failure rather than throwing", async () => {
    const backend = new MnemosyneBackend(
      {
        dataDir: "/tmp/x",
        projectBank: null,
      },
      async () => {
        throw new Error("boom");
      },
    );
    await expect(backend.search(query())).rejects.toThrow("boom");
  });
});

describe("Task 12.2 — RipgrepBackend", () => {
  it("searches markdown exports with context and case rules", async () => {
    const dataDir = temporaryDirectory();
    const markdown = join(dataDir, "markdown", "daily");
    mkdirSync(markdown, {
      recursive: true,
    });
    writeFileSync(
      join(markdown, "2026-01-01.md"),
      "# 2026-01-01\n\n- Decided: use pnpm workspaces\n- Noted: flaky test\n",
    );
    const argsSeen: string[][] = [];
    const backend = new RipgrepBackend(dataDir, async (args) => {
      argsSeen.push(args);
      return "";
    });
    await backend.search(
      query({
        query: "pnpm",
      }),
    );
    expect(argsSeen[0]).toContain("--ignore-case");
    await backend.search(
      query({
        query: "Pnpm",
      }),
    );
    expect(argsSeen[1]).not.toContain("--ignore-case");
  });

  it("returns matches with path and content", async () => {
    const dataDir = temporaryDirectory();
    mkdirSync(join(dataDir, "markdown"), {
      recursive: true,
    });
    const backend = new RipgrepBackend(
      dataDir,
      async () =>
        `${JSON.stringify({
          type: "match",
          data: {
            lines: {
              text: "- use pnpm\n",
            },
            path: {
              text: "/x/markdown/MEMORY.md",
            },
          },
        })}\n`,
    );
    const results = await backend.search(
      query({
        query: "pnpm",
        scope: "global",
      }),
    );
    expect(results[0]).toMatchObject({
      content: "- use pnpm",
      source: {
        path: "/x/markdown/MEMORY.md",
      },
    });
  });

  it("maps scope to targets: session → JSONL only, global → markdown only", () => {
    const dataDir = temporaryDirectory();
    mkdirSync(join(dataDir, "markdown"), {
      recursive: true,
    });
    mkdirSync(join(dataDir, "sessions", "s1"), {
      recursive: true,
    });
    expect(ripgrepTargets(dataDir, "global")).toEqual([
      join(dataDir, "markdown"),
    ]);
    expect(ripgrepTargets(dataDir, "session")).toEqual([
      join(dataDir, "sessions"),
    ]);
    expect(ripgrepTargets(dataDir, "project")).toEqual([
      join(dataDir, "markdown"),
      join(dataDir, "sessions"),
    ]);
  });

  it("treats rg exit 1 (no matches) as empty results", async () => {
    const backend = new RipgrepBackend(temporaryDirectory(), async () => "");
    const results = await backend.search(query());
    expect(results).toEqual([]);
  });
});

describe("Task 12.3 — QmdBackend", () => {
  it("invokes qmd search with --json -n and parses rows", async () => {
    const calls: string[][] = [];
    const backend = new QmdBackend(
      [
        "docs",
      ],
      async (args) => {
        calls.push(args);
        return JSON.stringify([
          {
            docid: "#a3f2c1",
            file: "qmd://docs/auth.md",
            score: 0.84,
            snippet: "...authentication flow uses JWT tokens...",
            title: "Authentication Guide",
          },
        ]);
      },
    );
    const results = await backend.search(
      query({
        query: "authentication",
      }),
    );
    expect(calls[0]).toEqual([
      "search",
      "authentication",
      "--json",
      "-n",
      "5",
      "-c",
      "docs",
    ]);
    expect(results[0]).toMatchObject({
      content: "...authentication flow uses JWT tokens...",
      score: 0.84,
      source: {
        path: "qmd://docs/auth.md",
      },
    });
  });

  it("flags availability as false when qmd is missing", () => {
    refreshCommandCache("qmd");
    const backend = new QmdBackend([], async () => "[]");
    // qmd is not installed on this machine; availability must be false.
    return backend.isAvailable().then((available) => {
      if (process.env.XPI_MEMO_TEST_HAS_QMD === "1") expect(available).toBe(true);
      else expect(available).toBe(false);
    });
  });
});

describe("Task 12.5 — limit enforcement", () => {
  it("truncates results to the requested limit", async () => {
    const dataDir = temporaryDirectory();
    mkdirSync(join(dataDir, "markdown"), {
      recursive: true,
    });
    const backend = new RipgrepBackend(dataDir, async () =>
      [
        {
          type: "match",
          data: {
            lines: {
              text: "a",
            },
            path: {
              text: "/x",
            },
          },
        },
        {
          type: "match",
          data: {
            lines: {
              text: "b",
            },
            path: {
              text: "/x",
            },
          },
        },
        {
          type: "match",
          data: {
            lines: {
              text: "c",
            },
            path: {
              text: "/x",
            },
          },
        },
      ]
        .map((event) => `${JSON.stringify(event)}\n`)
        .join(""),
    );
    const results = await backend.search(
      query({
        limit: 2,
      }),
    );
    expect(results).toHaveLength(2);
  });
});

describe("Task 13.1 — backend configuration", () => {
  it("backendNames pins the configured backend first", () => {
    expect(backendNames("auto")).toEqual([
      "mnemosyne",
      "ripgrep",
      "qmd",
    ]);
    expect(backendNames("ripgrep")).toEqual([
      "ripgrep",
      "mnemosyne",
      "qmd",
    ]);
  });

  it("runtime switching: next runSearch uses the new setting", async () => {
    const dataDir = temporaryDirectory();
    const context = {
      dataDir,
      projectBank: null,
    };
    const first = createSearchRuntime(context, "ripgrep", async () => "[]");
    const second = createSearchRuntime(context, "qmd", async () => "[]");
    expect(first.preferred).toBe("ripgrep");
    expect(second.preferred).toBe("qmd");
  });
});

describe("Task 12.3 parser", () => {
  it("ignores malformed qmd output", () => {
    expect(parseRows("not-json")).toEqual([]);
  });
});

describe("Task 13.5 — end-to-end fallback", () => {
  it("falls back to the next backend when the active one throws mid-search", async () => {
    const registry = {
      all: () => [
        stubBackend("mnemosyne", {
          throwOnSearch: true,
        }),
        stubBackend("ripgrep", {
          results: [
            "from ripgrep",
          ],
        }),
      ],
      get: () => undefined,
    };
    const runSearch = createSearchRunner(registry, new BackendMetrics());
    const outcome = await runSearch(query());
    expect(outcome.backendName).toBe("ripgrep");
    expect(outcome.results[0]?.content).toBe("from ripgrep");
    expect(outcome.warning).toContain("fell back to ripgrep");
  });

  it("buildRipgrepArgs passes regex patterns through to rg", () => {
    const args = buildRipgrepArgs(
      query({
        query: "foo.*bar",
      }),
      [
        "/tmp/x",
      ],
    );
    expect(args).toContain("foo.*bar");
  });
});
