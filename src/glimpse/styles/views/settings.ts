/**
 * Settings view: a top tab strip over one scrolling field panel, plus the pinned
 * detail panel.
 *
 * The strip is the shadcn Tabs anatomy (`tabs-list` / `tabs-trigger` /
 * `tabs-content`), so the seven groups read as one row of top navigation instead
 * of a stack of collapsibles: a group's fields are one click away, and only the
 * selected panel scrolls.
 */
export const SETTINGS_VIEW_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   设置页：顶部 tabs 条 + 一个滚动字段区 + 底部详情面板
   内容区内高 = tabs 条（定尺）+ 面板区（flex:1）+ 间隔 + 详情（≥72）
   条文定尺、只有面板滚动：切组时当前标签不会被滚走。
   详情是 min-height 而不是 height：字段说明是整句中文，写死高度就是写死截断。
   ═══════════════════════════════════════════════════════════════ */
.settings-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
}

/* Tabs 条：muted 底 + 内边距，选中项提亮成卡片色（shadcn 的 tabs-list） */
.tabs-list {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.tabs-trigger {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 30px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-md);
  background: none;
  color: var(--muted-foreground);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.tabs-trigger:hover {
  color: var(--foreground);
}

/* 选中态读 aria-selected 而不是 class：屏幕阅读器与视觉读同一个事实 */
.tabs-trigger[aria-selected="true"] {
  background: var(--card);
  color: var(--foreground);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}

.tab-count {
  flex: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 只有选中的面板参与滚动，其余由 hidden 属性摘掉 */
.settings-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.tabs-content {
  display: flex;
  flex-direction: column;
}

/* 字段行三列：标签 / 当前值 / 备注 */
.field-row {
  display: grid;
  grid-template-columns: 180px 180px 1fr;
  align-items: center;
  gap: var(--space-3);
  height: 36px;
  padding: 0 var(--space-4);
  border-top: 1px solid var(--border);
  cursor: pointer;
}

.field-row:hover {
  background: var(--accent);
}

.field-row.is-focused {
  background: var(--accent);
  color: var(--accent-foreground);
}

.f-label {
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.f-value {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.f-note {
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 行内编辑器：原生 select / input。聚焦后由系统弹出选项菜单（左键或空格），
 * 所以这里只管别溢出 180px 的值列、别抢焦点圈。
 */
.f-control {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 var(--space-2);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  background: var(--card);
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.f-control:enabled:hover,
.f-control:focus-visible {
  border-color: var(--ring);
  outline: none;
}

/* 被环境变量钉住的行：值可见、不可改，光标不再装作能点。 */
.f-control:disabled {
  color: var(--muted-foreground);
  cursor: default;
}

.field-row.is-locked .f-label,
.field-row.is-locked .f-value {
  color: var(--muted-foreground);
}

.field-row.is-action .f-value {
  color: var(--primary);
}

/* 底部详情面板：固定高度，组头行不留空（继承 TUI 版的修正） */
.settings-detail {
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
  min-height: 72px;
  padding: var(--space-3) var(--space-4);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.detail-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
  /* 换行而不是省略号：这条文案的作用就是解释字段，截断掉等于没有解释。
     anywhere 而不是 break-word：字段选项里存在无空格的长串（模型 id、URL）。 */
  overflow-wrap: anywhere;
}
`;
