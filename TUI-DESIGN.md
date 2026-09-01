# TUI-DESIGN.md — Pi Extension TUI 视觉设计契约

> 本文件规定本扩展所有终端界面 (TUI / Terminal User Interface) 的设计原则、字符令牌 (Tokens)、排版层级与 Do's & Don'ts 规则。
> 所有 Agent 在新增或修改 `ctx.ui.custom()` / TUI 面板前必须遵循本文件。

## 1. 设计哲学 (Design Philosophy)

1. **信息分层优先**: 核心指标置顶一目了然，次要/底层调试数据折叠或下沉。
2. **结构化胜于原始数据**: 严禁直接在带框面板中 dump 原始多行 JSON 字符串；必须提取并格式化为人类易读的 Key-Value 网格或分块。
3. **字符对齐防御**: 针对中英文字符宽度差异做好 padding 裁剪与边界保护，杜绝边框被撑破或错位。
4. **统一控制与关闭约定**: 所有浮层面板均需统一支持 `Esc` / `Enter` 退出与 `↑`/`↓` / `PageUp`/`PageDown` 滚动。

## 2. 字符与色彩令牌 (Tokens)

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
  warning: "warning"        # 警告/注意 (如暂停中、任务阻塞)

dimensions:
  preferredWidth: 84        # 默认面板宽度 (列)
  minWidth: 40              # 窄终端最小宽度
  panelHeight: 22           # 默认固定高度 (行)
  maxHeight: "75%"          # 屏幕占用最大高度比
```

## 3. 面板标准分层结构 (Standard Layout Pattern)

所有悬浮状态/详情面板均遵循以下 4 级垂直结构：

```
╭─ [Title] ────────────────────────────────────────── [Status Badge] ─╮ (Header: 标题与状态)
│                                                                     │
│  [KEY-VALUE GRID: 2列或3列核心指标]                                  │ (Section 1: 核心指标)
│  Scope: xpi-memo (project)          Active Engine: ripgrep          │
│  Records: 38 (proj) / 128 (glob)    Disk / Today:  420.5 KB / +14   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤ (Divider: 分割线)
│ Detailed Snapshot: (scrollable rows)                                │ (Section 2: 详情区)
│   "retrieval": { "mode": "fts5", "embeddingAvailable": false }     │
│   "storage": { "dataDir": "~/.pi/agent/xpi-memo", "audit": true }   │
╰─ ↑/↓ scroll · Esc / Enter close ────────────────────────────────────╯ (Footer: 操作提示)
```

## 4. Do's & Don'ts 规则清单

### Do's (推荐实践)
- ✅ 顶部 Header 包含醒目的状态点（如 `● on` 或 `○ paused`）。
- ✅ 核心状态采用对齐的 2 列 Key-Value 格式，突出重点字段。
- ✅ 底部 Footer 明确标注可用快捷键提示（如 `↑/↓ scroll · Esc close`）。
- ✅ 单行文本超出列宽时使用安全切片与 `padEnd` 填充，确保右边框始终对齐。

### Don'ts (禁止项)
- ❌ **禁止直接 dump 原始 JSON** 填满整个面板而不做关键信息提取。
- ❌ **禁止硬编码单一固定列宽**导致在窄终端上渲染崩溃或产生折行错位（必须基于 `Math.max(width - 2, 1)` 计算）。
- ❌ **禁止在单行内塞入 5 项以上不同维度的指标**，造成视觉拥挤与难以阅读。
