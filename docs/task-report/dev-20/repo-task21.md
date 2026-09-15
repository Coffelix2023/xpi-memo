# Task Report: refactor-tui-console-settings task 6.x–9.x

## 完成范围

本次完成 `refactor-tui-console-settings` 变更的后 4 个 Section（Panel geometry budget / Panel language / Field note column / Verification second pass），共 8 个任务，进度 22/22。变更的全部任务现已完成。

### 目的

前一轮把 Settings tab 从扁平清单改成了分组列表，但落地后暴露出三个面板级缺陷——它们与分组无关，却决定同一个面板是否可用：

- **尺寸违反项目自己的规范。** `TUI-DESIGN.md` 要求 `panelHeight: 20`、`maxHeight: "70%"`、`margin.bottom >= 4`；实现只设了 `anchor` 与 `width: "70%"`，于是面板高度等于终端全高，且贴住底部输入区。
- **面板不跟随语言。** `config.language` 影响注入与提示语言，但面板自身的 chrome 与字段标签是硬编码英文；用户把 `Language` 设成 `zh` 之后，面板仍然全英文。
- **字段只有一个名字和一个值。** `hybrid`、`on`、`disabled` 这类值不解释后果，用户仍需查文档才能判断一次改动的含义。

本轮把这三件事一起补齐。

### 作用与特点

- **高度取「规范行数」与「终端占比」的较小者**：`panelHeight = max(min(20, floor(terminalRows × 0.7)), chrome + 3)`，再被视口夹紧，body 由 height 反推。大终端落在 20 行不再撑满屏，小终端按 70% 收紧，短终端仍守住 3 行 body 下限。`MIN_BODY_ROWS` 与 chrome 行数契约不变。
- **开面板时读真实终端行数**：`createConsoleComponent` 用 `tui.terminal.rows` 而非调用方快照，避免组件建在过期快照上绕过 70% 预算。
- **底部留白进 overlay 配置**：`margin: { top: 2, bottom: 4, left: 2, right: 2 }`，`OVERLAY_MARGIN_BOTTOM` 导出为常量，让 `TUI-DESIGN.md` 的 Do's 变成可断言的契约而不是口头约定。
- **面板文案只有一份来源**：`PANEL_TEXT` 按语言索引 chrome / tab / 组名 / 字段标签 / 字段备注，语言直接读已加载好的 `config.language`，不新增配置项。
- **缺键回退三级**：选中语言 → `en` → 键名本身，保证不渲染空行、不抛错。
- **`SettingItem.label` 降级为字典键**：字段显示名不再硬编码在 item 里，语言切换不需要重建 item；被环境变量固定的字段改用 `description` 携带变量名（`⊘ XPI_MEMO_*`），渲染时落到备注列。
- **三列字段行**：`标签 / 当前值 / 备注`，78 列下标签列 22、备注列弹性、值右对齐（值始终贴着行尾）。
- **窄终端降级顺序写死**：备注列宽度低于 8 列时先丢备注，label 再截断，**值保持可见**。

### 边界

- **不改 `src/config.ts`**：`config.language` 已经存在，本轮只是开始消费它；取值集合不变。
- **不改 Recent / Status / Pending 的内部布局与滚动**，也不动 Glimpse 侧（`src/status-panel.ts`）。
- **不把注入/提示文案与面板文案合并**：两者消费面不同（终端栅格渲染 vs 提示文本），合并会把两边的键耦合起来，且注入文案不需要关心 78 列宽度。这是被接受的重复，用「两种语言下每个键都非空」的单测兜住漏写。
- **不给面板单独的语言开关**：`config.language` 语义相同，再加一个开关会把「我设了 zh，面板为什么还是英文」变成两个开关的组合问题。
- **不实现面板专用的持久化**：折叠状态仍只存在于面板生命周期内。

## 各任务实现要点

| 任务 | 实现 |
|------|------|
| 6.1 高度预算 | `panelHeight` = `max(min(PANEL_HEIGHT, floor(terminalRows × PANEL_HEIGHT_SHARE)), chrome + MIN_BODY_ROWS)`；`panelLayout` 再对视口夹紧。单测覆盖 50/100 行落 20、24 行按 70% 得 16、8 行守 3 行 body |
| 6.2 overlay 底部留白 | `openConsole` 的 `overlayOptions.margin` 补 `bottom: OVERLAY_MARGIN_BOTTOM`(4) 与三边 2；overlay 单测断言 `margin.bottom >= 4` |
| 7.1 面板字典 | `PANEL_TEXT` 两份（`en` / `zh`）覆盖 chrome.hint、info.*、tab.*、group.*、field.*、note.*；单测枚举面板会用到的每个键，断言两种语言都非空且两语言确实不同 |
| 7.2 渲染走字典 + 回退 | `panelText(key, language)` 实现三级回退；`settingsItem` 的 `label` 改为字段 id，`settingsRowText` 用字典取显示名。单测用不存在的键断言回退到键名、不抛错、不渲染空行 |
| 8.1 三列字段行 | `settingsRowText` 输出 `label + note + padding + value`，值右对齐；单测断言 78 列下三部分都在、label 起行、value 收行、可见宽度恰为 78 |
| 8.2 窄终端降级 | `noteWidth < MIN_NOTE_COLUMN_WIDTH` 时丢备注并放宽 label；单测在 40 列断言备注文案消失、label 与 value 仍在、宽度不超 40 |
| 9.1 更新受影响的既有断言 | 高度预算改了 `panelLayout`/`bodyRows` 的 4 条断言与多处 `toHaveLength(50)`；语言与三列改了 env-locked 标签断言与组名断言（`Memory runtime` → `Pipeline`、`Privacy & maintenance` → `Privacy`） |
| 9.2 三条质量门 | `pnpm typecheck` ✓、`pnpm -w run lint`(biome) ✓、`pnpm exec vitest run src/` ✓ |

## 验证

- `pnpm typecheck` ✓
- `pnpm -w run lint`（biome 2.5.11）✓ 0 error
- `pnpm test`（= `vitest run --dir src`）✓ 768 passed | 8 skipped（`src/console.test.ts` 51 条，比上轮多 6 条）

## 已知副作用

- **渲染路径改为尾部裁剪**：`render()` 现在先拼「顶边框 + tab 行 + body + info 两行 + 底边框」再多于 `height` 的行会被 `slice` 掉。20 行预算下这个组合恰好等于 20 行，因此底边框与两行 info bar 都保留；预算进一步收紧时先丢的会是最下方的边框，属于已被高度下限保护的边界。
- **`SettingItem.label` 语义变化**：现在携带的是字段 id 而非显示名。仓库内 `console.ts` 是唯一消费者，其显示路径全部改走字典，测试也同步更新。

## 回滚

回滚为单次提交回滚，涉及 `src/console.ts` 与 `src/console.test.ts` 两个文件。配置格式、环境变量语义与 `config.ts` 未动，无数据迁移；面板折叠状态与语言选择都不新增持久化面。
