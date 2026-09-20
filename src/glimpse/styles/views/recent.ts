/**
 * Recent view: the six-column activity table.
 *
 * Column widths come from the 572px inner width: symbol 40 + action 100 +
 * kind 80 + bank 1fr + status 120 + time 80.
 */
export const RECENT_VIEW_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   最近页：五列 grid 表格
   内宽 572 = 符号 40 + 动作 96 + 详情 1fr(268) + 状态 96 + 时间 72
   类型与库两列已并进详情列：审计日志按 action 写不同的 metadata，
   最高频的 feedback 两者都没有，独立成列只会得到一整列「—」。
   ═══════════════════════════════════════════════════════════════ */
/* 页首说明：静态文案，一行，跟随语言切换重绘。 */
.view-hint {
  flex: none;
  margin: 0 0 var(--space-3);
  font-size: 12px;
  color: var(--muted-foreground);
}

.table-wrap {
  display: flex;
  flex-direction: column;
  /* flex:1 而不是 height:100%：页首说明占了高度后，100% 会连说明一起算进溢出 */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.tr {
  display: grid;
  grid-template-columns: 40px 96px minmax(120px, 1fr) 96px 72px;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
}

/* 数据行悬停整行淡色背景；表头行不参与 */
.tr:not(.tr-head):hover {
  background: var(--muted);
}

.tr-head {
  padding-bottom: var(--space-2);
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 表头下的分隔线：跨满六列，占一整行 */
.tr-divider {
  grid-template-columns: 1fr;
  padding: 0 var(--space-3);
}

.tr-divider span {
  display: block;
  height: 1px;
  background: var(--border);
}

.td {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-symbol {
  font-family: var(--font-mono);
  text-align: center;
}

.td-mono {
  font-family: var(--font-mono);
  font-size: 13px;
}

.td-muted {
  color: var(--muted-foreground);
}
`;
