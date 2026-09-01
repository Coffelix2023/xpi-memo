/**
 * Floating overlay panel showing a structured HUD summary plus the indented JSON status
 * (`formatStatusJson` output). TUI-only; Esc/Enter closes.
 *
 * Geometry: fixed-width (84 cols) docked to the bottom-right. `maxHeight`
 * percent and `minWidth` clamp it so a small terminal never overflows.
 * Adheres to TUI-DESIGN.md visual contract.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, matchesKey, Text } from "@earendil-works/pi-tui";

/** Preferred panel width in columns; minWidth clamps it on narrow terminals. */
export const PANEL_WIDTH = 84;
export const MIN_WIDTH = 40;
/** Rendered panel height in rows; maxHeight "75%" clamps it on short terminals. */
export const PANEL_HEIGHT = 22;
/** Non-JSON chrome rows: top edge, header, blank, 2 KV rows, blank, divider, hint, bottom edge, footer. */
export const CHROME_ROWS = 9;
/** JSON body rows inside the panel. */
export const BODY_ROWS = PANEL_HEIGHT - CHROME_ROWS;
const SCROLL_STEP = 5;

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

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes filtering
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

export function padRow(text: string, width: number): string {
  const visibleLen = text.length;
  if (visibleLen > width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - visibleLen);
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

  const kvRow2Left = `Records: ${project} (proj) / ${global} (glob)`.slice(0, colWidth);
  const kvRow2Right = `Disk/Today: ${summary.disk} / +${summary.today}`.slice(0, colWidth);
  const row2 = `  ${kvRow2Left.padEnd(colWidth)}  ${kvRow2Right}`;

  const divider = theme.fg("dim", `├${"─".repeat(inner)}┤`);
  const headerTitle = theme.fg("accent", theme.bold("XpiMemo Status"));
  const titlePlainLen = "**XpiMemo Status**".length; // mockTheme uses **bold**
  const dotPlainLen = summary.paused ? "○ paused".length : "● on".length;
  const innerSpaces = Math.max(inner - 2 - titlePlainLen - dotPlainLen, 1);
  const headerContent = ` ${headerTitle}${" ".repeat(innerSpaces)}${dot} `;

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
    rows.push(frame(theme.fg("muted", `  ${raw.slice(0, Math.max(inner - 4, 1))}`)));
  }

  rows.push(theme.fg("borderAccent", `╰${"─".repeat(inner)}╯`));
  rows.push(frame(theme.fg("dim", "↑/↓ scroll · Esc / Enter close")));
  return rows;
}

export async function openStatusPanel(
  ctx: ExtensionContext,
  json: string,
): Promise<void> {
  await ctx.ui.custom(
    (tui, theme, _keybindings, done) => {
      const container = new Container();
      const lines = json.split("\n");
      const summary = summarize(json);
      const header = new Text("", 1, 0);
      const body = new Text("", 0, 0);
      const footer = new Text("", 1, 0);
      container.addChild(header);
      container.addChild(body);
      container.addChild(footer);

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
          container.invalidate();
        },
        render(width: number): string[] {
          scroll = Math.min(scroll, Math.max(lines.length - BODY_ROWS, 0));
          scroll = Math.max(scroll, 0);

          const rows = renderStatusPanelLines(lines, summary, scroll, width, theme);

          header.setText(rows.slice(0, 1).join("\n"));
          body.setText(rows.slice(1, -1).join("\n"));
          footer.setText(rows.slice(-1).join("\n"));
          return rows;
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "bottom-right",
        margin: 2,
        maxHeight: "75%",
        minWidth: MIN_WIDTH,
        offsetX: -1,
        offsetY: -1,
        width: PANEL_WIDTH,
      },
    },
  );
}
