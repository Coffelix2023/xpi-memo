/**
 * Scale, reset, and the window shell.
 *
 * The shell fills whatever the host window is. Glimpse opens a resizable native
 * window — `WINDOW_WIDTH`/`WINDOW_HEIGHT` in `glimpse/window.ts` set the launch
 * size — so a fixed inner 800x600 left every enlarged pixel empty: the content
 * stayed put in the corner while the window grew around it. Only the chrome
 * (header, footer, sidebar) keeps a fixed size now; the body and the content
 * area take the rest.
 *
 * The scale variables are the prototype's own derivations: `--space-*` is an
 * 8pt rhythm, and the `--radius-*` steps come from THEMES.md's `--radius`.
 * No color is introduced here — colors are `tokens.ts`.
 */
export const BASE_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   几何与刻度：外壳铺满宿主窗口。TUI-DESIGN.md §1 的尺寸契约只管**启动**
   尺寸，由 glimpse/window.ts 的 WINDOW_WIDTH / WINDOW_HEIGHT 决定。
   只有 header / footer / 侧栏是定尺，剩余高度归 .app-body。
   间距走 8pt 节奏；圆角由 --radius 派生，与 shadcn 一致。
   ═══════════════════════════════════════════════════════════════ */
:root {
  --h-header: 56px;
  --h-footer: 44px;
  --w-sidebar: 180px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  /* Atlas 的 --radius 是 0rem，减出来的负值会被当作非法值丢掉；用 max() 明说
     「不小于 0」，直角是声明出来的，不是靠浏览器丢弃非法值得到的。 */
  --radius-sm: max(0px, calc(var(--radius) - 4px));
  --radius-md: max(0px, calc(var(--radius) - 2px));
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
  height: 100%;
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
   窗口外壳：铺满宿主窗口，三段纵向布局
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
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--card);
  color: var(--card-foreground);
  /*
   * The 1px edge is an inset shadow, not a border. Under border-box a border
   * eats into the content box, and the sections are laid out to the window's
   * full width — so a border would push them 1px over on every side, silently
   * clipped by overflow: hidden. An inset shadow draws the same line without
   * consuming layout space.
   *
   * No backticks in this file: the CSS is a template literal, so one would
   * terminate it. styles.test.ts asserts that.
   */
  box-shadow: inset 0 0 0 1px var(--border);
}

.app-body {
  display: flex;
  /* 定尺 header + footer 之外的剩余高度全归这里；min-height:0 让子项真的能缩，
     否则 flex 子项的最小内容高度会顶破外壳。 */
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.app-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: var(--space-6);
  overflow: hidden;
}
`;
