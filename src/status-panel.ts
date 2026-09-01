/**
 * Floating overlay panel showing a KPI summary plus the indented JSON status
 * (`formatStatusJson` output). TUI-only; Esc/Enter closes.
 *
 * Geometry: fixed-width (84 cols) docked to the bottom-right. `maxHeight`
 * percent and `minWidth` clamp it so a small terminal never overflows.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, matchesKey, Text } from "@earendil-works/pi-tui";

/** Preferred panel width in columns; minWidth clamps it on narrow terminals. */
const PANEL_WIDTH = 84;
const MIN_WIDTH = 40;
/** Rendered panel height in rows; maxHeight "75%" clamps it on short terminals. */
const PANEL_HEIGHT = 22;
/** Non-JSON chrome rows: top edge, title, KPI, divider, bottom edge, footer. */
const CHROME_ROWS = 6;
/** JSON body rows inside the panel. */
const BODY_ROWS = PANEL_HEIGHT - CHROME_ROWS;
const SCROLL_STEP = 5;

function humanBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StatusSummary {
  disk: string;
  global: number | null;
  paused: boolean;
  pending: number;
  project: number | null;
  projectLabel: string | null;
  today: number;
}

function summarize(json: string): StatusSummary {
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
      todayStored?: number;
    };
    return {
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

function padRow(text: string, width: number): string {
  const clipped = text.length > width ? text.slice(0, width) : text;
  return clipped.padEnd(width);
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
          const inner = Math.max(width - 2, 1);
          const frame = (content: string): string =>
            `${theme.fg("borderAccent", "│")}${padRow(content, inner)}${theme.fg("borderAccent", "│")}`;

          scroll = Math.min(scroll, Math.max(lines.length - BODY_ROWS, 0));
          scroll = Math.max(scroll, 0);

          const dot = theme.fg(
            summary.paused ? "muted" : "accent",
            summary.paused ? "○ off" : "● on",
          );
          const scope = summary.projectLabel ?? "global";
          const project = summary.project === null ? "—" : String(summary.project);
          const global = summary.global === null ? "—" : String(summary.global);
          const kpi =
            `${scope} · project ${project} · global ${global}` +
            ` · today ${summary.today} · disk ${summary.disk}` +
            ` · pending ${summary.pending}`;
          const divider = theme.fg("dim", "─".repeat(inner));

          const rows: string[] = [];
          rows.push(theme.fg("borderAccent", `╭${"─".repeat(inner)}╮`));
          rows.push(
            frame(`${theme.fg("accent", theme.bold("XpiMemo Status"))} ${dot}`),
          );
          rows.push(frame(theme.fg("muted", kpi)));
          rows.push(frame(divider));
          const start = Math.max(0, scroll);
          for (let i = 0; i < BODY_ROWS; i++) {
            const raw = lines[start + i] ?? "";
            rows.push(frame(theme.fg("muted", raw.slice(0, inner))));
          }
          rows.push(theme.fg("borderAccent", `╰${"─".repeat(inner)}╯`));
          rows.push(frame(theme.fg("dim", "↑/↓ scroll · Esc close")));

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
