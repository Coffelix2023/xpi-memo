/**
 * Status view: KPI cards, the occupancy meter, the sparkline, and the
 * scrollable JSON snapshot.
 *
 * The snapshot keeps its own scrolling (matching the shipped
 * the retired `buildGlimpseHtml`), so the JSON body is never truncated.
 */
export const STATUS_VIEW_STYLES = `
/* 卡片 */
.kpi-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.kpi-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.kpi-value {
  font-size: 20px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--foreground);
}
/* ═══════════════════════════════════════════════════════════════
   状态页：4 张 KPI 卡 + 占用条 + sparkline + 可滚动 JSON 区
   内宽 572 = 4 × 137 + 3 × 8 间隔
   ═══════════════════════════════════════════════════════════════ */
.kpi-grid {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, 137px);
  gap: var(--space-2);
  height: 88px;
}

.meter-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 20px;
}

.meter-label {
  flex: none;
  width: 64px;
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 占用条：真像素宽度，不是字符画 */
.meter-track {
  flex: none;
  display: flex;
  gap: 2px;
  width: 240px;
}

.meter-seg {
  flex: 1;
  height: 10px;
  background: var(--muted);
  border-radius: 2px;
}

.meter-seg.is-on {
  background: var(--primary);
}

.meter-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--foreground);
}

/* sparkline：8 级柱，柱高按值归一化 */
.spark {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 20px;
}

.spark-bar {
  width: 10px;
  background: var(--chart-1);
  border-radius: 2px 2px 0 0;
}

.status-meta {
  flex: none;
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.snapshot-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--muted-foreground);
}

.snapshot-head::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}
/* 原始 JSON 区：保留可滚动（对齐已退役的 buildGlimpseHtml），等宽是功能需求 */
.snapshot {
  flex: 1;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--foreground);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  min-height: 0;
  overflow: auto;
  white-space: pre;
}
`;
