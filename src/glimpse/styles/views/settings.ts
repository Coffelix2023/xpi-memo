/**
 * Settings view: five accordion groups plus a pinned detail panel.
 *
 * The group list scrolls on its own; the detail panel is fixed so it does
 * not scroll away with the list.
 */
export const SETTINGS_VIEW_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   设置页：5 组手风琴 + 底部固定详情面板
   内容区内高 452（500 − 48 padding）= 列表区 + 16 间隔 + 详情 72
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
  height: 72px;
  padding: var(--space-3) var(--space-4);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.detail-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
