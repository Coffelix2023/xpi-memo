/**
 * Bounded automatic delivery wiring (add-mental-model-projections, task 4.4):
 * `before_agent_start` injects a fresh projection as derived untrusted data,
 * falls back to the pre-change behavior when nothing fresh survives, and
 * suppresses recall rows the projection already covers.
 *
 * The mnemosyne CLI boundary is an in-memory mock that also serves `export` and
 * `recall`; projections are seeded directly on disk so no model call is needed.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import xpiMemo from "./index.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import { createCliBankStateReader } from "./markdown-export/bank-state.js";
import {
  ACTIVE_PROJECT_OPERATING_MODEL_ID,
  mentalModelDefinition,
  USER_WORKING_STYLE_ID,
} from "./mental-model/definitions.js";
import {
  mentalModelProjectionPath,
  resolveMentalModelOwner,
} from "./mental-model/owner.js";
import { readMentalModelSources } from "./mental-model/sources.js";
import { writeMentalModelProjection } from "./mental-model/store.js";
import type { MentalModelDefinition } from "./mental-model/types.js";
import type { MnemosyneRunner } from "./operations.js";

const SOURCE_CONTENT = "prefer one-line summaries";
const PROJECTION_CONTENT = "Standing answer: keep summaries short and concrete.";
const RECALL_SOURCE =
  "kind=global_preference;ev=explicit-user-statement;prov=manual;ts=2026-09-21T00:00:00.000Z;src=session:s1#42";

/** Every L0 event of the single session this test created. */
async function l0Events(dataDir: string): Promise<
  Array<{
    payload: Record<string, unknown>;
    type: string;
  }>
> {
  const [sessionId] = readdirSync(join(dataDir, "sessions"));
  if (!sessionId) throw new Error("no L0 session directory found");
  return createEventLogReader({
    sessionDir: join(dataDir, "sessions", sessionId),
  }).readAll();
}

/** The audit entries this test wrote. */
function auditEntries(dataDir: string): Array<{
  action: string;
  metadata: Record<string, unknown>;
}> {
  const parsed = JSON.parse(readFileSync(join(dataDir, "audit.json"), "utf8")) as {
    entries: Array<{
      action: string;
      metadata: Record<string, unknown>;
    }>;
  };
  return parsed.entries;
}
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
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-delivery-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** In-memory mnemosyne CLI: `export` for the reader, `recall` for injection. */
function backend(): {
  run: MnemosyneRunner;
} {
  const rows = [
    {
      content: SOURCE_CONTENT,
      id: "memory-1",
      source: RECALL_SOURCE,
    },
  ];
  const run: MnemosyneRunner = async (args) => {
    if (args[0] === "export") {
      writeFileSync(
        args[1] as string,
        JSON.stringify({
          episodic_memory: [],
          working_memory: rows.map((row) => ({
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
        results: [
          {
            content: SOURCE_CONTENT,
            id: "memory-1",
            score: 0.9,
            source: RECALL_SOURCE,
          },
        ],
      });
    return "";
  };
  return {
    run,
  };
}

interface RegisteredEvent {
  handler: (event?: unknown, ctx?: unknown) => unknown | Promise<unknown>;
  name: string;
}

function loadExtension(options: { dataDir: string; run: MnemosyneRunner }): {
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
      // Delivery is independent of synthesis: keep the model path off.
      XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED: "false",
      XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "false",
      XPI_MEMO_RECALL_POLICY: "active",
    },
    resolveProjectIdentity: () => null,
  });
  return {
    events,
  };
}

function ctx(): ExtensionContext {
  return {
    cwd: "/tmp",
    mode: "rpc",
    model: undefined,
    modelRegistry: undefined,
    ui: {
      confirm: async () => false,
      notify: () => undefined,
      select: async () => undefined,
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  } as unknown as ExtensionContext;
}

async function beforeAgentStart(
  events: RegisteredEvent[],
  context: ExtensionContext,
  prompt: string,
): Promise<string> {
  const hook = events.find((entry) => entry.name === "before_agent_start");
  if (!hook) throw new Error("before_agent_start hook not registered");
  const result = (await hook.handler(
    {
      prompt,
      type: "before_agent_start",
    },
    context,
  )) as {
    message?: {
      content?: string;
    };
  };
  return result?.message?.content ?? "";
}

/** Fire one registered hook with a raw event. */
async function fireHook(
  events: RegisteredEvent[],
  name: string,
  context: ExtensionContext,
  event: unknown = {},
): Promise<void> {
  const hook = events.find((entry) => entry.name === name);
  if (!hook) throw new Error(`${name} hook not registered`);
  await hook.handler(event, context);
}

function definition(id: string): MentalModelDefinition {
  const found = mentalModelDefinition(id);
  if (!found) throw new Error(`missing definition ${id}`);
  return found;
}

/** Write a projection whose digest matches the current bank, so it is fresh. */
async function seedFreshProjection(options: {
  dataDir: string;
  definition: MentalModelDefinition;
  ownerKey?: string;
  run: MnemosyneRunner;
}): Promise<void> {
  const target = options.definition;
  const owner = resolveMentalModelOwner(
    target,
    target.scope === "project" ? (options.ownerKey ?? null) : null,
  );
  if (!owner) throw new Error("no owner");
  const read = await readMentalModelSources({
    bank: owner.scope === "global" ? "default" : owner.key,
    dataDir: options.dataDir,
    definition: target,
    owner,
    read: createCliBankStateReader(options.run),
  });
  if (!read.ok) throw new Error("source read failed");
  const path = mentalModelProjectionPath(options.dataDir, owner, target.id);
  if (!path) throw new Error("no projection path");
  const write = writeMentalModelProjection(path, {
    content: PROJECTION_CONTENT,
    definitionId: target.id,
    definitionVersion: target.version,
    generatedAt: "2026-09-21T00:00:00.000Z",
    generator: {},
    ownerKey: owner.key,
    refreshedAt: "2026-09-21T00:00:00.000Z",
    scope: owner.scope,
    sourceBoundary: 42,
    sourceDigest: read.evaluation.digest,
    sourceIds: read.evaluation.rows.map((row) => row.id),
    version: 1,
    lastAttempt: {
      at: "2026-09-21T00:00:00.000Z",
      outcome: "refreshed",
    },
  });
  if (!write.ok) throw new Error(`projection write failed: ${write.reason}`);
}

const RELEVANT_PROMPT = "which workflow and preferences should you follow here";

describe("mental-model delivery wiring (task 4.4)", () => {
  it("injects a fresh projection and suppresses its covered recall rows", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    const { run } = backend();
    await seedFreshProjection({
      dataDir: dir,
      definition: definition(USER_WORKING_STYLE_ID),
      run,
    });
    const { events } = loadExtension({
      dataDir: dir,
      run,
    });
    // Establish an L0 session so the delivery record has a session to land in.
    await fireHook(events, "input", ctx(), {
      source: "interactive",
      text: "hello",
      type: "input",
    });
    const content = await beforeAgentStart(events, ctx(), RELEVANT_PROMPT);

    expect(content).toContain("<untrusted-memory-data>");
    expect(content).toContain("[derived mental model: user-working-style]");
    expect(content).toContain(PROJECTION_CONTENT);
    // The covered source row is represented by the projection, so automatic
    // recall must not emit it a second time as a ranked memory line. (The
    // deterministic preference profile is a separate derived view and is not
    // part of recall ranking.)
    expect(content).not.toContain(`1. ${SOURCE_CONTENT} [global_preference]`);

    // Task 5.1: the delivery outcome is recorded body-free in both surfaces.
    const auditRecord = auditEntries(dir).find(
      (entry) => entry.action === "mental-model",
    );
    expect(auditRecord?.metadata).toMatchObject({
      injectedCount: 1,
      status: "injected",
    });
    expect(JSON.stringify(auditRecord)).not.toContain(PROJECTION_CONTENT);
    const injectionEvents = (await l0Events(dir)).filter(
      (event) => event.type === "mental_model_injected",
    );
    expect(injectionEvents).toHaveLength(1);
    expect(injectionEvents[0]?.payload).toMatchObject({
      injectedCount: 1,
      lifecycleStage: "automatic-recall",
      definitionIds: [
        USER_WORKING_STYLE_ID,
      ],
      ownerKeys: [
        "global",
      ],
    });
    expect(JSON.stringify(injectionEvents)).not.toContain(PROJECTION_CONTENT);
  });

  it("falls back to existing behavior when no projection is fresh", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    const { run } = backend();
    const { events } = loadExtension({
      dataDir: dir,
      run,
    });

    const content = await beforeAgentStart(events, ctx(), RELEVANT_PROMPT);

    // Ordinary recall still works exactly as before, with no projection block.
    expect(content).toContain(`1. ${SOURCE_CONTENT} [global_preference]`);
    expect(content).not.toContain("[derived mental model");
  });

  it("never injects another project's projection without identity", async () => {
    const dir = dataDir();
    writeFileSync(join(dir, "mnemosyne.db"), "not-a-real-db");
    const projectBank = "project-p-aaaaaaaaaaaa";
    mkdirSync(join(dir, "banks", projectBank), {
      recursive: true,
    });
    writeFileSync(join(dir, "banks", projectBank, "mnemosyne.db"), "bank");
    const { run } = backend();
    // A project projection exists on disk, but this context has no project
    // identity, so it must not be delivered anywhere.
    await seedFreshProjection({
      dataDir: dir,
      definition: definition(ACTIVE_PROJECT_OPERATING_MODEL_ID),
      ownerKey: projectBank,
      run,
    });
    expect(
      existsSync(
        join(
          dir,
          "mental-models",
          "projects",
          projectBank,
          `${ACTIVE_PROJECT_OPERATING_MODEL_ID}.json`,
        ),
      ),
    ).toBe(true);
    const { events } = loadExtension({
      dataDir: dir,
      run,
    });

    const content = await beforeAgentStart(
      events,
      ctx(),
      "restore project context decisions constraints",
    );

    expect(content).not.toContain(PROJECTION_CONTENT);
    expect(content).not.toContain("[derived mental model");
  });
});
