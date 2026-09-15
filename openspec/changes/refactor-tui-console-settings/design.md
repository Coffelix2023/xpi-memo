## Context

动机见 `proposal.md`；行为契约见 `specs/tui-console-panel/spec.md`。这里只记录塑造实现路径的现状与约束。

现役 `src/console.ts` 的结构：

- `panelLayout(terminalRows)` 返回固定的 `{ body, height }`；`PANEL_CHROME_ROWS = 5`（顶边框、tab 标题行、两行 info bar、底边框），`MIN_BODY_ROWS = 3`。面板高度在打开时算一次，渲染时只会缩小。
- `settingsItems(config, env)` 返回 `SettingItem[]`（`@earendil-works/pi-tui` 类型，含 `id` / `label` / `currentValue` / 可选 `values`）。环境变量已设置时省略 `values`，使 Enter 成为 no-op。
- Settings tab 由 `SettingsList` 组件渲染，它自带光标、Enter 取值循环与 Esc 取消处理（现役用 `() => undefined` 把 Esc 关掉，交还给外层面板）。
- 键盘分派集中在 `handleInput`：`Esc` 关闭面板，`←/→` 切 tab，`Tab` 在 Settings 字段间跳，`↑/↓/Enter` 转给当前列表。
- Recent / Status 两个 tab 用 `windowSlice(lines, row, rows)` 做**居中式**窗口。
- 可测的纯函数已存在：`panelLayout`、`bodyRows`、`nextTab`、`moveRow`、`listMaxVisible`、`fit`、`infoBarLines`、`tabTitleLines`、`settingsItems`、`recentWindow`、`statusWindow`。
- `settingsItems` 与 `listMaxVisible` 只被 `src/console.ts` 和 `src/console.test.ts` 使用，没有外部调用方。

约束：无构建步骤，TypeScript strict，改动必须过 `pnpm typecheck` / `pnpm -w run lint` / `pnpm test`。`src/config.ts` 不改——19 个字段的 `XPI_MEMO_*` 覆盖已经全部在位。

## Goals / Non-Goals

**Goals:**

- 让分组的行序列与滚动窗口成为可单测的纯函数，而不是埋在渲染闭包里。
- 在不引入新高度算法的前提下，把可变行数内容塞进固定的 body 行数。
- 让新增的 10 个可见字段与现役 9 个字段共享同一套取值、锁定与保存路径。

**Non-Goals:**

- 不抽取通用列表组件。本轮只有一个 Settings 视图需要分组，抽象留给第二个使用者出现时。
- 不改 Recent / Status 的居中窗口语义。
- 不引入面板文案的本地化机制（见 Decisions D7）。

## Decisions

### D1: 分组是数据模型，不是列表里的伪行

引入一个分组结构描述「组 id + 组内字段」，`settingsItems` 的产物仍按字段存在，但字段归属由分组结构表达。

备选：在 `settingsItems` 返回的数组里插入 `{ id: "__group" }` 之类的伪 `SettingItem`。否决理由：`SettingItem` 的形状由 pi-tui 决定，塞入伪项后 Enter / `values` 语义无法表达，也无法承载折叠状态。

### D2: 唯一的行序列作为光标坐标系

新增一个派生函数，把当前折叠状态展开成一条行序列：每个元素要么是组头、要么是字段。光标索引落在这条序列上，`↑/↓` 在这条序列上移动。

备选：光标只落在字段上，组头不可选中。否决理由：spec 的「Moving across a group boundary」要求光标停在组头本身，且折叠操作需要一个可聚焦的行。

### D3: 不再使用 `SettingsList`，Settings tab 改自绘

`SettingsList` 的光标只在自己的行集内，无法让组头参与同一条光标序列。自绘分组列表后，选中态、Enter 取值循环与 Tab 跳字段都由面板自己实现。

代价与偿还：失去 `SettingsList` 的取值循环与 `values` 省略语义，需要自己实现；但 `values` 缺失即 no-op 这条规则简单且可测，直接沿用。

备选：保留 `SettingsList`，组头用 `Text` 行渲染在列表之外。否决理由：光标无法跨过组头，D2 的行序列模型不成立。

### D4: 折叠状态默认只展开首组

首组 `Retrieval` 有 6 个字段，是最大的一组。5 个组头 + 6 个字段 = 11 行，落在 15 行 body 内留 4 行余量。默认展开任何更小的组都会让首屏更空。

折叠状态是**面板生命周期内**的运行时状态，不写进配置——spec 没有要求跨会话保持，写配置会引入新的持久化面。

### D5: 滚动窗口与 `windowSlice` 分开实现

现役 `windowSlice` 是居中式（`row` 居中，首尾夹紧）。配置面板需要的是**跟随光标**：光标上移越过窗口顶部时窗口上移，下移越出底部时窗口下移，两端都夹紧。

两套语义共用同一个函数会让参数含义变得含糊，因此新增一个独立的纯函数。两者都返回恰好 `rows` 行，复用 `fit`。

### D6: 环境变量锁定沿用 `Boolean(env[name])`，标签改为附变量名

判定逻辑与现役一致，只是从 9 个字段扩展到 19 个。呈现从 `"<label> (env locked)"` 改为 `"<label> (<XPI_MEMO_NAME>)"`，因为 spec 要求指出了决定它的来源。

锁定字段仍省略 `values`，使 Enter 成为 no-op——这条现役规则保持不变。

### D7: 面板文案保持英文

现役 `TAB_TITLES`、`TAB_HINT`、`settingsItems` 标签全部是硬编码英文；`config.language` 影响的是注入与提示语言，不是面板本身。本轮不引入第二个文案体系，新增的组名与字段标签也用英文，与既有行一致。

代价见 Risks R3。

## Risks / Trade-offs

- **放弃 `SettingsList` 会丢掉它已验证的边界处理（滚动指示、无匹配文本、选中前缀）** → 把行序列派生与窗口算法做成纯函数并用 vitest 覆盖；选中态渲染沿用面板既有的 `truncateToWidth` + `padRow` 路径。
- **「全部字段可达」在折叠后依赖滚动正确性** → spec 的「Expanded content exceeds the body」作为专门测试用例，覆盖全展开 + 光标在首尾两端。
- **英文标签对中文用户不友好** → 本轮明确不做本地化（D7），也没有引入更大回退。这是已知的、被接受的债。
- **锁定标签加长后可能挤掉值列** → 最长组合是 `Offline extraction (XPI_MEMO_OFFLINE_EXTRACTION_ENABLED)` 约 57 列，在 74 列可用宽度内仍放得下值；用既有的截断路径兜底，不新增布局分支。
- **把 `privacy`、`l0Enabled` 等字段首次暴露到面板** → 这是本次的意图。保存路径不新增旁路，仍走既有的 `actions.save` → `saveUserConfig`，因此写盘失败的表现与现役字段一致。

## Migration Plan

无数据迁移：不改配置格式、默认值或环境变量语义。

回滚为单次提交回滚，涉及 `src/console.ts` 与 `src/console.test.ts` 两个文件；面板几何与 `config.ts` 未动，回滚后行为等价于现状。

## Open Questions

- 折叠状态是否需要跨会话记忆（写进配置或 session 内存储）。spec 不要求，本轮按面板生命周期处理；若后续需要，属于新的持久化面，应另开 change。
