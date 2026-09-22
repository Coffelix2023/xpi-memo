/**
 * Triggers view: three read-only groups of rules in one scrolling column.
 *
 * The scroll container repeats the settings pane's shape — `flex: 1` with
 * `min-height: 0`, which is what actually lets a flex child shrink and scroll —
 * rather than inventing a second scrolling behaviour for a second long list.
 *
 * Colours come from theme tokens only: `styles.test.ts` fails on a literal hex,
 * so a rule here cannot quietly drop out of the theme system.
 */
export const TRIGGERS_VIEW_STYLES = `
.triggers-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.trigger-hint {
  margin: 0;
  padding: var(--space-3);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-size: 12px;
}

.trigger-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.trigger-head {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
}

/* 三列：规则名 / 触发词 / 结果。触发词列吃剩余宽度，因为它最长。 */
.trigger-row {
  display: grid;
  grid-template-columns: 120px 1fr 160px;
  gap: var(--space-3);
  align-items: baseline;
  padding: var(--space-2) var(--space-3);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.trigger-label {
  font-weight: 600;
}

.trigger-phrases {
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}

.trigger-result {
  color: var(--foreground);
  font-size: 12px;
  overflow-wrap: anywhere;
}
`;
