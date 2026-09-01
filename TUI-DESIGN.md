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
  title: "XpiMemo Status Inspector"
  frameless: true
  background: "#0d1117"
  textPrimary: "#c9d1d9"
  accent: "#58a6ff"
  successBadgeBg: "#1f3526"
  successBadgeText: "#3fb950"
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
  preferredWidth: 78        # 默认面板宽度 (列)
  minWidth: 40              # 窄终端最小宽度
  panelHeight: 20           # 默认固定高度 (行)
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

---

## 4. Do's & Don'ts 规则清单

### Do's (强制实践)

- ✅ Glimpse 必须使用依赖注入与路径安全解析，杜绝写死个人开发机路径。
- ✅ TUI 模式必须使用 `truncateToWidth` 进行宽度处理，确保无论带不带 ANSI 配色，右边框 `│` 都在同一列对齐。
- ✅ TUI Overlay 配置必须使用 `anchor: "center"` 与 `margin.bottom >= 4`，保证弹窗远离输入提示区。
- ✅ 统一支持 `Esc` 与 `Enter` 快捷键退出。

### Don'ts (禁止项)

- ❌ **严禁使用 `anchor: "bottom-right"` 配合负数 offset**，这会导致弹窗压住输入框。
- ❌ **严禁在 HTML 拼接中直接注入未转义的字符串**。
- ❌ **严禁使用 `string.length` 裸计算终端带格式文本的填充空格数**。
