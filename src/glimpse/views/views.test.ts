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
import { GROUP_SHORT, SETTINGS_PANEL_SHORT } from "../short-codes.js";
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

/* The settings row controls. Module scope because a regex rebuilt per call is
   what `useTopLevelRegex` rejects, and these are read in more than one test. */
const RECALL_POLICY_SELECT =
  /<select[^>]*data-field="recallPolicy"[^>]*>[\s\S]*?<\/select>/;
const EMBEDDING_MODEL_INPUT = /<input[^>]*data-field="embeddingModel"[^>]*>/;
const CONTROL_FOR_LIMIT = /<(select|input)[^>]*data-field="limit"/;
const CONTROL_FOR_DATA_DIR = /<(select|input)[^>]*data-field="dataDir"/;
/** A settings tab panel the server rendered closed. */
const HIDDEN_TAB_PANEL_PATTERN = /class="tabs-content"[^>]*hidden/g;
const ISO_STAMP = /\d{4}-\d{2}-\d{2}T/;
const CLOCK_TIME = />\d{2}:\d{2}</;

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

  it("renders the stored reason in the panel's language", () => {
    // The fixture's reason is `RATIONALE_USER_STATED`, which is what a record
    // on disk carries — so this covers the existing queue, not just new
    // candidates.
    expect(html).toContain("用户明确陈述为长期偏好");
    expect(html).not.toContain("The user stated this as a durable preference.");
  });

  it("names the candidate's kind in the panel's language", () => {
    // The fixture queue carries a preference, a constraint, and a gotcha. The
    // stored content stays whatever language it was written in; the taxonomy
    // label is copy and travels through the dictionary.
    expect(html).toContain(">偏好<");
    expect(html).toContain(">约束<");
    expect(html).toContain(">坑点<");
    for (const english of [
      "Preference",
      "Constraint",
      "Gotcha",
    ]) {
      expect(html, english).not.toContain(english);
    }
  });

  it("renders the evidence row in the panel's language", () => {
    // The three values are identifiers and stay as they are; the frame around
    // them is copy and travels through the dictionary.
    expect(html).toContain("· 来自 input:session（input:user-statement）");
    expect(html).not.toContain(" from input:session");
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

  it("explains what the page is", () => {
    // The page is a window on the audit log, not a second status view; the
    // caption is what makes that readable without opening a doc.
    expect(countClass(html, "view-hint")).toBe(1);
    expect(html).toContain("取自审计日志");
    expect(
      renderRecentView({
        language: "en",
        status,
      }),
    ).toContain("read from the audit log");
  });

  it("shows a clock time rather than the raw stamp", () => {
    // `clockTime` is local-zone HH:MM, so the assertion is on the shape: the
    // zone of the machine running the suite is not part of the contract.
    expect(html).toMatch(CLOCK_TIME);
    expect(html).not.toMatch(ISO_STAMP);
  });

  it("labels the audit vocabulary it knows", () => {
    expect(html).toContain(">召回<");
    expect(html).toContain(">已存入<");
    expect(html).toContain(">已拒绝<");
    // The extraction row's status and its `outcome` field share a word; both
    // read through the same table.
    expect(html).toContain(">超时<");
  });

  it("renders the header and divider plus one row per entry", () => {
    const entries = status.recentEntries ?? [];
    // The head and the divider are rows too, so the count is entries + 2.
    expect(countClass(html, "tr")).toBe(entries.length + 2);
  });

  it("gives each status its own symbol and colour class", () => {
    // stored / recalled → ok, rejected → danger, timed-out → warn, and the
    // feedback row carries no status at all → the neutral dot.
    for (const token of [
      "pill-ok",
      "pill-danger",
      "pill-warn",
      "pill-dim",
      "t-ok",
      "t-danger",
      "t-warn",
      "t-dim",
    ]) {
      expect(html, token).toContain(token);
    }
    expect(html).toContain(">✓<");
    expect(html).toContain(">✗<");
    expect(html).toContain(">⚠<");
  });

  it("summarises a row from the metadata its own action carries", () => {
    // `feedback` has neither a bank nor a kind. Before the summary cell its row
    // was a line of dashes; this is the case the page was unreadable for.
    expect(html).toContain("被动 · 已注入 · #cd7a990fc903a7d6");
    expect(html).toContain("mnemosyne · 命中 8 · 注入 3");
    // A row that has a bank and a kind still shows them, and the kind is copy:
    // it reads in the panel's language like every other label.
    expect(html).toContain("决策 · xpi-memo");
    expect(html).not.toContain("Decision · xpi-memo");
  });

  it("leaves the recall query out of the row", () => {
    // `recall.reason` holds the search query, which is the user's own words.
    // The summary table names fields per action; this one must stay unnamed.
    expect(html).not.toContain("restore project context");
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
    expect(rows).toHaveLength(39);
  });

  it("renders an editable control for every writable shape", () => {
    // A field with enumerated values becomes a select, a free-text field an
    // input. Nothing else in this view owns a control, so the count is the
    // fixture's two editable rows and no more.
    expect(countClass(html, "f-control")).toBe(2);
    // A field with enumerated values becomes a select carrying those values,
    // with `selected` on the current one.
    const select = html.match(RECALL_POLICY_SELECT)?.[0] ?? "";
    expect(select).toContain('aria-label="召回策略"');
    expect(select).toContain('<option value="active">active</option>');
    expect(select).toContain('<option selected value="assist">assist</option>');
    expect(select).toContain(
      '<option value="high-value-auto">high-value-auto</option>',
    );
    // A free-text field becomes an input seeded with the current value.
    const input = html.match(EMBEDDING_MODEL_INPUT)?.[0] ?? "";
    expect(input).toContain('type="text"');
    expect(input).toContain('value="auto"');
    expect(input).toContain('aria-label="嵌入模型"');
  });

  it("leaves pinned and read-only fields as plain text", () => {
    // `limit` is pinned by XPI_MEMO_LIMIT and `dataDir` is never written by
    // the panel, so neither may offer a control.
    expect(html).not.toMatch(CONTROL_FOR_LIMIT);
    expect(html).not.toMatch(CONTROL_FOR_DATA_DIR);
    expect(html).toContain('<span class="f-value">auto</span>');
  });

  it("renders one tab per configured group", () => {
    expect(countClass(html, "tabs-trigger")).toBe(SETTINGS_GROUPS.length);
    expect(countText(html, 'role="tab"')).toBe(SETTINGS_GROUPS.length);
    expect(countText(html, 'role="tabpanel"')).toBe(SETTINGS_GROUPS.length);
    expect(SETTINGS_GROUPS).toHaveLength(7);
  });

  it("wires each tab to its own panel", () => {
    // The pair of references is the whole reason the panels carry ids: a
    // trigger that opened a panel it does not control would leave the strip
    // pointing at the wrong group.
    for (const group of SETTINGS_GROUPS) {
      const trigger = GROUP_SHORT[group.id];
      const panel = SETTINGS_PANEL_SHORT[group.id];
      expect(html, trigger).toContain(`id="${trigger}"`);
      expect(html, trigger).toContain(`aria-controls="${panel}"`);
      expect(html, panel).toContain(`aria-labelledby="${trigger}"`);
    }
  });

  it("opens exactly the first tab", () => {
    expect(countText(html, 'aria-selected="true"')).toBe(1);
    // The other six panels start hidden. The attribute order inside a panel is
    // the element builder's business, so this matches the pair of attributes
    // rather than an exact tag.
    expect(html.match(HIDDEN_TAB_PANEL_PATTERN)?.length ?? 0).toBe(
      SETTINGS_GROUPS.length - 1,
    );
    // Roving tabindex: the strip is one tab stop, the arrows move inside it.
    expect(countText(html, 'tabindex="-1"')).toBe(SETTINGS_GROUPS.length - 1);
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
    principle: "default" as const,
    summary,
    theme: "dark" as const,
  };

  it("header carries the badge, both toggles, and the principle picker", () => {
    const html = renderHeader(input);

    expect(html).toContain('id="P0-1-B1"');
    expect(html).toContain('id="P0-1-W1"');
    expect(html).toContain('id="P0-1-W2"');
    expect(html).toContain('id="P0-1-W3"');
    expect(html).toContain("运行中");
  });

  it("the principle picker offers both principles and marks the current one", () => {
    const html = renderHeader(input);
    const picker = html.slice(html.indexOf("<select"), html.indexOf("</select>"));

    // The labels are literal theme names, so they read the same in either
    // language; only the picker's accessible name is copy.
    expect(picker).toContain('aria-label="主题原则"');
    expect(picker).toContain('<option selected value="default">Default</option>');
    expect(picker).toContain('<option value="atlas">Atlas</option>');

    const atlas = renderHeader({
      ...input,
      principle: "atlas",
    });
    expect(atlas).toContain('<option selected value="atlas">Atlas</option>');
    expect(atlas).not.toContain('<option selected value="default">');
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
