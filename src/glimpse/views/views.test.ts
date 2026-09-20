import { describe, expect, it } from "vitest";
import { SETTINGS_GROUPS } from "../../settings-groups.js";
import { summarize } from "../../status-summary.js";
import { METER_SEGMENTS, TREND_DAYS } from "../charts.js";
import {
  candidateFixture,
  modelFixture,
  settingsRowsFixture,
  statusFixture,
} from "../fixture.js";
import { renderFooter, renderHeader, renderSidebar } from "./chrome.js";
import { renderPendingView } from "./pending.js";
import { renderRecentView } from "./recent.js";
import { renderSettingsView } from "./settings.js";
import { renderStatusView } from "./status.js";

/**
 * Count elements carrying a class *token*.
 *
 * A substring count would miss `class="field-row is-locked"`, which is how a
 * row with a modifier silently disappears from the tally.
 */
function countClass(html: string, token: string): number {
  return [
    ...html.matchAll(/class="([^"]*)"/g),
  ].filter((match) => match[1].split(" ").includes(token)).length;
}

/** Substring count, for exact attribute strings. */
function countText(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("pending view", () => {
  const model = modelFixture();
  const html = renderPendingView({
    candidates: model.pending,
    language: "zh",
    now: model.now,
    selectedIndex: 0,
  });

  it("carries its seven semantic anchors", () => {
    for (const code of [
      "P1-1-L1",
      "P1-1-A1",
      "P1-1-A2",
      "P1-1-B1",
      "P1-1-B2",
      "P1-1-B3",
      "P1-1-T1",
    ]) {
      expect(html, code).toContain(`id="${code}"`);
    }
  });

  it("renders one row and one detail block per candidate", () => {
    expect(countClass(html, "candidate-item")).toBe(model.pending.length);
    expect(countClass(html, "detail-block")).toBe(model.pending.length);
  });

  it("marks exactly one candidate selected", () => {
    expect(countClass(html, "is-selected")).toBe(1);
    expect(html).toContain('data-selected="0"');
  });

  it("shows all six detail rows for the selected candidate", () => {
    // type / bank / age / evidence / rationale / content
    expect(countClass(html, "detail-key")).toBe(model.pending.length * 6);
    expect(html).toContain("候选");
    expect(html).toContain("库");
  });

  it("badges only the candidate that reports a conflict", () => {
    expect(countClass(html, "pill-warn")).toBe(1);
  });

  it("renders the three decisions the actions contract expects", () => {
    for (const decision of [
      "store",
      "reject",
      "later",
    ]) {
      expect(html, decision).toContain(`data-decision="${decision}"`);
    }
  });

  it("switches to the empty state when there is nothing to review", () => {
    const empty = renderPendingView({
      candidates: [],
      language: "zh",
      now: model.now,
      selectedIndex: 0,
    });

    expect(empty).toContain('id="P1-1-T1"');
    expect(empty).not.toContain('id="P1-1-T1" hidden');
    expect(countClass(empty, "candidate-item")).toBe(0);
    // The split pane is hidden, not removed: the client toggles `hidden`.
    expect(empty).toContain('class="pane-split" hidden');
  });

  it("clamps a selection index past the end", () => {
    const clamped = renderPendingView({
      candidates: model.pending,
      language: "zh",
      now: model.now,
      selectedIndex: 99,
    });

    expect(clamped).toContain(`data-selected="${model.pending.length - 1}"`);
  });

  it("escapes a candidate body that contains markup", () => {
    const hostile = renderPendingView({
      language: "zh",
      now: model.now,
      selectedIndex: 0,
      candidates: [
        candidateFixture({
          content: "</pre><script>alert(1)</script>",
        }),
      ],
    });

    expect(hostile).not.toContain("<script>alert(1)</script>");
    expect(hostile).toContain("&lt;script&gt;alert(1)");
  });
});

describe("recent view", () => {
  const status = statusFixture();
  const html = renderRecentView({
    language: "zh",
    status,
  });

  it("carries its two semantic anchors", () => {
    expect(html).toContain('id="P2-1-X1"');
    expect(html).toContain('id="P2-1-T1"');
  });

  it("renders the header and divider plus one row per entry", () => {
    const entries = status.recentEntries ?? [];
    // The head and the divider are rows too, so the count is entries + 2.
    expect(countClass(html, "tr")).toBe(entries.length + 2);
  });

  it("gives each of the five statuses its semantic classes", () => {
    // stored / hit / pending / rejected / degraded
    for (const className of [
      "pill-ok",
      "pill-danger",
      "pill-warn",
      "pill-dim",
    ]) {
      expect(html, className).toContain(className);
    }
    for (const tint of [
      "t-ok",
      "t-danger",
      "t-warn",
      "t-dim",
    ]) {
      expect(html, tint).toContain(tint);
    }
  });

  it("switches to the empty state when there is no activity", () => {
    const empty = renderRecentView({
      language: "zh",
      status: statusFixture({
        recentEntries: [],
      }),
    });

    expect(empty).toContain('id="P2-1-T1"');
    // The head and divider stay in the DOM; the whole table is hidden.
    expect(countClass(empty, "tr")).toBe(2);
    expect(empty).toContain('class="table-wrap" hidden');
  });

  it("keeps an unknown status visible instead of dropping the row", () => {
    const unknown = renderRecentView({
      language: "zh",
      status: statusFixture({
        recentEntries: [
          {
            action: "future",
            status: "invented-status",
            timestamp: "2026-09-20T10:00:00.000Z",
          },
        ],
      }),
    });

    expect(unknown).toContain("invented-status");
    expect(countClass(unknown, "tr")).toBe(3);
  });
});

describe("settings view", () => {
  const rows = settingsRowsFixture();
  const html = renderSettingsView({
    language: "zh",
    rows,
  });

  it("carries every group, field, and state anchor", () => {
    for (const code of [
      "P3-1-L1",
      "P3-1-A1",
      "P3-1-B1",
      "P3-1-B2",
      "P3-1-B3",
      "P3-1-B4",
      "P3-1-B5",
      "P3-1-B6",
      "P3-1-T1",
      "P3-1-T2",
    ]) {
      expect(html, code).toContain(`id="${code}"`);
    }
  });

  it("renders one row per configured field", () => {
    expect(countClass(html, "field-row")).toBe(rows.length);
    expect(rows).toHaveLength(37);
  });

  it("renders one head per configured group", () => {
    expect(countClass(html, "group-head")).toBe(SETTINGS_GROUPS.length);
    expect(SETTINGS_GROUPS).toHaveLength(6);
  });

  it("opens exactly the first group", () => {
    expect(countText(html, 'aria-expanded="true"')).toBe(1);
    // Five of six bodies start hidden.
    expect(countText(html, 'class="group-body" hidden')).toBe(
      SETTINGS_GROUPS.length - 1,
    );
  });

  it("marks an environment-pinned field as locked", () => {
    expect(countClass(html, "is-locked")).toBe(1);
    expect(html).toContain("XPI_MEMO_LIMIT");
  });

  it("marks the one-shot action row", () => {
    expect(countClass(html, "is-action")).toBe(1);
  });

  it("keeps the loading and error regions present but hidden", () => {
    expect(html).toContain('id="P3-1-T1"');
    expect(html).toContain('id="P3-1-T2"');
    expect(html).toContain("保存失败");
  });

  it("renders the field count the config actually has, not the prototype's twenty", () => {
    // The prototype was built against 20 fields in 5 groups; the live config has
    // 37 in 6. Rendering 20 would silently hide the admission group.
    expect(html).toContain("自动准入");
    expect(countClass(html, "field-row")).toBeGreaterThan(20);
  });
});

describe("status view", () => {
  const status = statusFixture();
  const html = renderStatusView({
    language: "zh",
    now: modelFixture().now,
    status,
    statusJson: modelFixture().statusJson,
  });

  it("carries its eight semantic anchors", () => {
    for (const code of [
      "P4-1-A1",
      "P4-1-C1",
      "P4-1-C2",
      "P4-1-C3",
      "P4-1-C4",
      "P4-1-U1",
      "P4-1-U2",
      "P4-1-A2",
    ]) {
      expect(html, code).toContain(`id="${code}"`);
    }
  });

  it("renders four cards", () => {
    expect(countClass(html, "kpi-card")).toBe(4);
  });

  it("renders the meter at a fixed segment count", () => {
    expect(countClass(html, "meter-seg")).toBe(METER_SEGMENTS);
  });

  it("renders a fixed number of trend bars regardless of entry count", () => {
    expect(countClass(html, "spark-bar")).toBe(TREND_DAYS);

    const noEntries = renderStatusView({
      language: "zh",
      now: modelFixture().now,
      status: statusFixture({
        recentEntries: [],
      }),
      statusJson: modelFixture().statusJson,
    });
    expect(countClass(noEntries, "spark-bar")).toBe(TREND_DAYS);
  });

  it("shows the live retrieval mode rather than a baked-in demo value", () => {
    expect(html).toContain("hybrid");
    expect(html).toContain("不可用");

    const available = renderStatusView({
      language: "zh",
      now: modelFixture().now,
      status: statusFixture({
        retrieval: {
          embeddingAvailable: true,
          mode: "fts5",
        },
      }),
      statusJson: modelFixture().statusJson,
    });
    expect(available).toContain("fts5");
    expect(available).not.toContain("不可用");
  });

  it("puts the raw payload in the snapshot", () => {
    expect(html).toContain('id="P4-1-A2"');
    expect(html).toContain("todayStored");
  });
});

describe("window chrome", () => {
  const model = modelFixture();
  const summary = summarize(model.statusJson);
  const input = {
    activeView: "settings" as const,
    language: "zh" as const,
    summary,
    theme: "dark" as const,
  };

  it("header carries the badge and both toggles", () => {
    const html = renderHeader(input);

    expect(html).toContain('id="P0-1-B1"');
    expect(html).toContain('id="P0-1-W1"');
    expect(html).toContain('id="P0-1-W2"');
    expect(html).toContain("运行中");
  });

  it("sidebar lists four views and marks the active one", () => {
    const html = renderSidebar(input);

    expect(countClass(html, "nav-item")).toBe(4);
    expect(countClass(html, "is-active")).toBe(1);
    expect(html).toContain('data-tab="settings"');
    expect(html).toContain('aria-current="page"');
  });

  it("sidebar shows the pending count", () => {
    expect(renderSidebar(input)).toContain('class="nav-count"');
    expect(
      renderSidebar({
        ...input,
        summary: {
          ...summary,
          pending: 0,
        },
      }),
    ).not.toContain('class="nav-count"');
  });

  it("footer carries the info bar and the close button", () => {
    const html = renderFooter(input);

    expect(html).toContain('id="P0-1-C1"');
    expect(html).toContain('id="P0-1-B2"');
    expect(html).toContain("关闭窗口");
  });

  it("footer reports the same counts as the terminal panel's summary", () => {
    const html = renderFooter(input);

    expect(html).toContain("xpi-memo");
    expect(html).toContain("166");
    expect(html).toContain("420.5 KB");
  });

  it("reflects a paused bank in the header badge and the footer value", () => {
    const paused = {
      ...input,
      summary: {
        ...summary,
        paused: true,
      },
    };

    // The badge is a header element; the footer prints the literal value.
    expect(renderHeader(paused)).toContain("已暂停");
    expect(countClass(renderHeader(paused), "badge-dim")).toBe(1);
    expect(renderFooter(paused)).toContain('class="info-val">on<');
  });
});
