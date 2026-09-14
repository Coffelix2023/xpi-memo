# xpi-memo 记忆失效与治理渐进修复计划

## 摘要

不推翻现有架构。保留 L0（会话事件追踪层）、T1（受治理长期记忆）、Mnemosyne Bank、七类闭合分类和候选生命周期，只修复四个断点：

1. **捕获断点**：Agent 很少主动调用 `remember`，当前没有可靠的 L0→T1 自动路径。
2. **治理断点**：非 TUI（文本/远程调用模式）会把候选永久留在 `candidates.json`，没有热路径阻塞，也没有后续自动整理。
3. **召回断点**：`before_agent_start` 实际硬编码使用 `high-value-auto`，即使配置为 `active`，普通 prompt 仍可能不召回。
4. **证据断点**：`operationFor` 将所有工具输入标为 `explicit-user-statement`，不能把 Agent 提议等同于用户明确陈述。

目标是：**显式用户记忆零打断捕获；高风险内容保留候选审核；默认召回有界主动；所有状态可诊断；数据根保持单一事实来源。**

## 现状结论（以源码优先于调查笔记）

### 写入链路

- `xpi_memo_remember.kind` 已是必填七类枚举，OpenSpec `fix-zero-memory-activation` 已落地。
- `global_preference`、`global_workflow` 在当前工具实现中被固定标记为显式稳定，因此可直接存储，但前提是 Agent 已经调用工具。
- `session_context` 只有内容长度不超过 500 字符时才可直接存储；超过即拒绝。
- `project_gene`、`project_constraint` 在 `executeRemember` 中固定传入 `verified: false`，所以当前用户工具路径不会触发它们的自动存储条件，只会进入候选。
- `project_decision`、`project_gotcha` 默认进入候选。
- 非 TUI 模式的候选统一返回 `candidate`，不会调用 Mnemosyne；这解释了远程/RPC 场景的长期积压。
- 当前没有会话结束自动提炼 T1；`session_shutdown` 只做可选 Markdown 导出。
- `operationFor` 固定把工具输入标为 `explicit-user-statement`，这是治理漏洞：Agent 推断内容可被错误地当成用户明确事实。

### 召回链路

- 启动恢复使用 `active`。
- `before_agent_start` 先按配置判断是否召回，但实际调用 `recallForContext(..., "high-value-auto", ...)`；这会二次收紧策略，使配置 `active` 对普通 prompt 失效。
- 默认 `high-value-auto` 只识别少量中英文“继续上次/之前决定”等短语；普通编码请求通常不召回。
- `queriedBanks` 已从 backend query plan 产生，空结果且 backend 执行时能报告 `default`/项目 Bank；这部分 OpenSpec 修复有效。

## 分类与路由答案

xpi-memo 不是自由标签分类，而是“闭合 T1 类型 + 作用域 + Bank 路由 + 证据策略”：

| T1 kind | 含义 | 目标 Bank | 当前治理定位 |
|---|---|---|---|
| `global_preference` | 用户长期偏好，如语言、解释风格 | 全局 `default` | 显式陈述可直接存储 |
| `global_workflow` | 用户长期工作流偏好，如测试优先、提交习惯 | 全局 `default` | 显式陈述可直接存储 |
| `project_gene` | 项目稳定事实/技术基因，如技术栈、目录约定 | `project-<id>` | 只接受受信任仓库或工具证据 |
| `project_constraint` | 项目约束，如禁止依赖、必须使用某工具 | `project-<id>` | 当前用户工具路径默认候选 |
| `project_decision` | 项目架构/实现决策 | `project-<id>` | 候选，需审核 |
| `project_gotcha` | 项目踩坑、危险边界、已知陷阱 | `project-<id>` | 候选，需审核 |
| `session_context` | 短期当前会话上下文 | 项目 Bank，session scope | 有长度上限，不应污染长期跨项目记忆 |

另有独立的 L0 事件类型、证据类型和 T2/T3 延后层，它们不是 T1 分类。

当前 Markdown 导出只显式展示 Decisions、Preferences、Constraints、Gotchas；`project_gene` 和 `session_context` 会落入 `Other`，造成分类表现与工具分类不一致。治理修复中应补齐“Repository Facts”，并明确 Session Context 的短期性质。

## 存储拓扑答案

这是**混合式、分项目自治**，不是单一全局库：

```text
~/.config/xpi-memo/config.json       # 配置，不是记忆数据
~/.pi/agent/xpi-memo/                # 扩展默认数据根
├── mnemosyne.db                     # 全局 default Bank
├── banks/
│   └── project-<id>/mnemosyne.db    # 每个 Git 项目一个 Bank
├── sessions/<session-id>/           # L0 events.jsonl
├── candidates.json                   # 待审核候选
├── audit.json                        # 不含记忆正文的审计记录
└── markdown/                         # 派生视图
```

- `XPI_MEMO_DATA_DIR` 可覆盖扩展数据根。
- 项目 ID 来自 Git common directory 的稳定哈希；非 Git 目录没有项目 Bank。`project_*` 和 `session_context` 在非 Git 目录会路由失败，不应静默写入全局库。
- 扩展启动 Mnemosyne 时显式注入 `MNEMOSYNE_DATA_DIR`，所以扩展本身的数据根是统一的。
- 裸 `mnemosyne` 命令默认使用 `~/.hermes/mnemosyne/data`，`~/xpi-memo` 是旧表面；它们与扩展根不是同一库。

因此目录拓扑本身不混乱；真正的混乱来自“扩展配置根”和“裸 CLI 默认根”并存。继续禁止 symlink 和自动迁移，统一通过 status/doctor 显示三类表面，并要求 CLI 交叉验证时显式设置同一 `MNEMOSYNE_DATA_DIR`。

## 实施切片

### Slice 1：修复证据与主动捕获

新增一个无模型、确定性、可回链的显式指令提取器，复用现有内容策略、路由和候选生命周期。

- 在 `input` 事件中识别显式稳定指令；`session_shutdown` 只作为未处理事件的有界重试，不读取无限历史。
- 只识别明确意图，不从普通对话、工具结果、模型推理或文件变更推断长期记忆。
- 识别范围固定为：
  - “偏好/默认/以后/始终”等用户习惯 → `global_preference`；
  - “流程/工作流/每次步骤”等 → `global_workflow`；
  - “本项目/仓库必须/固定使用”等 → `project_constraint`；
  - “决定/采用/改为”等 → `project_decision`；
  - “注意/踩坑/不要忘”等 → `project_gotcha`；
  - “本次/当前任务”且不超过限制 → `session_context`。
- 语义同时命中多个类别、缺乏项目上下文、或无法证明稳定性的内容跳过，不猜分类。
- 不自动生成 `project_gene`；该类型保留给未来有受信任文件/工具证据的内部入口。
- 提取器使用 L0 的 session ID、event position 和事件摘要作为 provenance；审计只存位置、类型、状态和哈希，不复制正文。
- 对同一 session/event/content/kind 做幂等去重，避免 Agent 同时调用 `remember` 造成重复。
- 工具调用的 `source` 仅作为来源描述，不再决定证据类型；没有可验证用户事件时，工具输入不得自动伪装成 `explicit-user-statement`。安全默认是候选或跳过。

### Slice 2：保留治理，但移除无意义阻塞

- 继续保留 `stored | candidate | rejected` 三种结果。
- 显式低风险用户偏好可由确定性提取器直接落盘；项目决策、项目踩坑、歧义偏好继续进入候选。
- 非 TUI 继续不弹窗、不阻塞、不自动确认；返回 `candidate`，并由 status/Pending inbox 明确提示后续审核。
- 为候选增加稳定指纹去重，避免每轮重复创建相同候选。
- 不添加第二套队列、不引入后台模型、不改变 `candidate-lifecycle` 的 Store/Later/Reject 语义。

### Slice 3：修复默认召回可达性

- `before_agent_start` 将 `runtime.config.recallPolicy` 直接传入 `recallForContext`，移除硬编码 `high-value-auto`。
- 新安装默认策略改为 `active`；已有显式配置保持不被静默覆盖，当前环境通过配置运维动作切换到 `active`。
- `active` 仍受现有边界约束：每个阶段最多一次自动检索、结果数量受 `limit` 限制、内容单条截断、只查当前项目 + 全局 Bank。
- `high-value-auto` 保留为低 Token 成本兼容选项，并扩充少量中英文连续性意图；`assist` 继续表示仅显式调用，不把术语含义混淆。
- 注入只来自 T1 结果，不把原始 L0、工具输出、候选正文或模型推理注入 prompt。

### Slice 4：加强诊断与分类视图

- status/doctor 增加最近一次 recall 的 backend、queried banks、result count 和是否真正执行；区分“backend 查过但为空”和“没有 backend 执行”。
- `RECALL_EMPTY` 只在有明确 recall 空结果证据时使用；仅凭 Bank 有行数不再断言某次召回失败。
- 保留现有 `NEVER_CALLED`、`PENDING`、`WRITE_FAILED` 状态及其优先级。
- 审计增加计数型指标：显式捕获、工具调用、直接存储、候选创建、候选确认/拒绝、召回执行、非空召回、注入次数；不记录敏感正文。
- Markdown 导出增加 `Repository Facts`，并单独标明/限制 `Session Context`，不再把合法类型悄悄归入 `Other`。
- status 明确输出 canonical configured root、CLI default root、stale root 和当前项目 Bank，继续只读探测，不迁移、不创建 symlink。

## API、兼容性与数据迁移

- 不新增外部依赖。
- 保留 `xpi_memo_remember.kind` 必填闭合枚举；不恢复隐式默认 kind。
- 不删除现有 Bank、`candidates.json`、`audit.json` 或 L0 会话文件。
- 现有候选格式保持兼容；新增字段使用可选字段或版本递增的兼容解析。
- 不自动合并 `~/.hermes/mnemosyne/data`、`~/xpi-memo` 与 canonical root。人工确认后再按 CLI 手工处理。
- 不启用 `sleep` 作为自动整理机制；没有已验证专用模型时继续拒绝 sleep。

## 测试与验收

### 单元测试

- 显式中文/英文指令分别映射到七类中的允许类别。
- 普通陈述、歧义陈述、多类别冲突、非 Git 项目和超过 500 字符 session context 均不误存。
- secret/token/credential/PII 输入不会进入 T1、candidate 或审计正文。
- Agent 工具输入不再被无条件标成显式用户陈述。
- 同一事件重复处理只产生一个候选或一条 T1 记录。
- global preference 的显式路径直接存储；project decision/gotcha 保持 candidate；Reject/Later/Store 语义不变。
- `active` 对普通 prompt 实际调用 backend；`assist` 不自动调用；`high-value-auto` 只在触发词命中时调用。
- 空 recall 报告已查询 Bank；无 backend 时 `queriedBanks` 仍为空并包含 warning。
- doctor 四状态和最近 recall 证据组合覆盖完整。

### 集成与实机验收

1. 使用临时 `XPI_MEMO_DATA_DIR` 启动 Pi，发送一条显式“记住默认中文回复”，确认无弹窗、T1 有记录、随后新会话能召回。
2. 发送项目决策，确认非 TUI 返回 `candidate`，无 Mnemosyne store 调用，进入 Pending；在 TUI Store 后才出现 T1 行。
3. 在 Git 项目与非 Git 目录分别验证 Bank 路由；非 Git 不得把项目记忆写入 global Bank。
4. 普通编码 prompt 验证 `active` 能在预算内召回；检查注入内容只来自 T1。
5. 用 `MNEMOSYNE_DATA_DIR="$XPI_MEMO_DATA_DIR" mnemosyne stats` 与 status 对照，确认 CLI 与扩展读取同一根；裸 CLI 差异应被 doctor 标出。
6. 连续运行至少 3 个新会话，检查捕获/候选/召回/拒绝计数，避免用“20–50 条记忆”这类未经验证的数量承诺作为成功标准。

## 明确不做

- 不把所有 L0 事件自动提升为 T1。
- 不引入 LLM 摘要、向量冲突合并、自动覆盖或复杂遗忘曲线。
- 不把所有 Agent 提议直接当成用户同意。
- 不把五张/多张 Mnemosyne 表替换成新的 Markdown 数据库。
- 不自动迁移、删除或 symlink 任何历史数据根。
