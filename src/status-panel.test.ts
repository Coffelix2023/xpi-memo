import { describe, expect, it, vi } from "vitest";
import {
  PANEL_WIDTH,
  buildGlimpseHtml,
  escapeHtml,
  openStatusPanel,
  padRow,
  renderStatusPanelLines,
  summarize,
  visibleWidth,
} from "./status-panel.ts";

const mockTheme = {
  bold: (t: string) => `**${t}**`,
  fg: (_name: string, t: string) => t,
};

describe("status-panel TUI rendering", () => {
  it("escapes HTML strings safely", () => {
    expect(escapeHtml('<script>alert("xss")&</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&amp;&lt;/script&gt;",
    );
  });

  it("summarizes structured status correctly", () => {
    const rawJson = JSON.stringify({
      counts: {
        global: 128,
        project: 38,
      },
      currentProject: {
        label: "xpi-memo",
      },
      diskBytes: 430592,
      paused: false,
      pendingCandidates: 0,
      search: {
        active: "ripgrep",
      },
      todayStored: 14,
    });
    const summary = summarize(rawJson);
    expect(summary.projectLabel).toBe("xpi-memo");
    expect(summary.project).toBe(38);
    expect(summary.global).toBe(128);
    expect(summary.backend).toBe("ripgrep");
    expect(summary.disk).toBe("420.5 KB");
    expect(summary.today).toBe(14);
    expect(summary.paused).toBe(false);
  });

  it("handles fallback and invalid json safely", () => {
    const summary = summarize("not-valid-json");
    expect(summary.disk).toBe("—");
    expect(summary.project).toBeNull();
    expect(summary.backend).toBe("auto");
  });

  it("pads rows safely using truncateToWidth without exceeding boundaries", () => {
    expect(padRow("hello", 10)).toBe("hello     ");
    expect(padRow("super long line exceeding width", 10)).toContain("super long");
  });

  it("renders structured panel adhering to TUI-DESIGN.md layout contract", () => {
    const summary = {
      backend: "ripgrep",
      disk: "420.5 KB",
      global: 128,
      paused: false,
      pending: 0,
      project: 38,
      projectLabel: "xpi-memo",
      today: 14,
    };
    const sampleDetails = [
      '{"retrieval": {"mode": "fts5"}}',
      '{"storage": {"dataDir": "~/.pi/agent/xpi-memo"}}',
    ];

    const lines = renderStatusPanelLines(
      sampleDetails,
      summary,
      0,
      PANEL_WIDTH,
      mockTheme,
    );

    // Verify header and rounded corners
    expect(lines[0]).toContain("╭");
    expect(lines[0]).toContain("╮");
    expect(lines[1]).toContain("XpiMemo Status");
    expect(lines[1]).toContain("● on");

    // Verify structured Key-Value HUD rows
    expect(lines[3]).toContain("Scope: xpi-memo (project)");
    expect(lines[3]).toContain("Backend: ripgrep");
    expect(lines[4]).toContain("Records: 38 proj / 128 glob");
    expect(lines[4]).toContain("Disk/Today: 420.5 KB / +14");

    // Verify divider and footer
    expect(lines[6]).toContain("├");
    expect(lines[6]).toContain("┤");
    expect(lines[lines.length - 2]).toContain("╰");
    expect(lines[lines.length - 2]).toContain("╯");
    expect(lines[lines.length - 1]).toContain("Esc / Enter close");
  });

  it("ensures perfectly uniform visibleWidth across all rendered lines", () => {
    const summary = {
      backend: "ripgrep",
      disk: "420.5 KB",
      global: 128,
      paused: false,
      pending: 0,
      project: 38,
      projectLabel: "xpi-memo",
      today: 14,
    };
    const sampleDetails = [
      '{"retrieval": "测试中文", "icon": "🚀"}',
      '{"storage": "very long path exceeding bounds"}',
    ];

    for (const testWidth of [40, 60, 78]) {
      const lines = renderStatusPanelLines(
        sampleDetails,
        summary,
        0,
        testWidth,
        mockTheme,
      );
      for (const line of lines) {
        expect(visibleWidth(line)).toBe(testWidth);
      }
    }
  });

  it("builds safe 800x600 Glimpse HTML view", () => {
    const rawJson = '{"scope": "<custom>"}';
    const summary = summarize(rawJson);
    const html = buildGlimpseHtml(rawJson, summary);
    expect(html).toContain("XpiMemo T1 Status Inspector");
    expect(html).toContain("800 × 600 Native Window");
    expect(html).toContain("&lt;custom&gt;");
  });

  it("uses Glimpse prompt when available with exact 800x600 dimensions", async () => {
    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      ui: {
        custom: vi.fn(),
      },
    };

    await openStatusPanel(mockCtx as never, '{"ok": true}', mockPrompt);

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(mockPrompt).toHaveBeenCalledWith(
      expect.stringContaining("XpiMemo T1 Status Inspector"),
      {
        height: 600,
        title: "XpiMemo Status Inspector",
        width: 800,
      },
    );
    expect(mockCtx.ui.custom).not.toHaveBeenCalled();
  });

  it("falls back to centered TUI overlay when Glimpse is unavailable", async () => {
    const mockCtx = {
      ui: {
        custom: vi.fn().mockResolvedValue(undefined),
      },
    };

    await openStatusPanel(mockCtx as never, '{"ok": true}', null);

    expect(mockCtx.ui.custom).toHaveBeenCalledTimes(1);
    const overlayCall = mockCtx.ui.custom.mock.calls[0];
    expect(overlayCall[1]).toEqual({
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: { bottom: 4, left: 2, right: 2, top: 2 },
        maxHeight: "70%",
        minWidth: 40,
        width: 78,
      },
    });
  });
});
