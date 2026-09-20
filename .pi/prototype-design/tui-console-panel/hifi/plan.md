# plan.md — tui-console-panel / hifi

> 本阶段唯一需求事实来源。每轮深挖后覆写本文件。

## 1. 目的 (Why)

把 `/xpi-memo` 命令的 TUI 面板从「能用」推到「一眼看懂」。

v1 只重设计了 Settings tab。其余三个 tab 仍是初版形态：

- **待审**：SelectList 两行，只给 `kind · bank` + 内容前 80 字，缺 rationale / 证据 / 时间 / 冲突状态
- **最近**：单行拼接 `动作 · 类型 · 库 · 状态 · 时间戳`，无对齐、无状态区分
- **状态**：`JSON.stringify` 后逐行 dump，用户要自己在大括号里找数字

同时补一项 v1 遗漏的兼容能力：面板边框用 `╭╮╰╯─│`，在非 UTF-8 终端下会碎成乱码。

## 2. 上游输入

- wireframe 版本：无（本版直接起稿，见 `DELTA.md`）
- 上一版：`v1`（Settings tab 字段分组重构）
- 差异登记：见同目录 `DELTA.md`

## 3. 页面清单

单页原型 `current/index.html`（`meta.type: spa`），4 个页面容器 + hash 路由。

| 短码 | page id | 中文名 | route | 优先级 | v2 形态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| P1 | pending | 待审 | `#/pending` | P0 | 左右分栏：候选列表 + 详情面板 |
| P2 | recent | 最近 | `#/recent` | P1 | 对齐表格 + 状态符号 |
| P3 | settings | 设置 | `#/settings` | P1 | 保持 v1（5 组 20 项 + 折叠），改静态骨架 |
| P4 | status | 状态 | `#/status` | P0 | 指标卡 + 占用条 + sparkline + 原始快照 |

## 4. 交付形态

- [x] 78 列 × 20 行字符网格（`COLS = 78` / `BODY_ROWS = 15` / `INNER = 76`）
- [x] 自包含 HTML（内联 CSS/JS，无构建、无依赖、零外部请求）
- [x] 状态覆盖：正常 / 空 / 加载 / 错误 / 窄终端 40 列 / ASCII 降级
- [x] 每 tab 各自的窄终端降级形态

## 5. 主题与语言

- 配色来源：`/Users/felix/c6x_local/app-prd/xpi-memo/THEMES.md`（shadcn oklch token，禁止硬编码 hex）
- 主题：默认暗色（`<html class="dark">`），页内可切换
- 语言：默认 `zh-CN`，页内可切换 `zh-CN` / `en`
- 保留 v1 偏离记录：现役面板文案硬编码英文，原型默认 `zh-CN`，落地时跟随 `config.language`

## 6. termcn 采纳清单

调研结论见交付报告。采纳三类资产：

| 资产 | 来源 | 采纳方式 |
| :--- | :--- | :--- |
| ASCII 降级表 | `registry/bases/ink/lib/terminal-symbols.ts` | 移植 `toAsciiComponentText` / `resolveStatusSymbol` 语义，原型内实现 |
| 组件视觉规格 | `key-value` / `badge` / `panel` / `tabs` / `status-message` | 只借规格（列对齐、分隔线、状态符号），不借代码 |
| 字符画规格 | `gauge` / `dither-sparkline-utils` | 占用条 + 事件量 sparkline |

**不采纳**：

- 组件本体（344 个）—— React/Ink/OpenTUI 运行时，与 pi-tui 命令式 `render(width): string[]` 不兼容
- 40+ 主题 —— hex 色板，低于现有 oklch token 体系
- `lib/terminal-text.ts` —— 与 pi-tui 内置 `truncateToWidth` / `visibleWidth` 重复

## 7. 各 tab 的信息层级

### 7.1 待审（分栏，P1）

```
│ 候选 (3)        │ 详情                                    │
│ ▸记忆 · 2h ⚠    │ 类型: 记忆                              │
│  记忆 · 1d      │ 库: xpi-memo                            │
│  约束 · 3d      │ 时间: 2 小时前                          │
│                 │ 证据: 用户原话                          │
│                 │ 理由: 用户明确陈述为长期偏好            │
│                 │ 内容: 优先用第一性原则分析问题…         │
```

- 左栏 26 列：`符号 · 类型 · 相对时间 · 冲突标记`；右栏 49 列：字段名 + 值
- 焦点在左栏；↑/↓ 换候选，右栏即时跟随
- Enter 打开动作菜单（存入 / 拒绝 / 稍后），复用现役 `chooseCandidateAction`
- 详情字段顺序：类型 → 库 → 时间 → 证据 → 理由 → 内容

### 7.2 最近（表格，P2）

```
│ 动作      类型  库        状态      时间    │
│ ✓ 存入    记忆  xpi-memo  stored    14:22   │
│ ○ 待审    约束  xpi-memo  pending   14:05   │
│ ✗ 拒绝    记忆  global    rejected  13:51   │
│ ⚠ 降级    记忆  xpi-memo  degraded  13:40   │
```

- 5 列固定宽度：动作 10 / 类型 6 / 库 12 / 状态 10 / 时间 8（+ 符号 2 列）
- 状态符号：`✓` stored/hit · `○` pending · `✗` rejected · `⚠` degraded · `·` 其他
- 状态色：success / warning / error / dim 四个语义 token

### 7.3 状态（指标卡 + 字符画，P4）

```
│ ┌─ 库 ─────┐ ┌─ 记录 ──┐ ┌─ 磁盘 ────┐ ┌─ 今日 ─┐ │
│ │ xpi-memo │ │ 166    │ │ 420.5 KB │ │ +14    │ │
│ └──────────┘ └────────┘ └──────────┘ └────────┘ │
│ 今日事件  ████████████░░░░░░░░  62%              │
│ 近 7 日   ▁▂▃▅▇▆▄                                │
│ 召回 hybrid · 后端 ripgrep · 嵌入 不可用          │
│ ── 原始快照 (↓ 滚动) ──────────────────────────  │
│ "retrieval": { "mode": "fts5" }                  │
```

- 4 个指标卡，各 17 列（76 ÷ 4 减 2 列间隔）
- 占用条 = 今日事件量 / 近 7 日峰值，20 格
- sparkline = 近 7 日每日事件量，8 级 `▁▂▃▄▅▆▇█`
- 原始 JSON 保留在下方，可滚动 —— 降级为次要信息，不删除

### 7.4 设置（P3）

保持 v1 视觉：5 组 20 项、组头可折叠、三列（标签 / 当前值 / 备注）、详解区恒 2 行。
本轮只把渲染方式从 `innerHTML` 重绘改为静态骨架 + 文本更新。

## 8. ASCII 降级

新增 config 字段 `asciiFallback: "auto" | "always" | "never"`（默认 `auto`）。

- `auto`：读 `LANG` / `LC_ALL` / `TERM`，非 UTF-8 则降级
- `always` / `never`：用户强制

符号映射（`toAsciiComponentText` 语义）：

| Unicode | ASCII | Unicode | ASCII |
| :--- | :--- | :--- | :--- |
| `╭╮╰╯` | `+` | `▸ ▾` | `> v` |
| `─ ━` | `-` | `✓ ✗ ⚠ ℹ` | `v x ! i` |
| `│ ┃` | `\|` | `● ○ ·` | `* o -` |
| `█ ░ ▒ ▓` | `# . + #` | `▁▂▃▄▅▆▇█` | 降级为 `#` 计数条 |

sparkline 在 ASCII 下退化为计数条（`##---`），不做 8 级近似 —— 8 级字符画在 ASCII 里没有可读替身。

## 9. 窄终端（40 列）

每个 tab 各自定义降级形态：

| tab | 40 列降级 |
| :--- | :--- |
| 待审 | 分栏取消 → 单栏列表；详情字段内联到选中行下方 2 行 |
| 最近 | 表格 → 两列（符号+动作 / 库+时间）；类型与状态并入动作行 |
| 设置 | 沿用 v1（三列 → 两列，隐藏备注列） |
| 状态 | 指标卡 4 → 2；占用条 20 格 → 12 格；sparkline 隐藏 |

## 10. 渲染架构（v2 新增，本轮闸门后补）

v1 的 body 是整块 `innerHTML` 替换：

```js
el.body.innerHTML = renderBodyLines().join("");
```

这有两个后果，v1 因为字典为空没有暴露，v2 必须解决：

1. `semantic_ui_map_annotate` 注入的 `data-semantic-badge` 会被每次重绘冲掉，徽标一个都留不下
2. HTML `id` 全是运行时生成，静态 HTML 里不存在，工具无从匹配

**v2 改为静态多容器 + hash 路由**：

- 4 个 `<div class="page" id="page-<pageId>">` 静态存在，非活动容器 `display: none`
- 路由 `#/<page.route>`；`hashchange` 驱动切换，首帧前从 `location.hash` 恢复
- JS 只更新 `textContent` 与 `display` / class，不替换容器 `innerHTML`
- 折叠态用 `display: none` 而非删除 DOM —— 徽标随之保留
- 依据：skill §8.5 SPA 路由契约要求「非活动页面容器必须 `display: none`」，
  容器静态存在是该契约的前提

代价：v1 的 1025 行要改成静态骨架，预计约 1500 行。Settings tab 一并迁移。

## 11. 成功标准

- [x] 待审 tab 一屏内能看到候选的 rationale 与证据，不需要打开动作菜单
- [x] 最近 tab 的动作/状态一眼可辨，不需要逐字读
- [x] 状态 tab 的核心数字（库 / 记录 / 磁盘 / 今日）不滚动即可见
- [x] ASCII 降级开启后，78 列边框仍严格对齐、无乱码字符
- [x] 4 个 tab 在 40 列下均不溢出、不折断中文
- [x] 4 个路由可达且刷新后停留在同一 tab
- [x] 暗色为默认，亮/暗与中/英切换可用且首帧不闪烁
- [x] 无硬编码色值；所有颜色可在 THEMES.md 找到出处
- [x] `current/index.html` 零外部网络请求
- [x] 尊重 `prefers-reduced-motion`；焦点可见；正文对比度 ≥ 4.5:1
- [x] 可修改元素的 HTML `id` = 字典短码（47/47 命中，零重复）
- [ ] `semantic_ui_map_annotate` 命中 —— **未达成**：该工具只认 `pages/<pageId>/<kind>/` 多页面模型，本原型是阶段兼容视图（`hifi/current/`），两次尝试（纯锚点、带文件路径）都返回「已标注 0 个文件」。字典与 `id` 已对齐，徽标未注入。

## 12. 视觉修订（v2 之后，未存版本）

用户在 v2 预览后提出三条问题，本轮只改 `current/`，**未调 `prototype_snapshot`**，
因此版本链上仍是 v2 —— 需要回滚就回 v2。

### 13.1 诊断：两条根因

| 症状 | 根因 |
| :--- | :--- |
| 段落 / 分组 / 模块行间距全一样，挤在一起 | 全文只有 `--term-row-h: 20px` 一个刻度，且行间**没有任何空行** |
| 最近页很宽、设置页拥挤 | body 高度对所有 tab 写死 15 行 —— 最近只有 6 行内容（空 9 行），设置 11 行内容（只空 4 行）。同一个写死值造出两种相反的症状 |
| 底部 info bar 与 help 行同距同色 | 三行紧贴，无模块间距，色阶也只有 muted / dim 两级 |

### 13.2 三级间距

| 层级 | 间距 | 落在哪 |
| :--- | :--- | :--- |
| 模块级 | 1 空行 | 内容区 ↔ 详解区 ↔ info bar ↔ help 行；状态页卡片 ↔ 条/图 ↔ 召回 ↔ 快照 |
| 分组级 | 1 空行 | 设置页 5 组之间 |
| 条目级 | 0 | 组内字段、表格行 —— **保持紧凑，这是对的** |

间距是**真实的一行**（`flatRows()` 里 `type: "gap"`），不是 CSS margin。
理由：margin 不参与 JS 的行窗口计算，最后几行会被裁掉而不是滚出来。

### 13.3 body 高度按页自适应

`--page-rows` 由 `applyRoute()` 按当前路由写入，`PAGE_ROWS` 是唯一事实来源。

| tab | v2 | 本轮 | 依据 |
| :--- | :--- | :--- | :--- |
| 待审 | 15 | **7** | 右栏 6 个详情字段 |
| 最近 | 15 | **8** | 表头 1 + 分隔 1 + 5 行数据 |
| 设置 | 15 | **19** | 列表 15 + 间距 1 + 详解 2 + 末尾间距 1 |
| 状态 | 15 | **17** | 卡 3 + 间 1 + 条 1 + 图 1 + 间 1 + 召回 1 + 标题 1 + 快照 7 + 末尾 1 |

面板总高：15 / 16 / 27 / 25 行。**设置与状态变高**，因为内容确实更多；
现役用一个高度糊住两种页，是问题本身。

**落地代价**：现役 `console.ts` 的 `panelLayout()` 用固定高度 + 固定 `PANEL_CHROME_ROWS`，
改成按页自适应要动它，并同步 `TUI-DESIGN.md` 的 `panelHeight: 24`。

### 13.4 底部三层分离

```
   … 内容区 …
                      ← 模块间距 1 行
   L0 会话轨迹 → T1 …  ← info bar（muted）
   库: xpi-memo · 总数…  ← info bar（muted）
                      ← 模块间距 1 行
   ←/→ 切页 · ↑/↓ 移动…  ← help（dim，最弱）
```

色阶同步分层：内容 `foreground` > info bar `muted` > help `dim`。

### 13.5 标签栏改成真 tab

> 注：这 4 个标签在面板**顶部第 2 行**（与现役 `console.ts` 一致），不是底部。

```
v2    [待审 3] [最近] [设置] [状态]
本轮    待审 3 │ 最近 │ 设置 │ 状态
         ^^^^^^ 激活项：背景块 + accent 下划线
```

- 激活项背景 `color-mix(in oklab, var(--foreground) 20%, var(--term-panel))` ——
  用 `foreground` 混色而非 `selectedBg`：暗色下变亮、亮色下变暗，两种主题都得到
  明显区别于面板底色的色块。
- 下划线 `box-shadow: inset 0 -2px 0 0 var(--term-accent)` —— tab 的标准暗示。
- 去掉方括号：方括号和背景块表达同一件事，重复了。
- 悬停态 `foreground 8%` 混色。

**落地限制**：`ThemeBg` 只有 7 个语义位（`selectedBg` / `searchMatchBg` /
`userMessageBg` / `customMessageBg` / `toolPendingBg` / `toolSuccessBg` / `toolErrorBg`），
**没有通用 muted 背景位**，所以背景只用在 tab 上；组头改用字重 + 色阶加强。
这是接口限制，不是取舍。

### 13.6 组头与详解区

- 组头：`accent` 箭头 + `bold` 组名 + `dim` 计数（v2 已是，本轮保留）。
- **详解区在组头行不再留空**：改为显示该组的一句话作用与规模（`zhDetail` / `zhChoice`）。
  原因：留空会在列表底部露出 3 行空洞，看起来像布局断裂而不是留白。
  只有真正的间距行才留空。

### 13.7 最近页表头分隔线

表头下加一行 `─` 跨满 6 列（`.td-divider`）。只靠 `dim` 色区分表头与数据太弱。

### 13.8 未落地的一项

**组头背景带**：因 `ThemeBg` 无通用背景位，未做。若后续 pi 主题接口扩展，
可用 `toolPendingBg` 一类语义位近似，但语义不对，不推荐硬凑。
## 13. 未决问题

1. **磁盘占用条的分母**：现役无「配额」概念，占用条改用「今日事件量 / 近 7 日峰值」。
   若落地时引入配额，分母随之替换。
2. **`asciiFallback` 是否入 config**：新增字段会进 `XpiMemoConfig` 的 19 → 20 项，
   Settings tab 的「界面与反馈」组要从 3 项变 4 项。落地时确认。
3. **待审 tab 的搜索**：现役 SelectList 支持过滤。分栏后左栏是否保留 `/` 搜索待定，
   原型暂不实现。
4. **sparkline 数据源**：现役 `MemoryStatus` 无「近 7 日事件量」聚合字段，
   需要按 `recentEntries[].timestamp` 现算，或新增聚合字段。原型用演示数据。
5. **v1 遗留**：未暴露字段缺 `XPI_MEMO_*` 变量名、`sleepMode` 中文标签 —— 沿用 v1 处理，本轮不展开。
6. **THEMES.md 没有 success / warning 语义色**：状态符号的成功态复用 `muted`、警告态复用 `accent`（primary 的橙红色系），拒绝态用 `destructive`。
   若落地时需要真正的绿 / 黄，要先扩展 THEMES.md，而不是在原型里自造色值。
7. **`semantic_ui_map_annotate` 不适用于阶段兼容视图**：见 §11 最后一条。
   徽标系统（CSS + 右上角开关）本轮未注入；元素身份仍由字典与 HTML `id` 的 47 处对齐保证。
