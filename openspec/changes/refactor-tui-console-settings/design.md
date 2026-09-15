## Context

动机见 `proposal.md`；行为契约见 `specs/tui-console-panel/spec.md`。这里只记录塑造实现路径的现状与约束。

现役 `src/console.ts` 的结构：

- `panelLayout(terminalRows)` 返回 `{ body, height }`，其中 `height = min(bodyRows(terminalRows) + PANEL_CHROME_ROWS, terminalRows)` 而 `bodyRows = max(terminalRows - 5, 3)`。净效果是面板高度**等于终端高度**。`PANEL_CHROME_ROWS = 5`（顶边框、tab 标题行、两行 info bar、底边框），`MIN_BODY_ROWS = 3`。
- `openConsole` 的 `overlayOptions` 只有 `{ anchor: "center", width: "70%" }`——没有高度上限，也没有 margin。
- `TUI-DESIGN.md` 第 60–67 行要求 `anchor: "center"`、`preferredWidth: 78`、`panelHeight: 20`、`maxHeight: "70%"`、`margin: { top: 2, bottom: 4, left: 2, right: 2 }`，并在 Do's（第 100 行）把 `margin.bottom >= 4` 列为强制项。现役实现三条都没满足。
- `settingsItems(config, env)` 返回 `SettingItem[]`；`SETTINGS_FIELD_SPECS` 的 `label` 是硬编码英文字面量。
- `TAB_TITLES`、`TAB_HINT` 同样是硬编码英文。`config.language` 只被注入与提示路径消费，面板完全不看它。
- 分组的行序列、滚动窗口、渲染都是纯函数：`settingsRows`、`cursorWindowStart`、`groupHeaderIndex`、`clampCursor`、`settingsRowText`。
- `settingsItems`、`settingsRows` 与上述纯函数只被 `src/console.ts` 和 `src/console.test.ts` 使用，没有外部调用方。

约束：无构建步骤，TypeScript strict，改动必须过 `pnpm typecheck` / `pnpm -w run lint` / `pnpm exec vitest run src/`。`src/config.ts` 不改——`config.language` 已经存在，本轮只是开始消费它。

## Goals / Non-Goals

**Goals:**

- 让面板的高度、语言与字段说明三者都能被单测断言，而不是散落在 overlay 配置与字面量里。
- 让分组、三列与尺寸预算共用同一套行序列与窗口算法，不引入第二条渲染路径。
- 让面板文案只有一个来源（一份字典），新增字段时漏写文案能被测试抓住。

**Non-Goals:**

- 不抽取通用列表组件。本轮只有一个 Settings 视图需要分组。
- 不改 Recent / Status 的居中窗口语义。
- 不把注入/提示文案与面板文案合并成一份字典（理由见 D7）。

## Decisions

### D1: 分组是数据模型，不是列表里的伪行

引入一个分组结构描述「组 id + 组内字段」，`settingsItems` 的产物仍按字段存在，但字段归属由分组结构表达。

备选：在 `settingsItems` 返回的数组里插入 `{ id: "__group" }` 之类的伪 `SettingItem`。否决理由：`SettingItem` 的形状由 pi-tui 决定，塞入伪项后 Enter / `values` 语义无法表达，也无法承载折叠状态。

### D2: 唯一的行序列作为光标坐标系

新增一个派生函数，把当前折叠状态展开成一条行序列：每个元素要么是组头、要么是字段。光标索引落在这条序列上，`↑/↓` 在这条序列上移动。

备选：光标只落在字段上，组头不可选中。否决理由：spec 的「Moving across a group boundary」要求光标停在组头本身，且折叠操作需要一个可聚焦的行。

### D3: 不再使用 `SettingsList`，Settings tab 改自绘

`SettingsList` 的光标只在自己的行集内，无法让组头参与同一条光标序列。自绘分组列表后，选中态、Enter 取值循环与 Tab 跳字段都由面板自己实现。

代价与偿还：失去 `SettingsList` 的取值循环与 `values` 省略语义，需要自己实现；但 `values` 缺失即 no-op 这条规则简单且可测，直接沿用。**注意**：自绘后组件拥有显示值，取值循环必须先回写 `SettingItem.currentValue` 再走 `actions.save`，否则连续按 Enter 会原地打转。

备选：保留 `SettingsList`，组头用 `Text` 行渲染在列表之外。否决理由：光标无法跨过组头，D2 的行序列模型不成立。

### D4: 折叠状态默认只展开首组

首组 `Retrieval` 有 6 个字段，是最大的一组。5 个组头 + 6 个字段 = 11 行，落在收紧后的 15 行 body 内仍有余量。默认展开任何更小的组都会让首屏更空。

折叠状态是**面板生命周期内**的运行时状态，不写进配置——spec 没有要求跨会话保持，写配置会引入新的持久化面。

### D5: 滚动窗口与 `windowSlice` 分开实现

现役 `windowSlice` 是居中式（`row` 居中，首尾夹紧）。配置面板需要的是**跟随光标**：光标上移越过窗口顶部时窗口上移，下移越出底部时窗口下移，两端都夹紧。

两套语义共用同一个函数会让参数含义变得含糊，因此保留独立的纯函数。两者都返回恰好 `rows` 行，复用 `fit`。

### D6: 环境变量锁定沿用 `Boolean(env[name])`，标签改为附变量名

判定逻辑与现役一致，只是从 9 个字段扩展到 19 个。呈现从 `"<label> (env locked)"` 改为 `"<label> (<XPI_MEMO_NAME>)"`，因为 spec 要求指出了决定它的来源。

锁定字段仍省略 `values`，使 Enter 成为 no-op——这条现役规则保持不变。

### D7: 面板文案走一份字典，语言来源是 `config.language`

面板的 chrome、组名、字段标签与字段备注从一份按语言索引的字典取；语言直接读已经加载好的 `config.language`，**不新增配置项**。

备选：给面板单独一个语言开关。否决理由：`config.language` 已经存在且语义相同（用户可见的语言），再开一个开关会把「我设了 zh，面板为什么还是英文」变成两个开关的组合问题。

回退规则：选中语言缺键 → 回退 `en` → 再缺则回退键名本身。spec 的「A string has no translation」要求不渲染空行、不抛错。

代价：面板字典与注入/提示文案是两份。它们消费面不同（终端栅格渲染 vs 提示文本），合并会把两边的键耦合起来，且注入文案不需要关心 78 列宽度。这是被接受的重复。

### D8: 面板高度取 `min(PANEL_HEIGHT, floor(terminalRows × 0.7))`

`TUI-DESIGN.md` 同时写了 `panelHeight: 20` 与 `maxHeight: "70%"`，取更小值才同时满足：大终端落在 20 行，小终端按比例收紧。

`panelLayout` 的签名与返回语义不变（仍然吃 `terminalRows`，仍然返回 `{ body, height }`），只换高度算法；`body = height - PANEL_CHROME_ROWS` 仍然成立，`MIN_BODY_ROWS` 继续作为下限。既有 4.1 的两条断言（`bodyRows` / `panelLayout`）需要按新算法重写。

底部留白给在 `openConsole` 的 `overlayOptions.margin`（`bottom >= 4`），不给 0。

备选：只设 `maxHeight` 不设固定行数。否决理由：纯百分比在大终端上仍是 70% 高，用户抱怨的「占满屏」没有解决。

备选：写死 20 行不看终端。否决理由：小终端上会溢出可用视口，违反 spec 的 short-terminal 场景。

### D9: 字段行三列，备注文案直接取自原型

`标签 / 当前值 / 备注`，三列在 78 列基准下分配宽度，值右对齐。

备注是「改这个字段会怎样」的一句话，文案直接用 `.pi/prototype-design/tui-console-panel/hifi/` 原型的 `note.*` 键（中英各 20 条），不重新撰写——原型已经逐条校对过长度。

窄终端降级顺序（对应 spec 的「The row is narrower than the three parts」）：先丢备注列，再截断 label，**值始终可见**。

备选：只在光标所在行显示备注。否决理由：用户明确要三列，且「说明始终可见、不依赖光标位置」比省列宽更重要。

## Risks / Trade-offs

- **改 `panelLayout` 会动既有 4.1 断言** → 这两条断言本来就是「契约测试」，算法变了它们就该变；已在 tasks 第 6 组列明，与新算法一起重写。
- **面板字典与提示字典重复** → 已接受，理由见 D7；用一条「两种语言下每个键都非空」的单测兜住漏写。
- **三列在窄终端上会挤** → 降级顺序写死在 D9，并用 40 列的单测断言「备注消失、label 与 value 仍在」。
- **放弃 `SettingsList` 会丢掉它已验证的边界处理（滚动指示、无匹配文本、选中前缀）** → 行序列派生与窗口算法是纯函数并有 vitest 覆盖；选中态沿用面板既有的 `truncateToWidth` + `padRow` 路径。
- **把 `privacy`、`l0Enabled` 等字段首次暴露到面板** → 这是本次的意图。保存路径不新增旁路，仍走既有的 `actions.save` → `saveUserConfig`。

## Migration Plan

无数据迁移：不改配置格式、默认值或环境变量语义。`config.language` 的取值集合不变。

回滚为单次提交回滚，涉及 `src/console.ts` 与 `src/console.test.ts` 两个文件。

## Open Questions

- 折叠状态是否需要跨会话记忆（写进配置或 session 内存储）。spec 不要求，本轮按面板生命周期处理；若后续需要，属于新的持久化面，应另开 change。
