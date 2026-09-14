# 笔记 - `xpi-memo`的记忆数据库目录的讨论

## 议题:
我在结合`mnemosyne`+`pi-memory`的功能特性作为自研的pi专属记忆体, 你作为顶级架构师, 请建议我在记忆的物理存储上如何架构和结构化目录, 比如全局的记忆数据和项目级的数据库是否统一放pi根目录(`~/.pi/agent/memory/`),或者建议全局和项目级分开保存?
参考:
- https://github.com/mnemosyne-oss/mnemosyne
- https://github.com/jayzeng/pi-memory


### 讨论结论参考-01
**必须采用“物理隔离（全局与项目级分离）”的架构。绝对不要将所有数据统一塞进 `~/.pi/agent/memory/`。**

将全局记忆与项目级记忆物理分离，是实现 **Git-Native (团队共享)**、**KV Cache 极致命中**以及**跨项目并发安全**的唯一正解。这不仅是对 `pi-memory` 理念的继承，更是融合 `mnemosyne` 检索能力与 DeepSeek Harness “事件溯源”思想的必然物理形态。

*   **全局记忆 (Global)**：存放在 `~/.pi/agent/memory/`。作为 KV Cache 的“稳定前缀”，极少变动，跨项目共享。
*   **项目记忆 (Project)**：存放在 `<project_root>/.pi/memory/`。作为项目的“数字孪生”，随代码库 Git 提交，实现团队级架构决策与踩坑日志的共享。

---

### 一、 第一性原理：为什么“大一统”是架构灾难？

如果将所有数据放在 `~/.pi/agent/memory/`，你将立刻面临三个无法逾越的物理瓶颈：

1.  **数据主权与 Git 割裂**：项目级的架构决策（ADR）和踩坑日志是**团队资产**。如果它们被锁死在用户主目录的 `~/.pi/` 下，你的同事将无法通过 `git clone` 继承这个项目的“记忆”。这违背了 `ai-memory` 和 `pi-memory` 推崇的 Markdown-Native 与团队共享理念。
2.  **检索噪声污染 (Context Poisoning)**：当你在项目 A 中检索“数据库死锁”时，如果全局库中混杂了项目 B 的死锁日志，LLM 的注意力会被无关上下文稀释，导致生成的修复方案张冠李戴。
3.  **并发写锁灾难 (SQLite Lock)**：如果你同时开启两个 Pi 窗口分别编辑前后端项目，高频的事件溯源（Event Sourcing）写入会让单一的全局 SQLite 数据库陷入疯狂的 `database is locked` 冲突中。

---

### 二、 终极目录结构设计：正交的双层架构

结合 `mnemosyne` (SQLite/向量/FTS5) 与 `pi-memory` (Markdown/Event Log/KV Cache 快照) 的特性，我为你设计了以下生产级目录结构：

#### 1. 全局层 (Global Scope) —— 个人的“长期心智模型”
**路径**：`~/.pi/agent/memory/`
**特性**：跨项目共享、极低频写入、KV Cache 绝对稳定。

```text
~/.pi/agent/memory/
├── MEMORY.md            # 全局长期偏好 (如: 偏好 pnpm, 偏好 Tailwind v4, 代码风格)
├── global.db            # mnemosyne 的全局 SQLite (包含 FTS5 与 sqlite-vec 向量索引)
├── skills/              # 跨项目通用的 SOP (如: "如何配置 Zed-Editor", "Git 提交规范")
│   └── git-conventions.md
└── recovery/            # 全局记忆遗忘操作的安全备份 (JSON)
```

#### 2. 项目层 (Project Scope) —— 项目的“事件溯源与数字孪生”
**路径**：`<project_root>/.pi/memory/`
**特性**：项目独占、高频事件追加、可 Git 版本控制。

```text
<project_root>/.pi/memory/
├── events.jsonl         # 🌟 核心：Append-only 事件溯源日志 (DeepSeek 理念)
                         # 记录 Tool calls, Errors, File edits，不丢失任何执行轨迹
├── MEMORY.md            # 项目级架构决策 (ADR)、特定业务规范
├── daily/               # 每日工作流日志 (pi-memory 理念)
│   └── 2026-08-25.md
├── SCRATCHPAD.md        # 当前项目的临时待办与调试线索
├── project.db           # mnemosyne 的项目级 SQLite (仅索引当前项目的 Markdown 与 Events)
└── .gitignore           # 忽略 project.db, events.jsonl (可选), daily/ (可选)
```

---

### 三、 记忆路由与 KV Cache 注入策略 (核心机制)

物理隔离后，你的扩展包在组装 System Prompt 时，必须实施**分层注入策略**，以榨干 LLM 提供商的 Prompt Cache 红利：

| 注入层 | 数据来源 | 注入位置 | KV Cache 策略 | 更新频率 |
| :--- | :--- | :--- | :--- | :--- |
| **L1: 全局前缀** | `~/.pi/.../MEMORY.md` | System Prompt 最顶部 | **绝对稳定**。几个月不变，完美命中 KV Cache 前缀。 | 极低 (手动或月度提炼) |
| **L2: 项目快照** | `<proj>/.pi/.../MEMORY.md` + `SCRATCHPAD.md` | System Prompt 中部 | **会话级稳定**。采用 `pi-memory` 的 Snapshot 机制，仅在 `session_start` 或显式 `memory_write` 时刷新字节。 | 低 (每会话 1-2 次) |
| **L3: 按需检索** | `events.jsonl` + `project.db` | Tool Result (工具返回) | **不注入 Prompt**。Agent 遇到盲区时，主动调用 `memoharness_recall` 工具获取。 | 高频 (按需触发) |

**架构收益**：这种分层设计确保了 LLM 每次请求的前 2000 个 Token（全局偏好+项目规范）在云端都是**缓存命中 (Cache Hit)** 的，你的 API 账单和首字延迟 (TTFT) 将得到史诗级优化。

---

### 四、 架构师底线与实施规范 (Non-negotiables)

在编码实现这个双层架构时，必须坚守以下工程底线：

#### 1. 严格的 `.gitignore` 规则
项目级目录 `<project_root>/.pi/memory/` 必须配置精准的 Git 忽略规则，以平衡“团队共享”与“本地噪音”：
```gitignore
# <project_root>/.pi/memory/.gitignore

# 必须忽略 (本地运行时状态与重型索引)
project.db
project.db-wal
project.db-shm

# 建议忽略 (高频追加的事件流，除非你需要团队复盘)
events.jsonl

# 建议忽略 (个人每日流水账，避免污染主仓库)
daily/

# 必须提交 (团队共享的核心资产)
# MEMORY.md, SCRATCHPAD.md, skills/ 等默认不被忽略，随代码提交
```

#### 2. “就近原则”的数据库连接
你的 TS/Python 扩展在初始化时，必须**同时打开两个 SQLite 连接**（一个全局，一个项目），并在检索时实施**作用域隔离 (Scope Isolation)**：
*   当用户询问“我们项目的数据库密码规则是什么？” -> 路由至 `project.db`。
*   当用户询问“我平时习惯用什么测试框架？” -> 路由至 `global.db`。
*   **绝对禁止**在代码中将两个 DB 的表进行 `JOIN` 或混合检索，这会摧毁上下文信噪比。

#### 3. 事件日志 (events.jsonl) 的轮转与归档
`events.jsonl` 会随着长会话无限膨胀。你的扩展包必须在 `session_shutdown` (会话结束) 时执行**确定性压缩**：
*   读取 `events.jsonl`。
*   调用 LLM (或规则引擎) 提取出 3-5 条核心“踩坑结论”。
*   将结论追加到 `MEMORY.md` 或 `daily/` 中。
*   **清空或截断** `events.jsonl`，保持下一次会话的轻盈。

### 五、 总结

你正在构建的不仅仅是一个记忆插件，而是一个**基于事件溯源的本地知识操作系统**。

通过**全局与项目的物理隔离**，你完美融合了：
1.  **`mnemosyne`** 的双库隔离检索能力。
2.  **`pi-memory`** 的 KV Cache 稳定快照与 Markdown 团队共享理念。
3.  **DeepSeek Harness** 的 Append-only 事件追踪哲学。

按照这个目录结构去实现你的 `memoharness`，它将成为 2026 年 Pi 生态中**最懂工程、最护钱包、最具团队协同价值**的顶级记忆体。如果你需要关于**如何编写 TS 代码来安全地管理这两个 SQLite 连接的并发读写**，或者**如何设计 `events.jsonl` 的 JSON Schema**，请告诉我，我们将进入核心代码的编写阶段。

### 讨论结论参考-02
详见 `./pi-创作Agent平台架构方案.md`+ `./assets`
