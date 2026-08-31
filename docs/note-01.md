# 调研笔记

## pi-memory 与 mnemosyne

**问题-1**:
解读: https://github.com/jayzeng/pi-memory (包括采用了哪些核心模块/记忆逻辑/组件/harness等)

**回复-1**:

### TL;DR (结论优先)
**`jayzeng/pi-memory` 是目前 Pi 生态中将“Markdown 数据主权”、“KV Cache 物理优化”与“生命周期 Hook”结合得最优雅的工业级参考实现。**

它完美印证了你此前确立的“反臃肿”与“按需加载”哲学，并为你正在开发的 `memoharness` 提供了一个极具价值的架构范本：**它证明了“使用生命周期 Hook”与“保持系统被动/反臃肿”并不矛盾。** 它的核心智慧在于：**将 Hook 用于“状态持久化 (Handoff)”与“缓存管理 (KV Cache Snapshot)”，而非用于“每轮的隐式 LLM 检索”。**

以下是对其核心模块、记忆逻辑的深度拆解，以及对你自研扩展包的降维启发。

---

### 一、 核心架构与组件拆解：极简主义的胜利

`pi-memory` 没有引入任何沉重的数据库（如 SQLite/PostgreSQL）或内置向量引擎，而是将“文件系统 + 外部 CLI 工具”的组合发挥到了极致。

#### 1. 存储层：纯 Markdown 文件系统 (Markdown-Native)
*   **组件**：`MEMORY.md` (长期事实/决策)、`daily/YYYY-MM-DD.md` (每日追加日志)、`SCRATCHPAD.md` (临时待办)。
*   **架构师视角**：彻底放弃结构化数据库，回归纯文本。这不仅保证了 100% 的数据主权（用户可直接用 `cat` 或 Obsidian 查看/修改），还让记忆库天然具备了 Git 版本控制的能力。

#### 2. 检索层：外部 CLI 代理 (`qmd`)
*   **组件**：将语义搜索 (Vector)、关键字搜索 (BM25) 和混合重排 (Reranking) 全部外包给外部工具 `qmd` (由 Shopify CEO Tobi Lütke 开发的极简本地搜索 CLI)。
*   **架构师视角**：**极致的解耦 (Decoupling)**。扩展包本身不包含任何 Embedding 模型或向量索引逻辑，保持了 TS 代码的极度轻量。如果 `qmd` 未安装，核心读写工具依然完美运行（Graceful Degradation，优雅降级）。

#### 3. 注入层：KV Cache-Stable Snapshot (KV 缓存稳定快照) 🌟核心亮点
*   **机制**：这是该项目**最具技术含量的设计**。为了避免每轮对话重新计算 System Prompt 导致的 KV Cache 失效（这会造成巨大的 Token 浪费和延迟），它在特定的 Checkpoint（如 `session_start`, `session_before_compact`, 长期记忆写入时）生成内存快照，并在回合之间**保持字节级稳定 (Byte-stable)**。
*   **架构师视角**：它从**底层物理机制**上解决了“自动注入导致上下文爆炸”的难题。它证明了：只要保证注入内容的字节稳定性，自动注入就不会破坏 LLM 的 Prompt Cache。

---

### 二、 记忆逻辑与事件流转 (Event Flow)

`pi-memory` 的流转逻辑完美诠释了“何时该主动，何时该被动”：

1.  **写入 (Write)**：**完全被动**。依赖 Agent 显式调用 `memory_write` 工具，或者在会话结束 (`session_shutdown`) 时由 LLM 生成一次低成本的 Exit Summary。**绝无后台自动提炼。**
2.  **交接 (Handoff)**：**利用 Hook 自动触发**。当 Pi 原生触发上下文压缩 (`session_before_compact`) 时，扩展自动将当前的 Scratchpad 和最近的 Daily Log 打包成一条 Handoff 记录，写入当天的日志。这确保了长会话在压缩后**不丢失核心进度**。
3.  **召回 (Recall)**：**默认按需，可选自动**。
    *   **默认模式 (`stable`)**：Agent 需要时主动调用 `memory_search`。注入到 System Prompt 的内容是固定的快照，不随每轮 Prompt 变化。
    *   **可选模式 (`per-turn`)**：每轮根据用户的 Prompt 自动搜索并注入 Top-3 结果（官方文档明确警告：这会破坏 KV Cache，仅作为 Legacy 兼容选项保留）。

---

### 三、 对你开发 `memoharness` 的降维启发 (Actionable Insights)

结合你之前关于“选项 A (Library-only) vs 选项 B (Keep Pi-lifecycle)”的纠结，`pi-memory` 提供了一个**完美的第三条道路**：

#### 启发 1：重新定义“生命周期 Hook”的用途
你之前担心使用 Hook 会导致“每轮自动召回”的臃肿。`pi-memory` 告诉你：**Hook 不应该用来做“检索 (Recall)”，而应该用来做“持久化 (Persist)”和“缓存控制 (Cache Control)”。**
*   **借鉴方案**：在你的 `memoharness` 中，放心使用 `session_before_compact` Hook。当 Pi 准备压缩上下文时，触发你的 `memoharness_save_handoff` 逻辑，将当前会话的关键状态（Event Log 摘要）持久化到磁盘。这既不消耗 Token，又保全了事件溯源的完整性。

#### 启发 2：引入“KV Cache 稳定快照”机制
如果你决定在 System Prompt 中注入一些“全局项目规范”或“用户核心偏好”，**千万不要每轮动态拼接**。
*   **借鉴方案**：在 `session_start` 时读取一次核心记忆，生成一个固定的字符串块（Snapshot），并在后续的所有回合中**原封不动**地注入这个块。这样 LLM 提供商（如 Anthropic/OpenAI）的 Prompt Cache 就能完美命中，你的延迟和成本将大幅降低。

#### 启发 3：将“搜索”与“存储”物理隔离
不要在你的 TS/Python 扩展中引入 `sqlite-vec` 或 `lancedb` 等重型依赖。
*   **借鉴方案**：学习 `pi-memory`，将底层存储降级为纯 JSONL 或 Markdown（契合你的事件溯源理念），将检索能力外包给成熟的 CLI 工具（如 `ripgrep` 做全文检索，或调用本地的 `qmd`/`memvid`）。让你的扩展包保持纯粹的“逻辑路由层”属性。

---

### 四、 最终选型与演进路线图

`pi-memory` 是一个极其优秀的“前辈”，你不需要重复造轮子，而是应该**站在它的肩膀上，叠加你的“事件溯源 (Event Sourcing)”理念**。

| 维度 | `pi-memory` 的做法 | 你的 `memoharness` 演进方案 |
| :--- | :--- | :--- |
| **底层存储** | 离散的 Markdown 文件 (MEMORY.md, daily/) | **Append-only JSONL 事件日志** (更契合代码执行的轨迹追踪) |
| **上下文注入** | 固定的 Markdown 文本块 (KV Cache 稳定) | **固定的“当前会话状态摘要”块** (由事件日志动态派生，但每轮保持字节稳定) |
| **检索引擎** | 依赖外部 `qmd` CLI | 依赖外部 `ripgrep` (快) 或 `mnemosyne` (深) |
| **生命周期** | 压缩时写入 Handoff 日志 | 压缩时**触发事件日志的快照落盘 (Snapshotting)** |

**架构师建议**：
1.  **立刻阅读 `pi-memory` 的 `index.ts`**：重点研究它是如何实现 `isExitSummaryEmpty()` (防止垃圾写入) 和 `KV cache-stable snapshot` (缓存稳定) 的。这两段代码是 Pi 扩展开发的“黄金法则”。
2.  **确立你的 v1 边界**：坚持你之前选择的 **Library-only (选项 A)**。你的 `memoharness` 核心库只负责“事件记录与派生策略”。至于如何将这些派生结果“稳定地”注入到 Pi 的 Prompt 中，可以参考 `pi-memory` 的快照机制，在后续的 v2 版本中通过 Pi 的 Hook 优雅接入。

**总结**：`pi-memory` 证明了在 Pi 生态中，**“克制”才是最高级的智能**。它没有试图用 LLM 去“理解”一切，而是用严谨的缓存机制和文件系统接管了所有确定性的工作。这正是你的 `memoharness` 应该追求的工程美学。
