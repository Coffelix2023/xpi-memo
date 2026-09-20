/**
 * Scale, reset, and the fixed 800x600 window shell.
 *
 * The scale variables are the prototype's own derivations: `--space-*` is an
 * 8pt rhythm, and the `--radius-*` steps come from THEMES.md's `--radius`.
 * No color is introduced here — colors are `tokens.ts`.
 */
export const BASE_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   几何与刻度：窗口固定 800×600（TUI-DESIGN.md §1 的尺寸契约）。
   纵向 56 + 500 + 44 = 600；横向 180 + 620 = 800。
   间距走 8pt 节奏；圆角由 --radius 派生，与 shadcn 一致。
   ═══════════════════════════════════════════════════════════════ */
:root {
  --win-w: 800px;
  --win-h: 600px;
  --h-header: 56px;
  --h-body: 500px;
  --h-footer: 44px;
  --w-sidebar: 180px;
  --w-content: 620px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* ---------- reset ---------- */
*,
*::before,
*::after {
  box-sizing: border-box;
}

/* hidden 属性必须能盖住显式 display（.pane-split / .table-wrap 都是 flex）。
   UA 的 [hidden]{display:none} 与类选择器同权重，作者样式在后就会赢。 */
[hidden] {
  display: none !important;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

button {
  font: inherit;
  color: inherit;
}

/* ---------- 路由：非活动页面容器隐藏（SPA 契约） ---------- */
.tabpage {
  display: none;
}

.tabpage.is-active {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ═══════════════════════════════════════════════════════════════
   窗口外壳：固定 800×600，三段纵向布局
   ═══════════════════════════════════════════════════════════════ */
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  min-height: 100vh;
  padding: var(--space-8) var(--space-4);
}

.window {
  flex: none;
  display: flex;
  flex-direction: column;
  width: var(--win-w);
  height: var(--win-h);
  overflow: hidden;
  background: var(--card);
  color: var(--card-foreground);
  border-radius: var(--radius-xl);
  /*
   * The 1px edge is an inset shadow, not a border. Under border-box a border
   * eats into the content box, and the inner sections are laid out for the
   * full 800x600 (56+500+44 vertically, 180+620 horizontally) — so a border
   * leaves them 1px over on every side, silently clipped by overflow: hidden.
   * An inset shadow draws the same line without consuming layout space.
   *
   * No backticks in this file: the CSS is a template literal, so one would
   * terminate it. styles.test.ts asserts that.
   */
  box-shadow:
    inset 0 0 0 1px var(--border), var(--shadow-lg);
}

.app-body {
  display: flex;
  flex: none;
  height: var(--h-body);
  overflow: hidden;
}

.app-content {
  flex: none;
  width: var(--w-content);
  height: var(--h-body);
  padding: var(--space-6);
  overflow: hidden;
}
`;
