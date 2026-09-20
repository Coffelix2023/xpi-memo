# TUI-DESIGN.md — Pi Extension 视觉设计与双轨契约

> 本文件规定本扩展所有状态面板与界面的设计原则、Tokens、排版层级、双轨呈现策略与 Do's & Don'ts 规则。
> 所有 Agent 在新增或修改 `ctx.ui.custom()` / Glimpse 微窗口前必须严格遵循本文件。

---

## 1. 呈现哲学与双轨策略 (Dual-Track Architecture)

1. **主模式（Glimpse 原生独立浮动窗口）**:
   - 当系统环境支持 Glimpse 时，优先调起尺寸严格为 **800×600** 像素的居中原生微窗口。
   - 界面采用高保真 Dark 风格：顶部状态胶囊 + 4 宫格核心指标卡片 + 可滚动 JSON 诊断区 + 底部操作栏。
   - 所有动态字符串必须经过 HTML 转义防护。

2. **降级模式（Pi TUI 纯终端居中 Modal）**:
   - 当 Glimpse 不可用或纯 SSH 远程环境时，平滑降级至 Pi TUI 原生浮层。
   - 必须设置 `anchor: "center"` 严格垂直水平居中，且设置 `margin: { top: 2, bottom: 4, left: 2, right: 2 }`，**坚决杜绝侵入或覆盖底部对话输入框**。
   - 每行渲染使用 `@earendil-works/pi-tui` 的 `truncateToWidth` 进行字符截断与填充，消除 ANSI 转义引起的边框对齐错位。

---

## 2. 视觉令牌与参数规范 (Design Tokens)

### A. Glimpse 原生窗口 Tokens

```yaml
window:
  width: 800
  height: 600
  title: "XpiMemo T1 Console"
  frameless: true
# 颜色不在此处定义。窗口的每一处颜色都取自 <项目根>/THEMES.md 的语义令牌
# (:root / .dark 两套 oklch)，运行期副本在 src/glimpse/tokens.ts，并由
# src/glimpse/tokens.test.ts 断言与 THEMES.md 完全一致。
#
# 本节曾经内联 background / textPrimary / accent / successBadge* 五个色值，
# 与 THEMES.md 构成两处真相；已删除，避免下一个人照旧值写新代码。
#
# 一个例外值得记住：THEMES.md 没有 success / warning 语义色。窗口的成功态复用
# muted、警告态复用 accent（与 TUI 轨同一处理）。若要真绿/真黄，先扩展
# THEMES.md，不要在这里加色值。
```

### B. Pi TUI 字符终端 Tokens

```yaml
borders:
  style: "rounded"
  topLeft: "╭"
  topRight: "╮"
  bottomLeft: "╰"
  bottomRight: "╯"
  horizontal: "─"
  vertical: "│"
  dividerLeft: "├"
  dividerRight: "┤"

palette:
  accent: "accent"          # 品牌主色、激活状态 (如 ● on)
  borderAccent: "borderAccent" # 外层主边框
  muted: "muted"            # 次要信息、字段名称、次级数值
  dim: "dim"                # 弱化提示、分割线、底部按键帮助 (Esc/Enter)

dimensions:
  anchor: "center"          # 必须居中，严禁固定 bottom-right 贴底
  preferredWidth: 94        # 默认面板宽度 (列)，Pi TUI overlay 会按视口夹紧
  minWidth: 40              # 窄终端最小宽度
  panelHeight: 24           # 默认固定高度 (行)
  chromeRows: 8             # /xpi-memo 设置面板的固定 chrome 行数；body = panelHeight - chromeRows
  maxHeight: "70%"          # 屏幕占用最大高度比
  margin:
    top: 2
    bottom: 4               # 关键：留足底部空间，避免遮挡输入提示行
    left: 2
    right: 2
```

---

## 3. 面板标准分层结构 (Layout Pattern)

无论是 Glimpse 窗口还是 TUI 终端模式，统一遵循以下 4 级垂直信息架构：

```text
╭─ [Title: XpiMemo Status] ────────────────────────── [Badge: ● on] ─╮ (Header: 标题与状态)
│                                                                     │
│  [KEY-VALUE GRID: 2列或4列核心指标]                                  │ (Section 1: 核心指标)
│  Scope: xpi-memo (project)          Backend: ripgrep                │
│  Records: 38 proj / 128 glob        Disk/Today: 420.5 KB / +14      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤ (Divider: 分割线)
│ Detailed Snapshot: (scrollable rows)                                │ (Section 2: 详情诊断区)
│   "retrieval": { "mode": "fts5", "embeddingAvailable": false }     │
│   "storage": { "dataDir": "~/.pi/agent/xpi-memo", "audit": true }   │
╰─ ↑/↓ scroll · Esc / Enter close ────────────────────────────────────╯ (Footer: 操作提示)
```

### `/xpi-memo` 设置面板的固定 chrome (8 行)

`src/console.ts` 的 `PANEL_CHROME_ROWS = 8`。顺序固定，所以 body 高度永远可预测；
光标的移动只会改变内容，不会让面板跳动。

```text
╭─ xpi-memo · pi 的 DNA 记忆体 / pi's DNA memory ───────────╮  1 顶边框 (内嵌双语标题，不占 body)
│ 待审 2 · 最近 · 设置 · 状态                                │  2 标签栏 (←/→ 的全部目的地)
│  …body…                                                   │  body = panelHeight − 8，下限 3 行
│  召回策略        按价值自动注入       high-value-auto      │
│ Agent 何时自行召回记忆 · 空格切换策略, Enter 保存           │  3 详解第 1 行：作用 · 谁用 · 怎么用
│ 推荐: high-value-auto · active=先问你 · assist=有用才召回   │  4 详解第 2 行：推荐值 + 选项含义
│ L0 会话轨迹 → T1 xpi-memo → T2 延后 → T3 延后              │  5 info bar 1
│ 库: demo · 总数: 7 · 今日: 2 · 待审: 1 · 占用: 4.0 KB      │  6 info bar 2
│ ←/→ 切页 · ↑/↓ 移动 · Space 切换 · Enter 保存 · Esc 关闭    │  7 快捷键行 (dim，与页脚同风格)
╰────────────────────────────────────────────────────────────╯  8 底边框
```

- 标题内嵌顶边框 (TUI 惯例)：标题因此不额外消耗 body 行。
- 快捷键行必须在 info bar 之下、底边框之上，并用 `theme.fg("dim", …)`，与页脚状态行同风格。
- 详解区恒为 2 行：字段行渲染 `detail.<id>` (作用/谁用/怎么用) 与 `choice.<id>` (推荐值 + 每个选项的含义)；
  组头行与非 Settings 页两行皆空，几何不随光标变化。

---

## 4. Do's & Don'ts 规则清单

### Do's (强制实践)

- ✅ Glimpse 必须使用依赖注入与路径安全解析，杜绝写死个人开发机路径。
- ✅ TUI 模式必须使用 `truncateToWidth` 进行宽度处理，确保无论带不带 ANSI 配色，右边框 `│` 都在同一列对齐。
- ✅ TUI Overlay 配置必须使用 `anchor: "center"` 与 `margin.bottom >= 4`，保证弹窗远离输入提示区。
- ✅ 统一支持 `Esc` 与 `Enter` 快捷键退出。
- ✅ Settings 详解行必须解释字段本身（作用 / 谁用 / 推荐值 / 选项含义），禁止直接复用行内 note 文案。

### Don'ts (禁止项)

- ❌ **严禁使用 `anchor: "bottom-right"` 配合负数 offset**，这会导致弹窗压住输入框。
- ❌ **严禁在 HTML 拼接中直接注入未转义的字符串**。
- ❌ **严禁使用 `string.length` 裸计算终端带格式文本的填充空格数**。
