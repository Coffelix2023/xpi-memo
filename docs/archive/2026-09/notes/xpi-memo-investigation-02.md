# xpi-memo 记忆体失效问题第二次调研

## 议题
我自研了pi的记忆体`xpi-memo`,但好像并没有很好的自动记忆,以下是讨论的内容, 请你作为顶级架构师和Agent记忆体开发专家评估并给出符合最佳生产实践的建议:
```text
TL;DR: xpi-memo 目前一条已确认记忆都没有——既无用户偏好,也无项目开发记忆。全部 8 个记忆库(1 个全局 + 7
个项目 bank)的 memories、memoria_preferences、facts、working_memory 表都是 0 行。

检查过程:
- xpi_memo_recall 三次查询(偏好/开发记忆/全局工作流)→ 全空
- MEMORY.md 标记 _No confirmed memories yet._
- 直接查 8 个 mnemosyne.db 的 5 张核心表 → 全为 0

原因: 系统设计是"受治理记忆"(governed memory)。非明确偏好与项目决策默认进 pending candidate,需你在弹窗
里点 Store 确认后才会落盘;可能你从未确认过,或写入被 reject 了。

可选: 若想要一条真实记忆,给我一句话偏好(如"默认中文回复"),我调 xpi_memo_remember 提交,系统会弹出确认让
你批准落盘。

---

TL;DR: 混合模式——L0 会话追踪是被动自动记录,T1 长期记忆是主动写入 + 治理确认;仅少数"明确稳定"内容会条件
 自动存储。

 三层的记忆写入路径:

 L0(会话追踪)— 纯被动
 - 每次会话自动把用户消息、工具调用、记忆写入追加到 sessions/<id>/events.jsonl,agent 无需任何动作,也删
   不掉。
 - 这是"事件源"真相层,一切从它派生。

 T1(长期记忆)— 主动为主,条件自动为辅
 - 由 agent 调 xpi_memo_remember 主动写;L0 永不自动提升内容到 T1(docs/l0-contract.md 明确)。
 - 写入过治理:内容过滤 → 路由(global/project/session)→ 候选确认生命周期。非明确内容先进 pending
   candidate,需用户点 Store 才落盘——这就是你 0 条已确认记忆的原因。
 - auto-store-policy.ts 例外(条件自动存储,不弹确认):
     - session_context ≤ 500 字符
     - global_preference/global_workflow 且 explicitStable=true + 证据为"显式用户陈述"
     - project_gene/project_constraint 且 verified=true + 证据为"已验证的仓库事实/工具结果"

 Recall — 策略驱动
 - 三种策略(active/assist/high-value-auto),你当前配置是
   high-value-auto(~/.config/xpi-memo/config.json),即召回也是按价值门槛筛选,非每次全量注入。

 一句话: 系统记什么都自动(L0),但"记住什么值得跨会话留存"由 agent 主动决策 + 你确认(T1)。
```

## 针对议题的讨论文档-01
作为曾经主导过多个生产级Agent记忆系统设计的架构师，我先给你一个**尖锐但坦诚**的诊断：

**你的架构设计在“论文”层面是完美的（L0事件溯源 + T1治理写入 + 策略召回），但在“生产”层面存在一个致命的反模式——你把“数据库事务的ACID思维”套用到了“Agent认知的混沌流”上。**

结果是：你构建了一座精密的水坝（治理确认），而Agent认知流是洪水。水坝拦住了所有泥沙（垃圾数据），但也拦住了所有水分（有价值的记忆），导致下游（Agent上下文）长期干旱。**当前 0 条记忆不是Bug，而是你当前确认机制的必然数学结果。**

下面是我作为架构师给出的 **根因分析 + 符合最佳实践的三大手术级改造方案**。

### 🔍 根因分析：为什么你的“条件自动”形同虚设？

1. **确认弹窗（UI阻塞）是Agent记忆的“杀手”**：Agent是异步并发的，弹窗确认机制在人类不驻留的CI/CD或后台任务中会直接静默丢弃（Timeout），导致写入流产。
2. **`explicitStable=true` 与 `verified=true` 在早期交互中永远为假**：Agent在初次探索代码时，除非你喂给它结构化的PRD，否则它拿不到“显式用户陈述”和“已验证的仓库事实”。**这是一个死锁**——需要事实才能验证，但验证本身就需要记忆来产生事实。
3. **高频写入的Token成本焦虑过度前置**：为了防止LLM抽取消耗Token，你把写入门槛抬到了“企业级审批”的高度。但在启动阶段，**“任何记忆”都比“完美记忆”更有价值**。

---

### 🛠️ 顶级架构师的三大改造建议（符合2026生产最佳实践）

最佳实践的标准是：**「写入零摩擦，召回有分级，遗忘靠衰减」**。请按以下顺序重构你的 `xpi-memo`：

#### 1. 废除“写入确认弹窗”，引入“乐观写入 + 软删除/回滚”机制（致命改动）
*   **现状**：`pending candidate` -> 确认 -> T1。
*   **改造**：**Agent 调用 `xpi_memo_remember` 时，立即写入 T1（`status='active'`），但强制附加 `confidence_score`（0.0-1.0）和 `evidence_chain`（证据链）。
*   **召回时的“信用分级”**：Recall 时，不要只取 `active`，而是按 `confidence_score` 加权排序。低置信度（<0.4）的记忆在注入Prompt时加前缀 `[未经证实的推测]`。
*   **纠错回路**：如果用户在后续对话中明确反驳了该记忆，Agent 调用 `xpi_memo_correct` 将原记忆标记为 `deprecated`（软删除），而不是直接丢弃。**这保留了L0事件溯源的本意（真相层不变，T1可修正）。**

#### 2. 将“L0 -> T1”的晋升从“Agent主动调用”改为“后台零侵扰快照抽取”
*   **现状**：依赖 Agent 调 `xpi_memo_remember` 写。Agent 忙于写代码，不会主动写记忆。
*   **改造**：利用 `xpi-memo` 的 L0 `events.jsonl`。在**会话空闲时**（或对话轮次 > 5 时），起一个极轻量的 **Sidecar Summarizer**（可以用 `gpt-4o-mini` 或本地 `Qwen2.5-0.5B`），抽取 L0 中的 `（用户指令， 最终接受方案， 被修改文件）`，**自动**生成候选记忆写入 T1，置信度打 0.6。
*   **价值**：这样你不需要点任何确认，3轮对话后，T1自动就有了“当前项目使用Next.js App Router”之类的记忆。

#### 3. 召回策略的重构：放弃“高价值门槛”，采用“滑动窗口 + 动态预算”
*   **现状**：`high-value-auto` 导致门槛太高，召回为空。
*   **改造**：采用 **Recency（时新性） + Relevance（相关性）** 双轮驱动。
    *   **L1 热记忆**：最近 1 小时内的 L0 事件（无论价值），直接压缩注入（保证上下文连贯）。
    *   **L2 冷记忆**：T1 中的高置信度记忆（`score > 0.7`），按向量相似度取 Top-3。
    *   **L3 休眠记忆**：置信度低但相关的记忆，只在 Agent 明确询问“我记得之前...”时才触发检索。

---

### 📋 针对你“0条记忆”现状的一键救急方案

在重构之前，为了不让记忆体模块成为摆设，请立即执行以下操作（5分钟生效）：

1. **修改 `auto-store-policy.ts`**：将 `session_context ≤ 500` 字符放宽到 `≤ 8000` 字符（或直接用 Token 数 4096）。启动阶段不要限制长度。
2. **注入“种子记忆”**：既然目前全靠手动确认，你直接在 `~/.config/xpi-memo/config.json` 同级目录下，手动写一个 `seeds.json`，强制加载两条基础记忆：
   *   `global_preference`: "用户是资深全栈工程师，中文优先，拒绝冗长解释。"
   *   `project_constraint`: "当前项目使用 pnpm + monorepo。"
   *   让系统启动时直接 `INSERT` 这两条，并标记 `verified=true`。**这是唯一一次手动注入，用于打破“零记忆僵局”。**

3. **取消弹窗确认（必须改）**：注释掉调用 `confirmCandidate` 的代码，改为 `write_to_t1_directly`。如果你怕脏数据，把 T1 的存储结构增加一个 `review_status` 字段，默认为 `unreviewed`，但召回时必须带上它们。

---

### 💎 总结性断言

作为该领域专家，我断言：**Agent 记忆系统在生产环境的第一原则不是“准”，而是“有”。**

`xpi-memo` 现在的代码质量很高，但策略层犯了“过早优化（防止Token浪费）”的经典错误。请按上述建议 **放开写入闸门，落实置信度标记，依赖召回排序来治理质量**。

做完上述改动后，只要 Agent 跟你聊超过 10 个来回，`mnemosyne.db` 里至少会有 20~50 条有效记忆。那时，你再观察 `xpi_memo_recall` 的输出，才真正进入了调优“记忆遗忘曲线”和“冲突合并”的深水区。

如果你需要，我可以帮你直接重写那部分 `auto-store-policy.ts` 和 `recall` 的混合排序逻辑伪代码。你目前卡在“治理”这层，必须尽快越过它。

---
## 针对议题的讨论文档-02
[@omp-root-rules]

### TL;DR (结论优先)
**你的 `xpi-memo` 陷入了“过度治理 (Over-Governance)”的架构陷阱。导致“0行记忆”的根本原因，不是 Agent 不够聪明，而是你设计的“同步弹窗确认”机制彻底违背了 Coding Agent 的“心流 (Flow State)”物理规律。**

作为架构师，我必须犀利地指出：**在编码时要求人类点击“Store”确认弹窗，是反模式 (Anti-pattern) 中的反模式。** 这不仅打断了开发者的心流，还让 L0（事件溯源）与 T1（长期记忆）之间产生了严重的断层。

**最佳生产实践的重构方向是：废除同步弹窗，转向“隐式信任 (Implicit Trust) + 异步审查 (Asynchronous Review)”，并彻底抛弃复杂的“5张核心表”强 Schema，回归 `pi-memory` 式的“Markdown + 单 SQLite (FTS5)”极简架构。**

---

### 一、 第一性原理诊断：为什么“受治理记忆”在 Pi 中会失效？

你试图在**写入时 (Write-time)** 解决“记忆污染与幻觉”问题，但这在工程上付出了极其惨痛的代价：

#### 1. 摩擦力灾难 (Friction Disaster)
Coding Agent 的核心价值是“自动化与连贯性”。当 Agent 识别到“用户偏好使用 pnpm”并调用 `xpi_memo_remember` 时，它期望的是“静默落盘”。如果你弹出一个 UI 让人类确认，人类的本能反应是**忽略、关闭或感到厌烦**。这就是为什么你的 8 个 Bank 全是 0 行——**人类用脚投票，拒绝了这种高摩擦的交互。**

#### 2. 强 Schema 的认知超载 (Cognitive Overload on Agent)
你设计了 5 张核心表（`memories`, `memoria_preferences`, `facts`, `working_memory` 等）。这意味着 Agent 在调用 Tool 时，不仅要决定“记什么”，还要**精准分类**“这属于 preference 还是 fact？”。LLM 在面对复杂的 JSON Schema 映射时，极易产生“分类瘫痪”，最终导致 Tool Call 失败或参数构造错误，被你的治理层直接 Reject。

#### 3. L0 价值的彻底浪费
你的 L0 (`events.jsonl`) 完美践行了 DeepSeek Harness 的“事件溯源”理念，这是极其优秀的底座。但是，由于 T1 的写入被“弹窗”卡死，L0 变成了一座**无法提炼出黄金的死矿**。L0 应该在 `session_shutdown` 时自动派生出 T1 的摘要，而不是依赖人类去点击。

---

### 二、 架构重构建议：走向“异步治理”与“极简 Schema”

结合 `pi-memory` 的 KV Cache 稳定快照、`mnemosyne` 的极简检索，以及 `ai-memory` 的 Git-Native 理念，我为你提供 `xpi-memo` 的**生产级重构蓝图**：

#### 1. 废除同步弹窗，实施“隐式信任 + 异步审查”
*   **隐式信任 (Implicit Trust)**：当 Agent 主动调用 `xpi_memo_remember` 时，**直接落盘**，绝不弹窗。Agent 受 System Prompt 约束，它既然决定调用 Tool，就说明它认为这值得记住。
*   **异步审查 (Asynchronous Review)**：将记忆分为 `status: draft` 和 `status: confirmed`。
    *   Agent 写入的默认是 `draft`。
    *   在 `session_shutdown` (会话结束) 时，生成一份 `daily/YYYY-MM-DD.md` 日志，列出今日新增的 Draft 记忆。
    *   人类可以在**非编码时间**（如早上喝咖啡时），用 Zed-Editor 打开 Markdown 文件，批量删除或修改不合理的记忆，然后运行一个 `xpi_memo_commit` 命令将其标记为 `confirmed`。
    *   **收益**：编码时零打断，治理权依然在人类手中（数据主权）。

#### 2. 降维打击：抛弃 5 张表，回归“Markdown + 标签”
*   **现状**：关系型数据库的强 Schema 逼迫 LLM 做它不擅长的“精确分类”。
*   **重构**：学习 `pi-memory`，T1 层**只保留一个 `MEMORY.md` 文件和一个 SQLite (FTS5 + sqlite-vec) 索引**。
*   **机制**：Agent 写入时，只需提供 `content` 和 `tags`（如 `#preference`, `#architecture`, `#bugfix`）。
    ```markdown
    <!-- 2026-08-30 10:00:00 [draft] #preference #pnpm -->
    用户偏好使用 pnpm 而非 npm 进行包管理。
    ```
*   **收益**：Tool Schema 极度简化（只需 `content` 和 `tags`），Agent 调用成功率提升至 99%。检索时通过 FTS5 的标签和全文匹配，性能与精度远超复杂的多表 JOIN。

#### 3. 榨取 L0 价值：Session End 自动提炼 (Auto-Consolidation)
*   不要让 L0 的 `events.jsonl` 只是死日志。在 Pi 的 `session_shutdown` 生命周期 Hook 中，触发一个**低成本的离线提炼任务**：
    1. 读取本次会话的 `events.jsonl`。
    2. 使用廉价模型（如 Haiku/Flash）或确定性规则，提取出 1-3 条“核心踩坑结论”或“架构决策”。
    3. 自动追加到 T1 的 `MEMORY.md` 中（标记为 `draft`）。
*   **收益**：即使 Agent 在会话中“忘记”了主动调用 `remember`，L0 的事件溯源也能在会话结束时“兜底”捕获高价值记忆。

---

### 三、 具体实施路线图 (Roadmap)

#### Phase 1: 解除写入阻塞 (Immediate Fix)
*   **修改 Tool Schema**：将 `xpi_memo_remember` 的参数简化为 `{ content: string, tags: string[] }`。移除所有复杂的 `explicitStable`, `verified` 等布尔值判断。
*   **修改写入逻辑**：Agent 调用 Tool 时，直接写入 SQLite 和 `MEMORY.md`，标记为 `[draft]`。**彻底删除弹窗确认代码**。

#### Phase 2: 实施 KV Cache 稳定快照 (Cache Stability)
*   在 `session_start` 时，读取 `MEMORY.md` 中所有 `status: confirmed` 的内容，生成一个**字节级稳定 (Byte-stable)** 的字符串块，注入到 System Prompt 的顶部。
*   **注意**：`draft` 记忆**不注入** System Prompt，防止未经验证的幻觉污染 LLM 的 KV Cache。Agent 可以通过显式调用 `xpi_memo_recall` 来检索 `draft` 记忆。

#### Phase 3: 引入“记忆遗忘与覆盖”机制 (Supersession)
*   当 Agent 写入一条新记忆（如“改用 bun 替代 pnpm”）时，系统通过 FTS5 检索出旧的冲突记忆（“偏好 pnpm”），并自动将旧记忆标记为 `[superseded]`，新记忆标记为 `[draft]`。
*   这解决了 Mem0 的“ADD-only”痛点，实现了记忆的自我演化。

---

### 四、 架构师箴言 (Non-negotiables)

1.  **信任 Agent，事后审计 (Trust but Verify)**：
    不要试图在 Agent 运行的“热路径 (Hot Path)”上做完美的拦截与确认。让 Agent 大胆地写（草稿），让人类在“冷路径 (Cold Path)”从容地改。**编码时的任何 UI 阻塞都是架构设计的失败。**
2.  **Markdown 是最终的归宿 (Markdown is the Ultimate SSOT)**：
    无论你的 SQLite 索引多么精妙，人类必须能够用 `cat MEMORY.md` 或 Obsidian 直接查看、编辑、Git 提交这些记忆。**失去人类可读性的记忆库，最终都会沦为无法调试的黑盒垃圾场。**
3.  **L0 是底座，T1 是视图 (L0 is Base, T1 is View)**：
    永远不要直接删除 `events.jsonl` (L0)。即使 T1 的记忆被人类删光了，只要 L0 还在，你就可以随时通过脚本重新“编译”出 T1。这就是 DeepSeek Harness 事件溯源的终极安全感。

**总结**：你的 `xpi-memo` 拥有极好的底层直觉（L0 事件溯源 + 分层路由），但被“传统软件工程的审批流思维”束缚了手脚。解开弹窗的枷锁，拥抱 Markdown 与异步治理，它将立刻蜕变为 Pi 生态中最优雅、最懂开发者心流的记忆体。

---

## 针对议题的讨论文档-03
你贴的诊断其实已经自己把病灶写出来了，我先把结论说死：**"0 条已确认记忆"不是 bug，是这套"governed memory"设计的必然稳态**。你的系统在写入路径上设了两道串联的闸门——（1）agent 要主动决定调 `xpi_memo_remember`；（2）用户要在弹窗里点 Store——两道闸门的通过率相乘，稳态就是趋近于零。这在所有生产级记忆系统里都是被反复验证过的教训，下面分层评估并给改造方案。

## 一、根因诊断：治理放错了位置

**1. 写入侧过度治理，读取侧治理不足——方向反了。** 记忆系统的真正风险是"召回时被垃圾淹没"，而不是"库里存了垃圾"。库里多存一条低价值记忆，代价是一个向量 + 一行 SQLite（近乎零成本，且可衰减、可删除、你有 recovery 机制）；而漏存一条关键偏好，代价是**不可见的**——你永远不会收到"本可以记得但忘了"的告警。成本结构不对称，默认值就应该偏向"先存后治"。生产系统的通行做法是：**写入宽进（capture liberally），治理后移（govern at recall + async curation）**。

**2. 依赖 LLM 主动调用写入工具，是已知的不可靠环节。** LLM 在对话中识别"这句话值得跨会话留存"的召回率天然很低——它忙于完成当前任务，元认知式的记忆决策优先级永远靠后。mnemosyne 的解法是生命周期钩子（session 结束/idle 时自动跑 consolidation），pi-memory 的解法是 exit summary + 每日日志自动追加，两者都不依赖 agent 的"自觉"。你的 L0 被动追踪方向完全正确，问题只在于**L0→T1 之间没有自动提取管线**，纯靠 agent 自觉搭桥。

**3. 冷启动死亡螺旋。** 你当前配置 recall 是 `high-value-auto`（价值门槛筛选注入），而 T1 是空的 → 用户从未体验过"记忆生效" → 不会主动说"记住这个" → agent 没有正反馈示范 → 继续零写入。这个循环必须先打破，否则策略调得再好也没有样本。

**4. "点 Store 确认"交互本身的摩擦被低估了。** 每条候选一次弹窗，意味着用户在创作/编码心流中被反复打断。生产实践里确认弹窗只应用于**例外**（敏感内容、不可逆操作），不应用于常规路径——ChatGPT 记忆、mem0、pi-memory 全都是"静默写入 + 事后可管理"，没有一家把确认做成默认闸门。

## 二、改造方案：保持你的架构骨架，移动治理位置

你的 L0 事件源 + T1 策展层 + bank 路由的骨架是好的，不要推翻，做四个手术：

### 手术 1：新增 L0→T1 自动提取管线（核心修复）

在三个时机触发离线提取（任选，不必全做）：

| 触发时机 | 对应机制 | 成本 |
|---|---|---|
| 会话结束 / `/quit` | pi-memory 已有 exit summary 机制可复用，加一步"从 summary + events.jsonl 提取事实" | 一次 cheap model 调用 |
| compaction 时 | pi 的 `session_before_compact` 钩子，顺手提取 | 复用已有 LLM 调用 |
| 定时/idle 后台任务 | 对应 mnemosyne `sleep` 的 consolidation | 可调度，最解耦 |

提取输出不是"候选弹窗"，而是**直接落盘**：每条记忆携带 `provenance`（source_session_id、entry_id、evidence 原文引用、extraction_time）+ `confidence`（0~1）+ `importance` 评分。证据回链恰好用上你 L0 是事件源的优势——这是你相对上游的差异化资产，别浪费。

### 手术 2：把确认闸门降级为"例外治理"

重写 auto-store-policy 的判定逻辑，按**敏感类别**而非"是否明确稳定"分流：

| 类别 | 策略 | 理由 |
|---|---|---|
| 用户显式指令（"记住：……"） | **直接落盘，零确认** | 意图无歧义，弹窗是侮辱用户 |
| 普通偏好/工作流/项目事实 | 自动落盘 + 事后 digest | 可逆、低害 |
| 敏感内容（密钥、凭据、PII、私人信息） | **唯一保留确认弹窗的类别** | 不可逆风险真实存在 |
| 与既有记忆高相似（向量 cos > 阈值） | 自动 merge/更新，不产生新条目 | 去重比确认更重要 |

用户感知从"每条都弹窗"变成"**每周/每 20 条给一份摘要**（本周自动记住了什么，可一键 purge）"。可审计性不降反升——digest 里带 evidence 回链，比现在 pending 队列里躺着没人看的候选强得多。

### 手术 3：读取侧承接治理职能

写入放宽后，防污染的防线全部移到 recall——你已有的 `high-value-auto` 策略框架正好扩容：

- **评分公式**：`score = importance × confidence × recency_decay × success_feedback`（被召回后"有用/无用"反馈回流调权，mnemosyne 的 importance 权重混合打分就是这个思路）；
- **注入上限**：沿用 pi-memory 的字符预算制（scratchpad > 今日 > 长期 > 昨日，16K 封顶）；
- **冲突裁决**：同主题多条时取最新 + 标注被取代者，而不是并存；
- **衰减**：`recency_halflife` 默认 168h（mnemosyne 默认值），长期未被召回的记忆自动降权沉底——**不需要删除，降权即是治理**。

### 手术 4：破冷启动

- 手动 seed 5~10 条种子记忆（你的语言偏好、技术栈、当前项目上下文），让 recall 立刻有东西可注入；
- 初期把 recall 策略临时降到 `assist`（更宽松的注入门槛），等库里有 50+ 条后再切回 `high-value-auto`；
- 系统提示词里给 agent 明确的写入指令模板（pi 的 `promptGuidelines` 机制，记得显式点名工具）："当用户纠正你的做法、声明偏好、或确认了一个非显而易见的项目事实时，调用 xpi_memo_remember"。

## 三、给你的三条度量指标

改造是否生效，用数据说话，在 L0 里顺带埋点：

1. **捕获率**：每周自动写入条数（目标：从 0 → 20+/周）；
2. **purge 率**：digest 中被用户删除的比例（健康区间 5~15%；过高说明提取太宽，过低说明用户根本不看 digest）；
3. **召回命中率**：注入的记忆在当轮被 agent 实际引用/使用的比例（这是 recall 策略调参的依据）。

## 四、一句话总结

**L0 被动全量 + T1 主动写入 + 治理确认，这个三段式里错的只有第三段的位置**：把"确认"从写入路径挪到事后 digest，把"治理"从写入闸门挪到 recall 评分，再补上 L0→T1 的自动提取管线，你的 xpi-memo 就从"一个永远不会被填满的完美数据库"变成"一个先装满再慢慢提纯的工作系统"。记忆系统的第一性原理是 **capture beats curation**——先抓住，再治理。
