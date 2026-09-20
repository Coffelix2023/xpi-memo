## Why

`/xpi-memo` 有两条轨道：Glimpse 可用时开原生窗口，否则降级成终端面板。两者共享同一份视图模型与文案表，但窗口这一侧只做了一半，用户在真实使用中撞到了四处问题：

1. **窗口的设置视图只能看，不能改。** 页内客户端里没有任何改值路径，点一行只把说明显示到下方，空格什么也不做。终端面板早就支持改值，于是「同一套操作入口」这条既有要求只在一条轨道上成立。
2. **待审详情的「理由」与「证据」永远是英文。** 这两串是代码里的固定句子与英文模板，没有走文案表，切到中文也不变。
3. **「最近」页读不出东西。** 它取审计日志最后 5 条，却给「类型」和「库」各留一列，而占比最高的 `feedback` 事件这两个字段都没有；符号与配色表又用了一组虚构的状态名（`hit`、`pending`），审计真正写入的 `recalled` 永远匹配不上。结果是大半行都是「—」。
4. **窗口拉大后，多出来的区域是空白。** 页内外壳写死 800×600，而 Glimpse 打开的是带标题栏、可缩放的原生窗口。

第 4 条与现行 spec 直接冲突：`The window MUST honor the documented 800×600 geometry` 要求「内容 MUST 在该尺寸内组织，而不是请求窗口自适应或增长」。用户已经明确选择「窗口拉大时内容铺满」，因此这条契约必须跟着行为一起改，而不是让代码与契约各说一套。

## What Changes

- **设置可改值：** 值单元格按行数据分流成控件 —— 可枚举字段是下拉框，自由文本字段是输入框，被 `XPI_MEMO_*` 钉住的字段禁用，只读字段仍是纯文本。控件一上报改动就落盘，没有单独的保存步骤。
- **数据派生文案随语言：** 候选的理由与证据说明、审计事件的名称与状态词都走文案表；固定句按**值**查表，因此盘上已有的英文记录无需迁移即可显示中文，查不到的按原样显示。
- **「最近」页改用真实词表：** 六列改五列，类型与库并进一格按事件类型补该类型自己的字段；符号/配色合并成一张表并按审计实际写入的取值重排；检索关键词原文（`recall.reason`）刻意不进摘要。
- **几何契约改为「启动尺寸 + 铺满」：** 启动仍是 800×600（`WINDOW_WIDTH`/`WINDOW_HEIGHT` 是唯一真相），但外壳铺满窗口，只有 header / footer / 侧栏保持定尺；窗口不自行请求改变尺寸。

## Capabilities

### New Capabilities

无。本变更只修改既有能力的契约。

### Modified Capabilities

- `glimpse-console-panel`：
  - MODIFIED `The window MUST honor the documented 800×600 geometry` → 正文改为「启动尺寸 800×600 + 内容铺满可缩放的宿主窗口」，保留「窗口不得自行增长、超长区域内部滚动」的意图。要求**名称刻意不改**：OpenSpec 的 MODIFIED 按名称匹配，改名会让同步变成「新增 + 删除」而不是修改。
  - MODIFIED `Window text MUST follow the configured language and be switchable in-window` → 明确覆盖由已存数据派生、但由代码固定的文案（候选理由/证据说明、审计事件名称与状态词），并说明不得改写盘上数据来达到效果。
  - ADDED `Settings fields MUST be editable in the window, with the panel's guards` → 把「与终端面板同一套操作入口」在设置字段上具体化：可枚举 → 选择器、自由文本 → 输入框、环境变量钉住 → 只读，且不设独立保存步骤。

## Impact

- 代码：`src/glimpse/views/settings.ts`、`src/glimpse/client.ts`、`src/glimpse/window.ts`、`src/glimpse/views/{pending,recent}.ts`、`src/glimpse/text.ts`、`src/glimpse/styles/{base,chrome}.ts` 与 `styles/views/*`、`src/panel-text.ts`、`src/pending-candidate.ts`（固定句收成常量 + 显示函数）、`src/console.ts`（窗口选项带上 `config`）、`src/status.ts` 与 `src/index.ts`（`recentEntries` 带上审计 metadata）。
- 契约外的东西：终端面板的行为不变；`/xpi-memo-status` 的 JSON 仍向后兼容（新增字段全部 optional）；启动尺寸不变，`TUI-DESIGN.md` §1/§2A 的描述同步更正（§2A 曾写 `frameless: true`，与代码不符）。
- 非目标：`内容`（记忆载荷）不做显示层翻译；`kinds.ts` 的 kind 标签仍是单语言；保存失败的错误态仍是既有的未闭合点（`.error-banner` 存在但无触发路径）。
