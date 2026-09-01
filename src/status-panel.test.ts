import { describe, expect, it } from "vitest";
import {
  PANEL_WIDTH,
  padRow,
  renderStatusPanelLines,
  summarize,
} from "./status-panel.ts";

const mockTheme = {
  bold: (t: string) => `**${t}**`,
  fg: (_name: string, t: string) => t,
};

describe("status-panel TUI rendering", () => {
  it("summarizes structured status correctly", () => {
    const rawJson = JSON.stringify({
      counts: { global: 128, project: 38 },
      currentProject: { label: "xpi-memo" },
      diskBytes: 430592,
      paused: false,
      pendingCandidates: 0,
      search: { active: "ripgrep" },
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

  it("pads rows safely without exceeding boundaries", () => {
    expect(padRow("hello", 10)).toBe("hello     ");
    expect(padRow("super long line exceeding width", 10)).toBe("super long");
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
    expect(lines[4]).toContain("Records: 38 (proj) / 128 (glob)");
    expect(lines[4]).toContain("Disk/Today: 420.5 KB / +14");

    // Verify divider and footer
    expect(lines[6]).toContain("├");
    expect(lines[6]).toContain("┤");
    expect(lines[lines.length - 2]).toContain("╰");
    expect(lines[lines.length - 2]).toContain("╯");
    expect(lines[lines.length - 1]).toContain("Esc / Enter close");
  });
});
