## Why

`/xpi-memo` 的面板只有 TUI 一种形态。像素媒介的可行性已由原型 `.pi/prototype-design/glimpse-console-panel` 验证（800×600、4 视图、零字面 hex），但落地路径缺失：现役 Glimpse 实现 `src/status-panel.ts` 只覆盖状态页，且硬编码 GitHub-dark hex（`#0d1117` / `#58a6ff` / `#161b22`），与项目配色 SSOT `THEMES.md` 的 oklch 体系冲突；`TUI-DESIGN.md` §2.A 又把同一批 hex 写成 Glimpse 窗口令牌。双 SSOT 意味着下一个人仍会照 hex 写新代码。

## What Changes

- `/xpi-memo` 改为双轨：Glimpse 可用时弹 800×600 像素窗口；不可用或调用失败时降级到现有 TUI 面板。命令名、参数与 TUI 面板几何预算均不变。
- Glimpse 窗口覆盖四个视图——待审 / 最近 / 设置 / 状态——用左侧 180px 边栏导航，取代 TUI 版的顶部标签栏。
- 窗口配色全部取自 `THEMES.md` 的 oklch 变量，**零字面 hex**；暗色为默认，页内可切亮/暗与 `zh-CN` / `en`，偏好持久化且首帧不闪烁。
- 新增 Glimpse 窗口构建模块（HTML 构建、数据装配、面板文案），数据取自与 TUI 相同的 `MemoryStatus` / `ObservabilitySnapshot`，不新增 UI 专有状态。
- 状态视图的「今日事件占比」与「近 7 日事件量」由现有 `recentEntries` 按 `timestamp` 现算，不新增持久字段、不改 `/xpi-memo-status` 的 JSON 输出契约。
- `src/status-panel.ts` 的 `buildGlimpseHtml` 由统一窗口模块取代（消除唯一的代码内 hex 来源）；`/xpi-memo-status` 改为打开同一窗口并落在状态视图。`/xpi-memo-status` 的 TUI 降级渲染保留。
- `TUI-DESIGN.md` §2.A 的窗口令牌改为引用 `THEMES.md`，不再内联色值。
- 非破坏性：无命令改名、无配置项改名、无 JSON 契约变更。`glimpseui` 仍是可选 peer 依赖，不新增依赖。

## Capabilities

### New Capabilities

- `glimpse-console-panel`: `/xpi-memo` 的 Glimpse 像素窗口——可用性探测与降级、800×600 几何、四视图信息架构、边栏导航、`THEMES.md` 令牌合规、主题与语言切换、图表数据现算、以及「与 TUI 表面消费同一状态来源」的约束。

### Modified Capabilities

- `tui-console-panel`: 面板从唯一表面变为降级表面，需要新增降级等价性要求——Glimpse 不可用时四个视图必须仍全部可达，且语言与几何预算行为不变。现有几何预算要求同时明确限定为 TUI 表面，避免与 Glimpse 窗口的 800×600 契约相混。

## Impact

- **代码**：`src/console.ts`（`openConsole` 加 Glimpse 优先分支）、`src/status-panel.ts`（`buildGlimpseHtml` 退役，TUI 降级渲染保留）、`src/index.ts`（`/xpi-memo` 与 `/xpi-memo-status` 接线）。新增 Glimpse 窗口模块目录；按仓库规范拆分（单文件单一职责，不超 200–300 行）。
- **测试**：`src/console.test.ts`、`src/status-panel.test.ts` 受影响；新增窗口模块的单测。
- **文档**：`TUI-DESIGN.md` §2.A 令牌段落改写为引用 `THEMES.md`。
- **依赖**：无新增。`glimpseui` 保持可选 peer，未安装时走 TUI 降级。
- **既有契约**：`memory-observability` 已要求终端面板与富状态表面消费同一 `MemoryStatus` / `ObservabilitySnapshot`，本变更遵守该约束，不使其失效。
