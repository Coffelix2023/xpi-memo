/**
 * Settings view: five accordion groups plus a pinned detail panel.
 *
 * The group list scrolls on its own; the detail panel is fixed so it does
 * not scroll away with the list.
 */
export const SETTINGS_VIEW_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   设置页：6 组手风琴 + 底部详情面板
   内容区内高 452（500 − 48 padding）= 列表区（flex:1）+ 16 间隔 + 详情（≥72）
   详情是 min-height 而不是 height：字段说明是整句中文，写死高度就是写死截断。
   ═══════════════════════════════════════════════════════════════ */
.settings-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.settings-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.group {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.group-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 44px;
  padding: 0 var(--space-4);
  background: var(--muted);
  border: 0;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.group-head:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.group-arrow {
  flex: none;
  width: 12px;
  color: var(--primary);
  font-family: var(--font-mono);
}

.group-name {
  flex: 1;
  font-weight: 600;
  color: var(--foreground);
}

.group-count {
  flex: none;
  font-size: 12px;
  color: var(--muted-foreground);
}

.group-body {
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
