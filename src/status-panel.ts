/**
 * Floating status panel supporting dual modes:
 * 1. Native Glimpse 800x600 floating window (GUI/Webview with rich styling) when available.
 * 2. Center-anchored, single-component Pi TUI modal overlay fallback with truncateToWidth safety.
 *
 * Visual Contract:
 * - Glimpse: Exactly 800x600 window with rich dark theme, KPI cards, and structured JSON view.
 * - Pi TUI Fallback: Single Text container, center-anchored (anchor: 'center'), width clamped to 78 cols,
 *   protected margins so it NEVER clips into input.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Preferred panel width in columns; minWidth clamps it on narrow terminals. */
export const PANEL_WIDTH = 78;
export const MIN_WIDTH = 40;
/** Rendered panel height in rows; maxHeight "70%" clamps it on short terminals. */
export const PANEL_HEIGHT = 20;
/** Non-JSON chrome rows: top edge, header, blank, 2 KV rows, blank, divider, hint, bottom edge, footer. */
export const CHROME_ROWS = 9;
/** JSON body rows inside the panel. */
export const BODY_ROWS = PANEL_HEIGHT - CHROME_ROWS;
const SCROLL_STEP = 5;

export interface GlimpsePromptOptions {
  height: number;
  title: string;
  width: number;
}

export type GlimpsePromptFn = (
  html: string,
  options: GlimpsePromptOptions,
) => Promise<unknown>;

function humanBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StatusSummary {
  backend: string;
  disk: string;
  global: number | null;
  paused: boolean;
  pending: number;
  project: number | null;
  projectLabel: string | null;
  today: number;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function summarize(json: string): StatusSummary {
  try {
    const parsed = JSON.parse(json) as {
      counts?: {
        global?: number | null;
        project?: number | null;
      };
      currentProject?: {
        label?: string;
      } | null;
      diskBytes?: number | null;
      paused?: boolean;
      pendingCandidates?: number;
      search?: {
        active?: string | null;
      };
      todayStored?: number;
    };
    return {
      backend: parsed.search?.active ?? "auto",
      disk: humanBytes(parsed.diskBytes),
      global: parsed.counts?.global ?? null,
      paused: parsed.paused ?? false,
      pending: parsed.pendingCandidates ?? 0,
      project: parsed.counts?.project ?? null,
      projectLabel: parsed.currentProject?.label ?? null,
      today: parsed.todayStored ?? 0,
    };
  } catch {
    return {
      backend: "auto",
      disk: "—",
      global: null,
      paused: false,
      pending: 0,
      project: null,
      projectLabel: null,
      today: 0,
    };
  }
}

export function padRow(text: string, width: number): string {
  return truncateToWidth(text, width, "", true);
}

export interface RenderTheme {
  bold(text: string): string;
  fg(name: string, text: string): string;
}

/** Pure rendering function for unit testing and deterministic snapshotting. */
export function renderStatusPanelLines(
  lines: string[],
  summary: StatusSummary,
  scroll: number,
  width: number,
  theme: RenderTheme,
): string[] {
  const inner = Math.max(width - 2, 1);
  const frame = (content: string): string =>
    `${theme.fg("borderAccent", "│")}${padRow(content, inner)}${theme.fg("borderAccent", "│")}`;

  const dot = theme.fg(
    summary.paused ? "muted" : "accent",
    summary.paused ? "○ paused" : "● on",
  );
  const scope = summary.projectLabel ?? "global";
  const project = summary.project === null ? "—" : String(summary.project);
  const global = summary.global === null ? "—" : String(summary.global);

  // Two-column structured Key-Value layout
  const colWidth = Math.floor((inner - 4) / 2);
  const kvRow1Left = `Scope: ${scope} (project)`.slice(0, colWidth);
  const kvRow1Right = `Backend: ${summary.backend}`.slice(0, colWidth);
  const row1 = `  ${kvRow1Left.padEnd(colWidth)}  ${kvRow1Right}`;

  const kvRow2Left = `Records: ${project} proj / ${global} glob`.slice(0, colWidth);
  const kvRow2Right = `Disk/Today: ${summary.disk} / +${summary.today}`.slice(0, colWidth);
  const row2 = `  ${kvRow2Left.padEnd(colWidth)}  ${kvRow2Right}`;

  const divider = theme.fg("dim", `├${"─".repeat(inner)}┤`);
  const headerTitle = theme.fg("accent", theme.bold("XpiMemo Status"));
  const headerContent = ` ${headerTitle}   ${dot} `;

  const rows: string[] = [];
  rows.push(theme.fg("borderAccent", `╭${"─".repeat(inner)}╮`));
  rows.push(frame(headerContent));
  rows.push(frame(""));
  rows.push(frame(theme.fg("muted", row1)));
  rows.push(frame(theme.fg("muted", row2)));
  rows.push(frame(""));
  rows.push(divider);

  const start = Math.max(0, scroll);
  const totalDetails = lines.length;
  const hint = `Detailed Snapshot (lines ${start + 1}-${Math.min(start + BODY_ROWS, totalDetails)} of ${totalDetails}):`;
  rows.push(frame(theme.fg("dim", `  ${hint}`)));

  for (let i = 0; i < BODY_ROWS; i++) {
    const raw = lines[start + i] ?? "";
    rows.push(frame(theme.fg("muted", `  ${raw}`)));
  }

  rows.push(theme.fg("borderAccent", `╰${"─".repeat(inner)}╯`));
  rows.push(frame(theme.fg("dim", "↑/↓ scroll · Esc / Enter close")));
  return rows;
}

/** Generate standard 800x600 Glimpse HTML view with escaped parameters. */
export function buildGlimpseHtml(json: string, summary: StatusSummary): string {
  const escapedJson = escapeHtml(json);
  const escapedScope = escapeHtml(summary.projectLabel ?? "global");
  const escapedBackend = escapeHtml(summary.backend);
  const escapedDisk = escapeHtml(summary.disk);
  const projCount = summary.project === null ? "—" : String(summary.project);
  const globCount = summary.global === null ? "—" : String(summary.global);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid #30363d;
      padding-bottom: 14px;
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      color: #58a6ff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 12px;
      background: ${summary.paused ? "#30363d" : "#1f3526"};
      color: ${summary.paused ? "#8b949e" : "#3fb950"};
      border: 1px solid ${summary.paused ? "#484f58" : "#238636"};
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px;
    }
    .card-label {
      font-size: 11px;
      color: #8b949e;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .card-value {
      font-size: 15px;
      font-weight: 600;
      color: #f0f6fc;
    }
    .json-header {
      font-size: 12px;
      color: #8b949e;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .json-box {
      flex: 1;
      background: #090d13;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
      color: #79c0ff;
    }
    .footer {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #8b949e;
      font-size: 12px;
    }
    .btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 6px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    .btn:hover { background: #30363d; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>XpiMemo T1 Status Inspector</span>
      <span class="badge">${summary.paused ? "○ PAUSED" : "● RUNNING"}</span>
    </div>
    <div style="font-size: 12px; color: #8b949e;">800 × 600 Native Window</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Active Scope</div>
      <div class="card-value">${escapedScope}</div>
    </div>
    <div class="card">
      <div class="card-label">Records (Proj/Glob)</div>
      <div class="card-value">${projCount} / ${globCount}</div>
    </div>
    <div class="card">
      <div class="card-label">Search Backend</div>
      <div class="card-value" style="color:#7ee787;">${escapedBackend}</div>
    </div>
    <div class="card">
      <div class="card-label">Disk / Today</div>
      <div class="card-value" style="color:#d2a8ff;">${escapedDisk} / +${summary.today}</div>
    </div>
  </div>

  <div class="json-header">
    <span>DIAGNOSTIC STATUS PAYLOAD</span>
    <span>JSON (Formatted)</span>
  </div>
  <pre class="json-box">${escapedJson}</pre>

  <div class="footer">
    <span>Press <b>Esc</b> or click Close to exit</span>
    <button class="btn" onclick="window.glimpse.close()">Close Window</button>
  </div>

  <script>
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        window.glimpse.close();
      }
    });
  </script>
</body>
</html>`;
}

/** Dynamically resolve Glimpse prompt function across candidate install roots. */
export async function resolveGlimpsePrompt(): Promise<GlimpsePromptFn | null> {
  // First try standard module resolution
  try {
    const req = createRequire(import.meta.url);
    const resolved = req.resolve("glimpseui");
    const mod = (await import(resolved)) as { prompt?: GlimpsePromptFn };
    if (typeof mod.prompt === "function") {
      return mod.prompt;
    }
  } catch {
    // Fall back to well-known Pi tool paths
  }

  const candidatePaths = [
    join(homedir(), ".pi", "agent", "npm", "node_modules", "glimpseui", "src", "glimpse.mjs"),
    join(homedir(), ".pi", "agent", "node_modules", "glimpseui", "src", "glimpse.mjs"),
  ];

  for (const p of candidatePaths) {
    try {
      if (!existsSync(p)) {
        continue;
      }
      const mod = (await import(p)) as { prompt?: GlimpsePromptFn };
      if (typeof mod.prompt === "function") {
        return mod.prompt;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

export async function openStatusPanel(
  ctx: ExtensionContext,
  json: string,
  glimpsePromptOverride?: GlimpsePromptFn | null,
): Promise<void> {
  const summary = summarize(json);
  const promptFn = glimpsePromptOverride !== undefined
    ? glimpsePromptOverride
    : await resolveGlimpsePrompt();

  if (promptFn) {
    try {
      const html = buildGlimpseHtml(json, summary);
      await promptFn(html, {
        height: 600,
        title: "XpiMemo Status Inspector",
        width: 800,
      });
      return;
    } catch {
      // Graceful fallback to TUI
    }
  }

  // Fallback to center-anchored, single-component TUI modal
  await ctx.ui.custom(
    (tui, theme, _keybindings, done) => {
      const lines = json.split("\n");
      const panelText = new Text("", 0, 0);

      // First visible JSON line index; clamped on every render.
      let scroll = 0;

      return {
        handleInput(data: string): void {
          if (matchesKey(data, "escape") || matchesKey(data, "enter")) {
            done(undefined);
            return;
          }
          if (matchesKey(data, "up")) scroll -= 1;
          else if (matchesKey(data, "down")) scroll += 1;
          else if (matchesKey(data, "pageUp")) scroll -= SCROLL_STEP;
          else if (matchesKey(data, "pageDown")) scroll += SCROLL_STEP;
          else return;
          tui.requestRender();
        },
        invalidate(): void {
          panelText.invalidate();
        },
        render(width: number): string[] {
          scroll = Math.min(scroll, Math.max(lines.length - BODY_ROWS, 0));
          scroll = Math.max(scroll, 0);

          const rows = renderStatusPanelLines(lines, summary, scroll, width, theme);
          panelText.setText(rows.join("\n"));
          return rows;
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        margin: { bottom: 4, left: 2, right: 2, top: 2 },
        maxHeight: "70%",
        minWidth: MIN_WIDTH,
        width: PANEL_WIDTH,
      },
    },
  );
}
export { visibleWidth };
