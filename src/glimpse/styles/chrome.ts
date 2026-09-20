/**
 * Persistent window chrome: header, sidebar navigation, and footer.
 *
 * These three are always on screen regardless of the active view, which is
 * what separates them from `components.ts` and `views/`.
 */
export const CHROME_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   footer：info bar + 关闭按钮
   ═══════════════════════════════════════════════════════════════ */
.app-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--h-footer);
  padding: 0 var(--space-6);
  border-top: 1px solid var(--border);
}

.info-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  white-space: nowrap;
}

.info-key {
  color: var(--muted-foreground);
}

.info-val {
  font-family: var(--font-mono);
  color: var(--foreground);
}

.info-sep {
  color: var(--border);
}

/* 错误横幅：saveUserConfig 失败时的表达（principles.md 要求错误态） */
.error-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  font-size: 13px;
  color: var(--destructive);
  background: color-mix(in oklab, var(--destructive) 12%, transparent);
  border: 1px solid var(--destructive);
  border-radius: var(--radius-md);
}


.skeleton-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}


/* ═══════════════════════════════════════════════════════════════
   header：标题 + 状态徽标 + 主题/语言开关
   ═══════════════════════════════════════════════════════════════ */
.app-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--h-header);
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--border);
}

.app-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.app-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
  white-space: nowrap;
}

.app-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 13px;
  color: var(--muted-foreground);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 120ms ease;
}

.icon-btn:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

/* ═══════════════════════════════════════════════════════════════
   sidebar：180 宽垂直导航；高度由 .app-body 决定（不再写死 500）
   ═══════════════════════════════════════════════════════════════ */
.app-sidebar {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: var(--w-sidebar);
  padding: var(--space-3);
  background: var(--sidebar);
  color: var(--sidebar-foreground);
  border-right: 1px solid var(--sidebar-border);
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  /* 左 3px 竖条用 border 而不是伪元素，激活时不会引起布局位移 */
  border: 0;
  border-left: 3px solid transparent;
  border-radius: var(--radius-md);
  background: none;
  color: var(--sidebar-foreground);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.nav-item:hover {
  background: var(--sidebar-accent);
  color: var(--sidebar-accent-foreground);
}

.nav-item.is-active {
  background: var(--sidebar-accent);
  color: var(--sidebar-accent-foreground);
  border-left-color: var(--sidebar-primary);
  font-weight: 600;
}

.nav-count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
`;
