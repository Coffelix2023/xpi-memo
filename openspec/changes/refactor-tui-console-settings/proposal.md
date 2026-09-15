## Why

`/xpi-memo` 的 Settings tab 把 `XpiMemoConfig` 的 19 个字段中的 9 个平铺成一个无分组的列表，剩下 10 个字段只能改配置文件。用户既看不出字段归属，也无法从标签判断自己改的是哪一类行为。

而配置层其实已经完全支持全部 19 个字段：`src/config.ts` 第 358–461 行对每个字段都做了 `XPI_MEMO_*` 环境变量读取。缺口只在 UI 层——`src/console.ts` 的 `settingsItems` 既没有暴露这些字段，也没有引用它们已经存在的环境变量名，导致面板的「env 锁定」行为与实际生效的配置不一致。

## What Changes

- Settings tab 由平铺 10 项改为 **5 个功能域分组、共 20 行**：19 个 `XpiMemoConfig` 字段加 1 个 `sleep` 一次性动作。
- 分组头可折叠/展开，默认只展开首组，折叠状态在面板生命周期内保持。
- 光标按行移动（组头与字段行同属一条行序列），↑/↓ 滚动时窗口跟随光标，不越界。
- `settingsItems` 为 10 个新纳入字段填入 `config.ts` 中**已经生效**的 `XPI_MEMO_*` 变量名，使面板的环境变量锁定标注与真实配置来源一致。
- 面板几何保持 `PANEL_WIDTH` / `PANEL_CHROME_ROWS` / `MIN_BODY_ROWS` 契约不变，仍为 78 列基准。

**Non-goals**（本轮明确不做，已与用户确认）：

- 不改 tab 栏。现役 `tabTitleLines` 仍只渲染当前 tab 名，不列出全部 4 个 tab。
- 不引入字段行备注列。字段行仍为单列「标签 + 值」，分组结构是零文档可读性的唯一载体。
- 不改 Pending / Recent / Status 三个 tab 的内部布局与滚动。
- 不改 Glimpse 侧（`src/status-panel.ts`）。TUI 侧先落地稳定，双轨同步另开 change。
- 不新增配置项，不修改 `src/config.ts` 的读取逻辑或默认值。

## Capabilities

### New Capabilities

- `tui-console-panel`: `/xpi-memo` 弹出面板的终端结构契约——设置字段的分组组织、分组折叠语义、光标与滚动窗口行为，以及面板对「字段当前值来自哪里」的呈现责任。

### Modified Capabilities

无。`memory-observability` 的「终端与富状态面消费同一只读契约」不因分组展示而改变；`shared-data-root` 的数据根契约不因 `dataDir` 在面板里被展示而改变。本 change 只改变 Settings tab 如何组织既有配置字段，不改变任何既有 requirement 的行为。

## Impact

- `src/console.ts`：`settingsItems` 的字段集合与环境变量名；Settings tab 的分组渲染路径；折叠状态与滚动窗口；`ConsoleViewModel` 与相关纯函数。
- `src/console.test.ts`：现有 Settings 断言需随分组结构更新，并新增折叠与滚动窗口的覆盖。
- 不改 `src/config.ts`、`src/status-panel.ts`、`src/index.ts` 的命令注册。
- 设计依据：`.pi/prototype-design/tui-console-panel/hifi/` 的原型已验证 78×20 网格下的分组与折叠几何（5 组头 + 展开组字段数不超过 15 行 body）。原型中字段行的三列与 tab 栏改动**不在**本次范围内。
