/**
 * Pending view: a 240px candidate list beside a 316px detail pane.
 *
 * 572px of inner width = 240 list + 16 gap + 316 detail.
 */
export const PENDING_VIEW_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   待审页：240px 列表 + 详情分栏
   内容区内宽 620 − 48（左右 padding 各 24）= 572，
   列表固定 240，间隔 16，详情吃剩余 316。
   ═══════════════════════════════════════════════════════════════ */
.pane-split {
  display: flex;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

.pane-left {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 240px;
  min-height: 0;
}

.pane-title {
  flex: none;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  overflow-y: auto;
}

.candidate-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--card);
  border: 1px solid var(--border);
  /* 左 3px 竖条用 border，选中时不引起布局位移 */
  border-left: 3px solid transparent;
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.candidate-item:hover {
  background: var(--accent);
}

.candidate-item.is-selected {
  background: var(--accent);
  color: var(--accent-foreground);
  border-left-color: var(--primary);
}

.cand-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.cand-kind {
  font-weight: 600;
}

.cand-age {
  font-size: 12px;
  color: var(--muted-foreground);
}

.candidate-item.is-selected .cand-age {
  color: var(--accent-foreground);
}

.pane-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  min-height: 0;
}

.detail-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  min-height: 0;
  overflow-y: auto;
}

.detail-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: var(--space-3);
  margin: 0;
}

.detail-key {
  font-size: 12px;
  color: var(--muted-foreground);
}

.detail-val {
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.action-bar {
  flex: none;
  display: flex;
  gap: var(--space-2);
}

/*
  决策回执：列表缩短只说明“发生了事”，拒绝和存入都让行消失，
  「稍后」更是一行都不动 —— 只有这行字能区分三者。
*/
.action-notice {
  align-self: center;
  font-size: 12px;
  color: var(--muted-foreground);
}

/*
  决策进行中：store 要等一次 T1 写入（spawn mnemosyne），期间必须让用户
  看见「在处理」。aria-busy 是这里唯一的状态写入 —— 它同时驱动这个转圈和
  客户端的按钮禁用；重绘会换掉整份文档，所以没有任何还原逻辑。
*/
.action-bar[aria-busy="true"] .btn {
  opacity: 0.6;
  cursor: progress;
}

.action-bar[aria-busy="true"]::after {
  align-self: center;
  width: 12px;
  height: 12px;
  border: 2px solid var(--muted-foreground);
  border-top-color: transparent;
  border-radius: 999px;
  animation: spin 800ms linear infinite;
  content: "";
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 前庭敏感用户：保留静态指示，去掉旋转。 */
@media (prefers-reduced-motion: reduce) {
  .action-bar[aria-busy="true"]::after {
    animation: none;
    border-top-color: var(--muted-foreground);
    opacity: 0.5;
  }
}
`;
