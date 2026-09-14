# PI交互式面板笔记

1. **结论**：图中蓝色边框浮动面板**不是 pi 内置组件**，它来自社区扩展 **`pi-interactive-shell`**（nicobailon 开发）[[1]]。面板内那行 `pi-lens ✓ clean` 只是**子会话**里另一个扩展 `pi-lens`（实时代码反馈：LSP/lint）渲染的状态行，与面板本身无关[[10]]。
2. **如何复刻**：该面板底层依赖的是 pi 原生扩展 API 中的**实验性 Overlay 模式**（`ctx.ui.custom(..., { overlay: true })`）+ `@earendil-works/pi-tui` 组件库；而“嵌入一个真实终端”则额外用了 **PTY（Pseudo Terminal，伪终端）+ `@xterm/headless` 终端仿真**的管线[[1]]。
3. **原生交互面**：pi 原生只提供“内联式”UI（editor、footer、widget、全屏替换组件、SelectList 类对话框、`/tree` 会话树等），**没有任何自带浮动面板**——浮动能力完全由 Overlay API 提供。

---

### 一、面板身份鉴定（证据链）

| 截图线索 | 对应 `pi-interactive-shell` 特征 |
| :--- | :--- |
| 工具调用名 `interactive_shell`、`Session dispatched (id: deck-run)` | 该扩展注册的 LLM 工具名即 `interactive_shell`，支持 dispatch 模式[[1]] |
| 底部提示 `Type to take over • Ctrl+T transfer • Ctrl+B background` | 与其键位表完全一致：Ctrl+T 捕获输出回传主 agent、Ctrl+B 转后台、任意键接管[[40]] |
| `SHELL FOCUSED` / `Hands-free (50s)` | 对应其 interactive / hands-free / dispatch 三种会话模式[[41]] |
| 面板内运行 `pi '/deck-plan ...'`（PID 64941） | 该扩展的典型用法：在 overlay 中 spawn 一个**嵌套 pi 子 agent**[[37]] |

其渲染管线为：`interactive_shell → zigpty(PTY) → 子进程 → xterm-headless（终端仿真）→ TUI overlay（由 pi 渲染）`[[1]]。也就是说：**蓝色边框 = overlay 组件的 frame；面板内容 = headless xterm 仿真出的 ANSI 屏幕快照**。

---

### 二、开发 pi-package 时引入“独立浮动面板”的路径

按第一性原则拆成两层能力，按需组合：

#### 层 1：浮动容器（原生 API，实验性）
`ctx.ui.custom()` 传 `{ overlay: true }` 即可把任意组件渲染为**悬浮模态面板**，不清屏、可锚定九宫格位置、可按百分比设宽高[[26]]：

```typescript
// extensions/my-panel.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Container, Text, matchesKey, Key } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("panel", {
    description: "Open a floating panel",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => {
          const box = new Box(1, 1, (s) => theme.bg("selectedBg", s));
          box.addChild(new Text(theme.fg("accent", "MY PANEL"), 0, 0));
          box.addChild(new Text("esc to close", 0, 0));
          return {
            render: (w) => box.render(w),
            invalidate: () => box.invalidate(),
            handleInput: (d) => {
              if (matchesKey(d, Key.escape)) done();
              tui.requestRender(); // 状态变更后必须手动请求重绘
            },
          };
        },
        {
          overlay: true,
          overlayOptions: { anchor: "center", width: "95%", maxHeight: "60%", margin: 2 },
          onHandle: (h) => h.focus(), // 可编程控制 focus/隐藏/销毁
        },
      );
    },
  });
}
```

#### 层 2：嵌入真实终端（可选，复刻 pi-interactive-shell 的杀手锏）
若你要在面板里跑**子进程 TUI**（如嵌套 pi、vim、交互式 CLI），照抄其管线：用 PTY 库（zigpty/node-pty）spawn 子进程，接 `@xterm/headless` 做终端仿真，把仿真出的字符屏幕作为 overlay 组件的 `render()` 输出[[1]]。纯展示卡片/决策面板则**不需要**这层，直接用 `Box/Text/Markdown/SelectList` 组合即可。

#### 工程注意事项（边界试探）
- **生命周期**：overlay 组件 close 后即 disposed，不可复用引用，重开必须 new 新实例。
- **行宽契约**：`render(width)` 每行不得超过 `width`，用 `truncateToWidth/visibleWidth` 处理。
- **主题失效**：预烘焙 `theme.fg()` 的缓存字符串必须在 `invalidate()` 里重建，否则换主题后花屏。
- **键位冲突**：接管全局按键前用 `keybindings` 管理器检查，避免吞掉 `escape/ctrl+c` 等 app 级快捷键。
- **可回滚**：overlay 仍标记 experimental，建议把面板逻辑隔离在独立 extension 文件，出问题可单独卸载。

---

### 三、pi 原生面板 / 交互面清单

| 类别 | 原生能力 | 说明 |
| :--- | :--- | :--- |
| 输入面 | Editor 输入框 | 可用 `setEditorComponent` 整体替换（如 vim 模态编辑） |
| 状态面 | Footer / Status | `setFooter`、`setStatus`（footer 插槽） |
| 内联面板 | Widget | `setWidget` 在 editor 上/下方挂持久内容块（todo、进度条常用） |
| 全屏替换 | `ctx.ui.custom()`（无 overlay） | 临时用你的组件**替换** editor，`done()` 返回——SelectList 对话框、SettingsList、BorderedLoader 均基于此 |
| 浮动面板 | `ctx.ui.custom({overlay:true})` | 实验性，即蓝色面板的地基 |
| 内置对话框 | `/model`、`/theme`、session picker 等 | SelectList 实现的选择器 |
| 会话树 | `/tree` | 导航 JSONL 会话树、可 summarize 废弃分支，是 pi 的招牌原生交互面[[52]] |
| 工具渲染 | `renderCall/renderResult` | 自定义工具调用/结果的行内展示 |
| 加载态 | Working indicator / BorderedLoader | compaction、retry 的内置 loader |

**一句话总结**：pi 的哲学是“内核极简、UI 全可扩展”。你截图里的面板是生态扩展（`pi-interactive-shell`）对原生 Overlay API 的极致运用；做 pi-package 时，`overlay: true` + `pi-tui` 组件就是官方给你的“独立面板”入口。若后续要把它映射到你的 WebUI 架构，TUI overlay 对应前端的模态卡片，`interactive_shell` 的 dispatch/attach 语义可直接翻译为 WebSocket 的 session 事件协议。
