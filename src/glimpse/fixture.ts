import { type PendingCandidate, RATIONALE_USER_STATED } from "../pending-candidate.js";
import { SETTINGS_GROUPS } from "../settings-groups.js";
import type { MemoryStatus } from "../status.js";
import type { GlimpseModel } from "./views/index.js";
import type { SettingsRowLike } from "./views/settings.js";

/**
 * Deterministic model for the window's tests.
 *
 * One fixture rather than one per test file, so every view is exercised against
 * the same shape and a change to `MemoryStatus` breaks in one place instead of
 * five. Not shipped behaviour: nothing outside tests imports it.
 */

/** A fixed instant, so relative ages and day buckets are reproducible. */
export const NOW = Date.parse("2026-09-20T12:00:00.000Z");

export function statusFixture(overrides: Partial<MemoryStatus> = {}): MemoryStatus {
  return {
    diskBytes: 430_592,
    fallback: null,
    paused: false,
    pendingCandidates: 3,
    provenance: "evidence-linked",
    todayStored: 14,
    counts: {
      global: 128,
      project: 166,
      session: 9,
    },
    currentProject: {
      bank: "project-xpi-memo",
      id: "xpi-memo",
      label: "xpi-memo",
    },
    embedding: {
      mode: "off",
      model: null,
    },
    recall: {
      scope: "current-project-plus-global",
      queriedBanks: [
        "project-xpi-memo",
        "default",
      ],
    },
    // Real audit shapes: the actions and statuses this build actually writes,
    // with each action's own metadata block. `feedback` and `recall` carry the
    // per-action fields the row summary reads.
    recentEntries: [
      {
        action: "confirmation",
        bank: "xpi-memo",
        kind: "project_decision",
        status: "stored",
        timestamp: "2026-09-20T10:22:00.000Z",
      },
      {
        action: "recall",
        status: "recalled",
        timestamp: "2026-09-20T10:18:00.000Z",
        metadata: {
          backend: "mnemosyne",
          injectedCount: 3,
          // The search query. It is the user's own words, so the row summary
          // must not reprint it — the view test asserts it stays out.
          reason: "restore project context decisions",
          resultCount: 8,
        },
      },
      {
        action: "feedback",
        timestamp: "2026-09-20T10:05:00.000Z",
        metadata: {
          feedback: "used",
          feedbackMode: "passive",
          targetMemoryId: "cd7a990fc903a7d6",
          usage: "injected",
        },
      },
      {
        action: "rejection",
        bank: "default",
        kind: "global_workflow",
        status: "rejected",
        timestamp: "2026-09-19T09:51:00.000Z",
      },
      {
        action: "extraction",
        status: "timed-out",
        timestamp: "2026-09-18T09:40:00.000Z",
        metadata: {
          candidateCount: 0,
          outcome: "timed-out",
          storedCount: 0,
        },
      },
    ],
    retrieval: {
      embeddingAvailable: false,
      mode: "hybrid",
    },
    search: {
      active: "ripgrep",
      backends: [],
    },
    sleep: {
      dedicatedModelSupported: false,
      enabled: false,
      mode: "none",
      sleepCommandSupported: false,
      state: "SLEEP_DISABLED",
    },
    tiers: {
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    },
    ...overrides,
  };
}

export function candidateFixture(
  overrides: Partial<PendingCandidate> = {},
): PendingCandidate {
  return {
    conflictState: "none",
    content: "User prefers first-principles analysis before proposing a fix.",
    createdAt: "2026-09-20T10:00:00.000Z",
    evidenceSummary:
      "explicit-user-statement from input:session (input:user-statement)",
    id: "candidate-1",
    kind: "global_preference",
    rationale: RATIONALE_USER_STATED,
    reason: "ambiguous-preference",
    status: "pending",
    targetBank: "default",
    targetScope: "global",
    evidence: {
      confidence: 0.8,
      provenance: "input:user-statement",
      source: "input:session",
      timestamp: "2026-09-20T10:00:00.000Z",
      type: "explicit-user-statement",
    },
    ...overrides,
  };
}

/**
 * Settings rows matching `SETTINGS_GROUPS` order, with the first row pinned by
 * an environment variable so the locked rendering is exercised.
 */
/**
 * The two rows whose value is not the fixture default. `recallPolicy` matches
 * one of its own enumerated values so the `selected` option is exercised.
 */
const FIXTURE_VALUES: Readonly<Record<string, string>> = {
  recallPolicy: "assist",
  sleep: "off",
};

export function settingsRowsFixture(): SettingsRowLike[] {
  return SETTINGS_GROUPS.flatMap((group) =>
    group.fields.map((id) => {
      const row: SettingsRowLike = {
        currentValue: FIXTURE_VALUES[id] ?? "auto",
        id,
      };
      // One row of each editable shape plus one pinned row, so every rendering
      // the view can produce is exercised without building the real table here.
      if (id === "embeddingModel") row.text = true;
      if (id === "limit") row.description = "\u2298 XPI_MEMO_LIMIT";
      if (id === "recallPolicy")
        row.values = [
          "active",
          "assist",
          "high-value-auto",
        ];
      return row;
    }),
  );
}

export function modelFixture(overrides: Partial<GlimpseModel> = {}): GlimpseModel {
  const status = overrides.status ?? statusFixture();
  return {
    language: "zh",
    now: NOW,
    rows: settingsRowsFixture(),
    pending: [
      candidateFixture(),
      candidateFixture({
        conflictState: "reported",
        createdAt: "2026-09-19T12:00:00.000Z",
        id: "candidate-2",
        kind: "project_constraint",
      }),
      candidateFixture({
        createdAt: "2026-09-17T12:00:00.000Z",
        id: "candidate-3",
        kind: "project_gotcha",
      }),
    ],
    status,
    // `summarize` reads this JSON, so the fixture must agree with `status`.
    statusJson: JSON.stringify({
      counts: status.counts,
      currentProject: status.currentProject,
      diskBytes: status.diskBytes,
      paused: status.paused,
      pendingCandidates: status.pendingCandidates,
      todayStored: status.todayStored,
      search: {
        active: status.search?.active ?? "auto",
      },
    }),
    ...overrides,
  };
}
