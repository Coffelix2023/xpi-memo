## Why

`/xpi-memo` 的 Settings tab 把 `XpiMemoConfig` 的 19 个字段中的 9 个平铺成一个无分组的列表，剩下 10 个字段只能改配置文件。用户既看不出字段归属，也无法从标签判断自己改的是哪一类行为。

而配置层其实已经完全支持全部 19 个字段：`src/config.ts` 第 358–461 行对每个字段都做了 `XPI_MEMO_*` 环境变量读取。缺口只在 UI 层——`src/console.ts` 的 `settingsItems` 既没有暴露这些字段，也没有引用它们已经存在的环境变量名，导致面板的「env 锁定」行为与实际生效的配置不一致。

分组落地后（见下方首个变更项，已实现）暴露出三个面板级缺陷。它们与 Settings 的分组无关，却决定同一个面板是否可用：

- **尺寸违反项目自己的规范。** `TUI-DESIGN.md` 要求 `panelHeight: 20`、`maxHeight: "70%"`、`margin: { bottom: 4 }`；`openConsole` 只设了 `anchor` 与 `width: "70%"`，于是面板高度等于终端全高，且贴住底部输入区。
- **面板不跟随语言。** `config.language` 影响注入与提示语言，但面板自身的 chrome 与字段标签是硬编码英文；用户把 `Language` 设成 `zh` 之后，面板仍然全英文。
- **字段只有一个名字和一个值。** `hybrid`、`on`、`disabled` 这类值不解释后果，用户仍需查文档才能判断一次改动的含义。

## What Changes

- Settings tab 由平铺 10 项改为 **5 个功能域分组、共 20 行**：19 个 `XpiMemoConfig` 字段加 1 个 `sleep` 一次性动作。**（已实现）**
- 分组头可折叠/展开，默认只展开首组，折叠状态在面板生命周期内保持。**（已实现）**
- 光标按行移动（组头与字段行同属一条行序列），↑/↓ 滚动时窗口跟随光标，不越界。**（已实现）**
- `settingsItems` 为 10 个新纳入字段填入 `config.ts` 中**已经生效**的 `XPI_MEMO_*` 变量名，使面板的环境变量锁定标注与真实配置来源一致。**（已实现）**
- 字段行由「标签 + 值」两列改为 **「标签 / 当前值 / 备注」三列**，备注用一句话说明该字段改了什么。
- 面板高度按 `TUI-DESIGN.md` 的预算收紧：取 `PANEL_HEIGHT`(20 行) 与终端行数 70% 中的较小者，并按规范补上 `margin.bottom >= 4`，使面板不再贴住输入区。
- 面板 chrome 与字段文案改走一份面板字典，语言来源为 `config.language`，与注入/提示语言共用同一个开关。

**Non-goals**（本轮明确不做，已与用户确认）：

- 不改 tab 栏。现役 `tabTitleLines` 仍只渲染当前 tab 名，不列出全部 4 个 tab。
- 不改 Pending / Recent / Status 三个 tab 的内部布局与滚动。
- 不改 Glimpse 侧（`src/status-panel.ts`）。TUI 侧先落地稳定，双轨同步另开 change。
- 不新增配置项。面板语言复用既有的 `config.language`，不引入面板专用开关。
- 不修改 `src/config.ts` 的读取逻辑或默认值。

## Capabilities

### New Capabilities

- `tui-console-panel`: `/xpi-memo` 弹出面板的终端结构契约——设置字段的分组组织、分组折叠语义、光标与滚动窗口行为、字段说明的呈现、面板文案的语言来源，以及面板对「字段当前值来自哪里」的呈现责任。

### Modified Capabilities

无。`memory-observability` 的「终端与富状态面消费同一只读契约」不因分组、三列或语言切换而改变；`shared-data-root` 的数据根契约不因 `dataDir` 在面板里被展示而改变。本 change 只改变面板如何组织与呈现既有配置字段，不改变任何既有 capability 的 requirement 行为。

## Impact

- `src/console.ts`：`settingsItems` 的字段集合与环境变量名；Settings tab 的分组与三列渲染路径；折叠状态与滚动窗口；`panelLayout` 的高度预算；`openConsole` 的 `overlayOptions`（高度与 margin）；面板文案字典；`ConsoleViewModel` 与相关纯函数。
- `src/console.test.ts`：现有 Settings 断言需随分组、三列与高度预算更新，并新增折叠、滚动窗口、语言切换与尺寸预算的覆盖。
- 不改 `src/config.ts`、`src/status-panel.ts`、`src/index.ts` 的命令注册。
- 设计依据：`.pi/prototype-design/tui-console-panel/hifi/` 的原型已验证 78×20 网格下的分组、折叠与三列几何，以及中英两份字段备注文案。原型中 tab 栏的改动**不在**本次范围内。
