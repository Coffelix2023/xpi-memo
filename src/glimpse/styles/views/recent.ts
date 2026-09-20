/**
 * Recent view: the six-column activity table.
 *
 * Column widths come from the 572px inner width: symbol 40 + action 100 +
 * kind 80 + bank 1fr + status 120 + time 80.
 */
export const RECENT_VIEW_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   最近页：六列 grid 表格
   内宽 572 = 符号 40 + 动作 100 + 类型 80 + 库 1fr(152) + 状态 120 + 时间 80
   ═══════════════════════════════════════════════════════════════ */
.table-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.tr {
  display: grid;
  grid-template-columns: 40px 100px 80px minmax(80px, 1fr) 120px 80px;
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
