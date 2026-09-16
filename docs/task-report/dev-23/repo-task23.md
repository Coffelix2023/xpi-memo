# Task 23 Report — 面板尺寸与 Settings 列布局

- 关联任务：`.pi/fast-fixes/2026-09-16-xpi-memo-panel-fixes/tasks.md` §3（3.1–3.3）
- 涉及文件：`src/console.ts`、`src/console.test.ts`、`TUI-DESIGN.md`
- 日期：2026-09-16

## 目的

三个"看得难受"的问题，根因都在同一个地方：面板的几何契约和行的列布局都是硬算出来的，没有给分隔和说明留位置。

1. 面板 78×20 的信息密度偏高，长 note 被压得很短；
2. `settingsRowText` 三列之间没有任何固定分隔，label 和 note 直接贴在一起，窄终端上更像一坨；
3. note 只有被截断的一小截，用户看不到字段的完整含义。

## 作用

1. **尺寸**：`PANEL_HEIGHT` 20 → 24，新增 `PANEL_WIDTH = 94`，并把它接到 overlay 的 `width` 上（overlay 仍会按视口夹紧，`maxHeight` 70% 的预算不变）。
2. **列间距**：新增 `LABEL_NOTE_GAP = 2` 与 `NOTE_VALUE_GAP = 1`。label 固定宽度不变，note 的可用宽度改为 `budget - labelWidth - 2 - valueWidth - 1`，因此 2 空格的分隔是**预留**出来的而不是靠剩余空间碰运气；剩余空间只落在 note 与 value 之间的右对齐间隙里。
3. **说明行**：`PANEL_CHROME_ROWS` 5 → 6，在 info bar 上方固定插入一行 `describeRow()`——光标所在字段的完整 note（组头行留空）；刚保存过时这一行改为显示"已保存 · 配置已写入"。

## 特点

- **两个常量驱动**：列间距和面板尺寸都在文件顶部集中声明，测试直接引用常量而不是硬编码数字。
- **降级顺序明确**：空间不够时先丢 note、再压 label，value 永远保留；note 列低于 `MIN_NOTE_COLUMN_WIDTH` 时整列消失，而不是留一串省略号。
- **尺寸契约与文档同步**：`TUI-DESIGN.md` 的 `preferredWidth` / `panelHeight` 一起从 78/20 改成 94/24，避免文档与代码漂移。
- **说明行无额外状态机**：`savedNotice` 是一个布尔量，任何后续按键清掉，不需要定时器或动画帧。

## 边界

- 高度仍受 70% 视口预算约束：终端只有 24 行时面板仍是 16 行，说明行会挤占 body 而不是撑破面板。极小终端（≤8 行）下 chrome 6 行会吃掉 body 的行数地板（body 由 3 行降到 2 行），这是"chrome +1 行、body −1 行"的直接结果。
- 只改 `ctx.ui.custom` 的 console 面板；`src/status-panel.ts` 独立的 `PANEL_WIDTH/HEIGHT` 未动。
- 说明行只对 Settings 标签有内容；Recent/Status/Pending 上是一行空白，用于保持面板高度恒定（TUI 里高度跳动比空行更糟）。

## 验证

- `pnpm test src/console.test.ts`：55 passed。含 `panelLayout` 新预算（50/100/24/8/9 行）、`settingsRowText` 的固定间距、说明行位置（`render().at(-4)`）与面板高度恒定。
- `pnpm typecheck`、`pnpm -w run lint` 通过。
