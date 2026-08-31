import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type MemoryStatus,
  renderStatus,
  todayStored,
  visibleBankDiskBytes,
} from "./status.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-status-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, {
      force: true,
      recursive: true,
    });
});

describe("XpiMemo status", () => {
  const status: MemoryStatus = {
    diskBytes: 123,
    fallback: false,
    paused: false,
    pendingCandidates: 2,
    provenance: "evidence-linked",
    todayStored: 2,
    counts: {
      global: 4,
      project: 7,
      session: 1,
    },
    currentProject: {
      bank: "project-p-0123456789ab",
      id: "p-0123456789ab",
      label: "fx-pi-extensions",
    },
    recall: {
      scope: "current-project-plus-global",
      queriedBanks: [
        "project-p-0123456789ab",
        "default",
      ],
    },
    recentEntries: [
      {
        action: "write",
        bank: "project-p-0123456789ab",
        kind: "project_decision",
        scope: "global",
        status: "stored",
        timestamp: "2026-08-28T00:00:00.000Z",
      },
    ],
    retrieval: {
      embeddingAvailable: true,
      mode: "hybrid",
    },
    sleep: {
      dedicatedModelSupported: false,
      enabled: false,
      sleepCommandSupported: true,
    },
    storage: {
      dataDir: "/tmp/xpi-memo",
      legacyDataDirExists: false,
      files: {
        audit: true,
        candidates: true,
        globalDb: true,
        projectDb: true,
      },
    },
    tiers: {
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    },
  };

  it("includes optional WAL and visible project bank files in disk usage", () => {
    const dataDir = createTemporaryDirectory();
    mkdirSync(join(dataDir, "banks", "project-id"), {
      recursive: true,
    });
    writeFileSync(join(dataDir, "mnemosyne.db"), "1234");
    writeFileSync(join(dataDir, "mnemosyne.db-wal"), "12");
    writeFileSync(join(dataDir, "mnemosyne.db-shm"), "1");
    writeFileSync(join(dataDir, "banks", "project-id", "mnemosyne.db"), "123456");

    expect(visibleBankDiskBytes(dataDir, "project-id")).toBe(13);
    expect(visibleBankDiskBytes(dataDir, null)).toBe(7);
  });

  it("counts stored audit entries since local midnight", () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const today = new Date(midnight);
    today.setHours(1);
    const yesterday = new Date(midnight.getTime() - 1);
    expect(
      todayStored(
        [
          {
            action: "write",
            timestamp: today.toISOString(),
            metadata: {
              status: "stored",
            },
          },
          {
            action: "confirmation",
            timestamp: today.toISOString(),
            metadata: {
              status: "stored",
            },
          },
          {
            action: "write",
            timestamp: today.toISOString(),
            metadata: {
              status: "rejected",
            },
          },
          {
            action: "write",
            timestamp: yesterday.toISOString(),
            metadata: {
              status: "stored",
            },
          },
        ],
        now,
      ),
    ).toBe(2);
  });

  it("renders fixed ownership and bounded operational state", () => {
    const rendered = renderStatus(status);

    expect(rendered).toMatchObject({
      counts: status.counts,
      currentProject: status.currentProject,
      fallback: false,
      pendingCandidates: 2,
      provenance: "evidence-linked",
      recall: status.recall,
      recentEntries: status.recentEntries,
      retrieval: status.retrieval,
      sleep: status.sleep,
      storage: status.storage,
      tiers: status.tiers,
    });
  });

  it("does not expose secrets or raw payload fields", () => {
    const rendered = JSON.stringify(
      renderStatus({
        ...status,
        apiKey: "must-not-appear",
        rawPayload: "raw output must not appear",
      } as MemoryStatus & Record<string, unknown>),
    );

    expect(rendered).not.toContain("must-not-appear");
    expect(rendered).not.toContain("raw output must not appear");
  });

  it("reports an unrecognized project without inventing a bank", () => {
    const rendered = renderStatus({
      ...status,
      currentProject: null,
      recall: {
        scope: "global-only",
        queriedBanks: [
          "default",
        ],
      },
    });

    expect(rendered.currentProject).toBeNull();
    expect(rendered.recall.queriedBanks).toEqual([
      "default",
    ]);
  });
});
