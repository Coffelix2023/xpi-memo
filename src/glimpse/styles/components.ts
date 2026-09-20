/**
 * Reusable controls: buttons, badges, status pills, tints, and the empty,
 * loading, and error states that any view can be in.
 *
 * The `.kpi-*` card styles live in `views/status.ts` instead, because only
 * the status view has KPI cards.
 */
export const COMPONENT_STYLES = `
/* ═══════════════════════════════════════════════════════════════
   基础组件：btn / badge / pill / card（shadcn 外观）
   ═══════════════════════════════════════════════════════════════ */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 32px;
  padding: 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 600;
}

.btn-primary:hover {
  background: color-mix(in oklab, var(--primary) 88%, var(--foreground));
}

.btn-secondary {
  background: var(--secondary);
  color: var(--secondary-foreground);
  border-color: var(--border);
}

.btn-secondary:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.btn-destructive {
  background: var(--destructive);
  color: var(--destructive-foreground);
  font-weight: 600;
}

.btn-destructive:hover {
  background: color-mix(in oklab, var(--destructive) 88%, var(--foreground));
}

.btn:focus-visible,
.nav-item:focus-visible,
.icon-btn:focus-visible,
.group-head:focus-visible,
.candidate-item:focus-visible,
.snapshot:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* 状态胶囊：圆角背景 + 语义色，用于运行状态与活动状态 */
.badge,
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-3);
  border: 1px solid;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

/* THEMES.md 无 success/warning 语义色：成功复用 secondary，警告复用 accent */
.badge-ok,
.pill-ok {
  /* 徽标统一用 muted 底 + foreground 字：secondary 在暗色下本身就是亮色，
     配 foreground 会变成白字白底。语义靠边框与符号前缀区分。 */
  background: var(--muted);
  border-color: var(--border);
  color: var(--foreground);
}

/* 状态符号：只上色，不带胶囊背景（胶囊只给状态文字用） */
.t-ok {
  color: var(--foreground);
}

.t-warn {
  color: var(--primary);
}

.t-danger {
  color: var(--destructive);
}

.t-dim {
  color: var(--muted-foreground);
}

.badge-warn,
.pill-warn {
  background: color-mix(in oklab, var(--accent) 70%, transparent);
  border-color: var(--primary);
  color: var(--accent-foreground);
}

.badge-danger,
.pill-danger {
  background: color-mix(in oklab, var(--destructive) 22%, transparent);
  border-color: var(--destructive);
  color: var(--destructive);
}

.badge-dim,
.pill-dim {
  background: var(--muted);
  border-color: var(--border);
  color: var(--muted-foreground);
}
/* 空态与加载骨架 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  color: var(--muted-foreground);
  text-align: center;
}


.skeleton {
  background: var(--muted);
  border-radius: var(--radius-sm);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
`;
