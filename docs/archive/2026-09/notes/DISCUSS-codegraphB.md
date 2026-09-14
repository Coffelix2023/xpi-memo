# xpi-memo 是否引入 CodeGraph：架构评估与决策计划

## TL;DR

**当前不应把 `codegraph` 或 `code-review-graph` 引入 xpi-memo 核心。**

xpi-memo 的职责是 L0 会话轨迹、T1 治理记忆、Markdown 派生视图和可插拔记忆检索；codegraph 的职责是项目级代码结构索引、调用关系和影响面分析。两者是互补的外部能力，不是同一层能力，也不应共享数据所有权。

推荐的默认决策：**保持 xpi-memo 无 codegraph 依赖、无内置索引、无新增 MCP 桥接；需要代码拓扑时，由 Pi 外部 MCP 配置单独启用。**

## 现状依据

- `ARCHITECTURE.md` 明确 xpi-memo 的核心边界是 L0、T1、Markdown、搜索后端和 mnemosyne 存储。
- `GUIDE.md` 与 `package.json` 显示 xpi-memo 是直接加载 `src/index.ts` 的 Node/TypeScript Pi 扩展，运行时依赖保持很小，搜索后端通过外部命令降级。
- `src/search/backend.ts` 的抽象面向“记忆搜索结果”，不是代码符号、调用边或文件影响面。
- `src/config.ts`、`src/banks.ts` 和 `src/index.ts` 已承载配置、项目身份、银行路由及生命周期逻辑；把代码图索引状态加入这些模块会扩大核心复杂度和故障面。
- 当前开发环境的 `project_report`/`module_report` 已提供审查侧的结构图能力，但这是 Pi/审查工具链能力，不是 xpi-memo 的运行时职责，不能据此把代码图谱写入记忆模型。

## 方案比较

### 方案 A：不引入，外部 MCP 按需使用（采用）

- xpi-memo 不新增依赖、配置项、数据表、命令或工具。
- 用户在 Pi 环境中独立配置 `codegraph` 或 `code-review-graph`。
- xpi-memo 继续负责“为什么、约束、决策、历史”；外部 code graph 负责“在哪里、谁调用谁、影响谁”。
- 最小化工具列表、安装失败面和索引重复；符合项目的 Ponytail 原则。

### 方案 B：xpi-memo 内置 codegraph MCP/CLI 桥接（暂不采用）

潜在收益：可以统一状态展示、在记忆召回后自动查询代码拓扑、未来建立 change↔symbol 关联。

当前不值得承担的成本：

- 引入外部可执行程序、版本兼容和安装发现逻辑。
- 处理索引首次构建、文件监听、数据库锁、过期索引和工作树切换。
- 把代码库内容带入 xpi-memo 的隐私、L0 记录、导出和 T1 治理边界。
- 让 `xpi_memo_recall` 同时承担记忆召回与代码导航，导致返回形状、失败语义和 token 预算变复杂。
- xpi-memo 是 Node 扩展，而 `code-review-graph` 是 Python 工具；`codegraph` 的嵌入库模式还有独立的 Node/SQLite 运行时约束。MCP/CLI 外置比进程内嵌入更安全，但也说明它不应成为核心依赖。

### 方案 C：同时引入两个图谱工具（拒绝）

两者底层都做 Tree-sitter/SQLite/增量图索引，但查询入口不同：

- `codegraph` 偏向现状导航、符号上下文、调用者/被调用者和影响面。
- `code-review-graph` 偏向 git diff、审查风险、测试缺口和变更影响。

同时挂载会造成两套索引、重复工具和 Agent 路由歧义。没有真实 A/B 数据前，不应预先承担双倍运维成本。文档中的 token 节省、速度和 star 数属于项目方或搜索结果中的宣传/基准信息，不能直接作为本项目引入依据。

## 目标边界

### 纳入

- 保持 xpi-memo 作为记忆系统，不变更其 L0/T1 所有权。
- 将 code graph 视为可选的外部“代码结构层”。
- 未来若有证据，再增加一个极薄的、只读的关联能力，用于把 OpenSpec/change 与代码符号建立引用关系。

### 排除

- 不把 `.codegraph/` 或 `.code-review-graph/` 数据库复制到 `~/.pi/agent/xpi-memo/`。
- 不把完整源码、调用图快照或自动生成的代码结构写入 T1 memory。
- 不在 `xpi_memo_recall` 中隐式触发建图、同步、源码扫描或外部 MCP 查询。
- 不新增 `codegraph`/`code-review-graph` 为 npm、Python 或 peer dependency。
- 不修改 L0 JSONL schema、T1 memory schema、mnemosyne metadata 格式或现有搜索后端契约。
- 不修改 Pi system prompt，也不强制所有会话先调用代码图工具。
- 不同时安装两个代码图工具作为默认方案。

## 推荐工作流

1. Agent 需要“为什么这样设计、历史约束、用户偏好”时，调用 `xpi_memo_recall`。
2. Agent 需要“代码在哪里、谁调用它、改动影响谁”时，调用外部 code graph 或 Pi 自带的代码导航能力。
3. Agent 需要实际实现时，用图谱获得关系和影响面，再用原生 `read` 读取即将修改的具体源码；不能把图谱上下文视为源码真相。
4. Agent 需要确认行为与规范时，读取 OpenSpec/项目文档；不能用代码图推断产品意图。
5. 任何影响面结果都标记为静态分析结果，必须结合动态注册、依赖注入、反射、测试和运行验证复核。

## 后续采用触发条件

只有同时满足以下条件，才启动“可选 companion 适配”评估：

- 真实任务中反复出现跨会话代码定位或底层符号影响面遗漏。
- 外部 MCP 的手动配置成为稳定摩擦，而不是一次性安装成本。
- A/B 测试证明图谱带来可重复的收益，而不是依赖供应商宣传数字。
- 能定义图谱索引失效、静态分析漏边和外部进程失败时的安全降级。

采用前的固定验证门槛：选取至少 6 个真实任务，覆盖归档 OpenSpec 回访、底层函数重构、跨模块定位和一次变更审查；对比原生导航、`codegraph`、`code-review-graph` 三种路径，记录工具调用数、输入 token、总耗时、遗漏依赖、误报依赖和安装/索引失败。只有当候选方案在至少 4/6 个任务中减少不低于 20% 的探索成本，且没有引入高风险遗漏，才进入适配设计。

## 若未来进入适配阶段的实现约束

- 采用外部进程/MCP，不采用进程内嵌入。
- 默认关闭，能力不可用时静默降级到现有 `SearchBackend` 与 Pi 原生导航。
- 适配层只传递有界的符号、关系、文件路径和影响摘要；默认不传递完整源码。
- 所有查询设置明确的最大深度、最大节点数和最大输出字节数。
- 索引目录留在目标项目或用户指定的外部目录，并加入目标项目的 ignore 规则；不进入 xpi-memo 数据目录和 Markdown 导出。
- 只记录“外部代码图查询失败/不可用”的诊断状态，不记录源码内容和完整查询结果到 L0。
- 若建立 OpenSpec/change↔symbol 关联，只保存稳定的项目身份、change 标识、符号标识、文件路径、版本/commit 指纹和人工确认的关联；不保存派生图快照。
- 任何关联在 git commit、分支切换或文件重命名后都必须允许失效，并提供重新核对路径。

## 验收标准

当前决策的验收标准是“不改代码也能成立”：

- xpi-memo 的现有 T1/L0/搜索行为和数据布局保持不变。
- 安装 xpi-memo 不要求 Node 以外的 Python/Rust 工具，也不要求 code graph 可用。
- 未配置 code graph 时，xpi-memo 不报错、不触发建图、不改变召回结果。
- 配置外部 code graph 时，Agent 可以独立使用它；xpi-memo 不接管其生命周期和数据库。
- 记忆检索、代码拓扑查询、OpenSpec 规范三者的职责在文档和 Agent 工作流中清晰分离。

## 最终决策

**现在不引入 codegraph 到 xpi-memo。**

保留“外部、可选、按需”的演进路径；未来若真实 A/B 数据证明收益，再优先评估单一工具：默认偏向 `codegraph` 处理冷启动导航和 OpenSpec 回访，只有当变更审查、测试缺口和风险评分成为高频刚需时，才评估 `code-review-graph`。
