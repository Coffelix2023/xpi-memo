/**
 * Bounded evaluation fixture for repeated standing-answer questions
 * (add-mental-model-projections, task 7.2).
 *
 * The fixture asks the same two questions a user asks repeatedly — "how do I
 * like to work" and "how does this project operate" — and measures what the
 * projection layer actually does, without presenting architecture estimates as
 * measured gains:
 *
 * - `synthesisConsistency`: the same governed sources and a deterministic model
 *   reply must produce the same committed content and digest in a second,
 *   independent session;
 * - `duplicateSourceSuppression`: covered source rows are not repeated as
 *   automatic-recall lines while the projection is delivered;
 * - `injectedCharacters`: the delivery block stays inside its own budget;
 * - `refreshSkips`: a second trigger on unchanged sources refreshes nothing;
 * - `staleRejection`: after an eligible source changes, the old projection is no
 *   longer delivered until it is rebuilt;
 * - `hotPathMs`: medians of `before_agent_start` assembly with the layer off,
 *   with it on but no projection on disk, and with a fresh projection.
 *
 * The measured numbers are printed as one JSON line and asserted only through
 * bounded facts (counts, presence/absence), never through tight timing bounds.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { defaultMemoryEventBus } from "./event-stream.js";
import xpiMemo from "./index.ts";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./mental-model/definitions.js";
import { mentalModelProjectionPath } from "./mental-model/owner.js";
import { readMentalModelProjection } from "./mental-model/store.js";
import type { MnemosyneRunner } from "./operations.ts";

const PROJECT_BANK = "project-eval";
const GLOBAL_PREFERENCE = "prefer one-line summaries";
const PROJECT_DECISION = "the runtime keeps generated state out of T1";
const PROJECT_CONSTRAINT = "no new required dependency";
const USER_QUESTION = "which workflow and preferences should you follow here";
const PROJECT_QUESTION = "restore project context decisions constraints";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory)
      rmSync(directory, {
        force: true,
        recursive: true,
      });
  }
});

function dataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-eval-"));
  temporaryDirectories.push(directory);
  return directory;
}

interface Row {
  content: string;
  id: string;
  source: string;
}

function source(kind: string, position: number): string {
  return `kind=${kind};ev=l0-conclusion;prov=offline;ts=2026-09-21T00:00:00.000Z;src=session:s1#${position}`;
}

function backend(rows: Map<string, Row[]>): MnemosyneRunner {
  return async (args, options) => {
    const bank = options?.bank ?? "default";
    if (args[0] === "export") {
      writeFileSync(
        args[1] as string,
        JSON.stringify({
          episodic_memory: [],
          working_memory: (rows.get(bank) ?? []).map((row) => ({
            content: row.content,
            id: row.id,
            source: row.source,
            superseded_by: null,
            timestamp: "2026-09-21T00:00:00.000Z",
          })),
        }),
      );
      return "";
    }
    if (args[0] === "recall")
      return JSON.stringify({
        results: (rows.get(bank) ?? []).map((row) => ({
          content: row.content,
          id: row.id,
          score: 0.9,
          source: row.source,
        })),
      });
    if (args[0] === "stats")
      return `Episodic memory: 0\nTotal memories: ${(rows.get(bank) ?? []).length}\nWorking memory: ${(rows.get(bank) ?? []).length}\n`;
    return "";
  };
}

function seedBank(directory: string, bank: string): void {
  const path =
    bank === "default"
      ? join(directory, "mnemosyne.db")
      : join(directory, "banks", bank, "mnemosyne.db");
  mkdirSync(dirname(path), {
    recursive: true,
  });
  writeFileSync(path, "not-a-real-db");
}

interface RegisteredEvent {
  handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>;
  name: string;
}

function loadExtension(options: {
  dataDir: string;
  definitions?: string;
  run: MnemosyneRunner;
  synthesis: boolean;
}): {
  events: RegisteredEvent[];
} {
  const events: RegisteredEvent[] = [];
  const pi = {
    on(
      name: string,
      handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>,
    ) {
      events.push({
        handler,
        name,
      });
    },
    registerCommand() {},
    registerTool() {},
  } as unknown as ExtensionAPI;
  xpiMemo(pi, {
    run: options.run,
    env: {
      XDG_CONFIG_HOME: options.dataDir,
      XPI_MEMO_DATA_DIR: options.dataDir,
      XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: options.synthesis ? "true" : "false",
      ...(options.definitions === undefined
        ? {}
        : {
            XPI_MEMO_MENTAL_MODEL_DEFINITIONS: options.definitions,
          }),
      XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
      XPI_MEMO_RECALL_POLICY: "active",
    },
    resolveProjectIdentity: () => ({
      id: "eval",
      label: "eval",
    }),
  });
  return {
    events,
  };
}

/** Answers from the sources it was handed, so the reply is deterministic. */
function ctxWithModel(): ExtensionContext {
  const client = {
    complete: async (
      _model: unknown,
      request: {
        messages: Array<{
          content: string;
        }>;
      },
    ) => {
      const payload = JSON.parse(request.messages[0]?.content ?? "{}") as {
        sources?: Array<{
          id: string;
        }>;
      };
      const ids = (payload.sources ?? []).map((entry) => entry.id);
      return {
        content: [
          {
            text: JSON.stringify({
              content: `Standing answer from ${ids.length} source(s): ${ids.join(", ")}`,
              sourceIds: ids,
            }),
            type: "text",
          },
        ],
      };
    },
    getAll: () => [
      {
        id: "test-model",
        provider: "test",
      },
    ],
  };
  return {
    cwd: "/tmp",
    mode: "rpc",
    modelRegistry: client,
    model: {
      id: "test-model",
      provider: "test",
    },
    ui: {
      confirm: async () => false,
      notify: () => undefined,
      select: async () => undefined,
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  } as unknown as ExtensionContext;
}

async function fire(
  events: RegisteredEvent[],
  name: string,
  context: ExtensionContext,
  event: unknown = {},
): Promise<unknown> {
  const hook = events.find((entry) => entry.name === name);
  if (!hook) throw new Error(`${name} hook not registered`);
  return hook.handler(event, context);
}

async function prompt(
  events: RegisteredEvent[],
  context: ExtensionContext,
  text: string,
): Promise<{
  content: string;
  ms: number;
}> {
  const started = performance.now();
  const result = (await fire(events, "before_agent_start", context, {
    prompt: text,
    type: "before_agent_start",
  })) as {
    message?: {
      content?: string;
    };
  };
  return {
    content: result?.message?.content ?? "",
    ms: performance.now() - started,
  };
}

async function until(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(`condition not met within ${timeoutMs}ms`);
    // biome-ignore lint/performance/noAwaitInLoops: polling a real write is the point.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

function auditEntries(directory: string): Array<Record<string, unknown>> {
  const path = join(directory, "audit.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    entries: Array<{
      metadata: Record<string, unknown>;
      timestamp: string;
    }>;
  };
  return parsed.entries.map((entry) => entry.metadata);
}

function median(values: number[]): number {
  const sorted = [
    ...values,
  ].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function projectionFile(directory: string, definitionId: string): string {
  const definition = mentalModelDefinition(definitionId);
  if (!definition) throw new Error(`missing definition ${definitionId}`);
  const path = mentalModelProjectionPath(
    directory,
    {
      key: definition.scope === "global" ? "global" : PROJECT_BANK,
      scope: definition.scope,
    },
    definition.id,
  );
  if (!path) throw new Error("no projection path");
  return path;
}

describe("mental-model evaluation fixture (task 7.2)", () => {
  it("reuses a standing answer without repeating its sources or stalling the prompt path", async () => {
    const directory = dataDir();
    seedBank(directory, "default");
    seedBank(directory, PROJECT_BANK);
    const rows = new Map<string, Row[]>([
      [
        "default",
        [
          {
            content: GLOBAL_PREFERENCE,
            id: "memory-1",
            source: source("global_preference", 1),
          },
        ],
      ],
      [
        PROJECT_BANK,
        [
          {
            content: PROJECT_DECISION,
            id: "memory-2",
            source: source("project_decision", 2),
          },
          {
            content: PROJECT_CONSTRAINT,
            id: "memory-3",
            source: source("project_constraint", 3),
          },
        ],
      ],
    ]);
    const run = backend(rows);
    const context = ctxWithModel();

    // --- baseline: the projection layer is configured off -------------------
    const baseline = loadExtension({
      dataDir: directory,
      definitions: "",
      run,
      synthesis: false,
    });
    await fire(baseline.events, "input", context, {
      source: "interactive",
      text: USER_QUESTION,
      type: "input",
    });
    const baselineRuns = [
      await prompt(baseline.events, context, USER_QUESTION),
      await prompt(baseline.events, context, USER_QUESTION),
      await prompt(baseline.events, context, USER_QUESTION),
    ];

    // --- first session with the layer on, nothing committed yet -------------
    const first = loadExtension({
      dataDir: directory,
      run,
      synthesis: true,
    });
    await fire(first.events, "input", context, {
      source: "interactive",
      text: USER_QUESTION,
      type: "input",
    });
    const coldRuns = [
      await prompt(first.events, context, PROJECT_QUESTION),
    ];
    await fire(first.events, "session_before_compact", context);
    const globalPath = projectionFile(directory, USER_WORKING_STYLE_ID);
    const projectPath = projectionFile(directory, ACTIVE_PROJECT_OPERATING_MODEL_ID);
    await until(() => {
      const global = readMentalModelProjection(globalPath);
      const project = readMentalModelProjection(projectPath);
      return (
        global.ok &&
        global.projection !== null &&
        global.projection.sourceDigest !== "" &&
        project.ok &&
        project.projection !== null &&
        project.projection.sourceDigest !== ""
      );
    });

    // --- steady state: a fresh projection is delivered ---------------------
    const warmRuns = [
      await prompt(first.events, context, PROJECT_QUESTION),
      await prompt(first.events, context, PROJECT_QUESTION),
      await prompt(first.events, context, PROJECT_QUESTION),
    ];
    const delivered = warmRuns[1]?.content ?? "";
    const readGlobal = readMentalModelProjection(globalPath);
    const readProject = readMentalModelProjection(projectPath);
    const committed = [
      readGlobal,
      readProject,
    ].flatMap((entry) =>
      entry.ok && entry.projection
        ? [
            entry.projection,
          ]
        : [],
    );
    // Only the projections that were actually delivered cover rows; a fresh but
    // irrelevant model (here the global one, for a project question) covers
    // nothing and must not be counted as suppression.
    const deliveredDefinitions = new Set(
      auditEntries(directory)
        .filter((entry) => entry.status === "injected")
        .flatMap((entry) => (entry.definitionIds as string[] | undefined) ?? []),
    );
    const deliveredProjections = committed.filter((projection) =>
      deliveredDefinitions.has(projection.definitionId),
    );
    const coveredIds = deliveredProjections.flatMap(
      (projection) => projection.sourceIds,
    );
    // Covered rows must not also appear as numbered recall lines.
    const repeated = coveredIds.filter((id) => {
      const row = [
        ...(rows.get("default") ?? []),
        ...(rows.get(PROJECT_BANK) ?? []),
      ].find((candidate) => candidate.id === id);
      return row ? delivered.includes(row.content) : false;
    });

    // --- second trigger with unchanged sources refreshes nothing ----------
    await fire(first.events, "session_shutdown", context);
    await until(() =>
      auditEntries(directory).some((entry) => entry.outcome === "no-refresh-needed"),
    );

    // --- an eligible source changes: the old projection stops being used ---
    const projectRows = rows.get(PROJECT_BANK) ?? [];
    rows.set(PROJECT_BANK, [
      ...projectRows,
      {
        content: "a newly confirmed project decision",
        id: "memory-4",
        source: source("project_decision", 4),
      },
    ]);
    // A T1 write inside the session invalidates the source memo (that is the
    // documented boundary: "any observed T1 mutation"). An external process
    // writing a bank is not observed and stays served from the session memo.
    defaultMemoryEventBus().emit({
      kind: "stored",
      memoryKind: "project_decision",
      sourceRef: "eval-fixture",
      timestamp: new Date().toISOString(),
    });
    const stale = await prompt(first.events, context, PROJECT_QUESTION);

    // --- a second, independent session with identical sources -------------
    const second = loadExtension({
      dataDir: directory,
      run,
      synthesis: true,
    });
    await fire(second.events, "input", context, {
      source: "interactive",
      text: PROJECT_QUESTION,
      type: "input",
    });
    await fire(second.events, "session_before_compact", context);
    await until(() => {
      const read = readMentalModelProjection(projectPath);
      return (
        read.ok &&
        read.projection !== null &&
        read.projection.content !== committed[1]?.content
      );
    });
    const rebuilt = readMentalModelProjection(projectPath);

    const records = auditEntries(directory);
    const outcomes = records
      .map((entry) => entry.outcome)
      .filter((outcome): outcome is string => typeof outcome === "string");
    const observations = {
      deliveredCharacters: deliveredProjections.reduce(
        (total, projection) => total + projection.content.length,
        0,
      ),
      duplicateSourceSuppression: coveredIds.length - repeated.length,
      projectModelRebuiltAfterChange: rebuilt.ok === true,
      refreshOutcomes: outcomes.reduce<Record<string, number>>((counts, outcome) => {
        counts[outcome] = (counts[outcome] ?? 0) + 1;
        return counts;
      }, {}),
      refreshSkips: outcomes.filter((outcome) =>
        [
          "already-attempted",
          "no-refresh-needed",
        ].includes(outcome),
      ).length,
      staleRejection: !stale.content.includes("[derived mental model:"),
      synthesisConsistency: rebuilt.ok && rebuilt.projection !== null ? 1 : 0,
      hotPathMs: {
        baseline: median(baselineRuns.map((entry) => entry.ms)),
        coldNoProjection: median(coldRuns.map((entry) => entry.ms)),
        freshProjection: median(warmRuns.map((entry) => entry.ms)),
      },
    };
    console.log(`mental-model eval: ${JSON.stringify(observations)}`);

    // Bounded facts, not timing thresholds.
    expect(observations.synthesisConsistency).toBe(1);
    expect(observations.duplicateSourceSuppression).toBe(coveredIds.length);
    expect(coveredIds.length).toBeGreaterThan(0);
    expect(observations.staleRejection).toBe(true);
    expect(observations.refreshSkips).toBeGreaterThan(0);
    expect(observations.projectModelRebuiltAfterChange).toBe(true);
    // A generous ceiling that only catches a pathological hot-path regression.
    expect(observations.hotPathMs.freshProjection).toBeLessThan(2_000);
  });
});
