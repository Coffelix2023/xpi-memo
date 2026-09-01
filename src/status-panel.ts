/**
 * Scrollable overlay panel showing the indented JSON status
 * (`formatStatusJson` output). TUI-only; Esc/Enter closes.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, matchesKey, Text } from "@earendil-works/pi-tui";

const HEADER_ROWS = 3;
const FOOTER_ROWS = 2;
const SCROLL_STEP = 5;

export async function openStatusPanel(
  ctx: ExtensionContext,
  json: string,
): Promise<void> {
  await ctx.ui.custom((tui, theme, _keybindings, done) => {
    const container = new Container();
    const lines = json.split("\n");
    // First visible line index; clamped on every render.
    let scroll = 0;
    const header = new Text(theme.fg("accent", theme.bold("XpiMemo Status")), 1, 0);
    const body = new Text("", 0, 0);
    const footer = new Text(theme.fg("dim", "↑/↓ scroll · Esc close"), 1, 0);
    container.addChild(header);
    container.addChild(body);
    container.addChild(footer);

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
        const bodyRows = Math.max(tui.terminal.rows - HEADER_ROWS - FOOTER_ROWS, 1);
        scroll = Math.min(scroll, Math.max(lines.length - bodyRows, 0));
        scroll = Math.max(scroll, 0);
        body.setText(
          lines
            .slice(scroll, scroll + bodyRows)
            .map((line) => line.slice(0, Math.max(width - 2, 1)))
            .join("\n"),
        );
        return container.render(width);
      },
    };
  });
}
