## Purpose

让 xpi-memo 在非 Git、非 TUI 和能力不完整的运行环境中保持可预测、可诊断、可降级的记忆行为，并确保用户能够从反馈和状态信息理解记忆是否被捕获、路由、审核、存储或召回。

## ADDED Requirements

### Requirement: Project routing MUST be explicit when Git identity is unavailable

当当前目录没有可识别的 Git 项目身份时，系统 MUST NOT 将 project memory 静默写入 global bank。系统 MUST 提供显式初始化项目身份的入口；未初始化前，project memory MUST 返回可行动的拒绝结果，并说明初始化或切换目录的下一步。

#### Scenario: Project memory is requested in a non-Git directory
- **WHEN** 用户在没有 Git 项目身份且未完成显式初始化的目录中提交 `project_decision`、`project_constraint`、`project_gene` 或 `project_gotcha`
- **THEN** 系统 MUST 拒绝该 project memory 写入
- **AND THEN** 工具结果 MUST 说明当前目录缺少项目身份，并指向项目初始化或切换到 Git 项目的操作
- **AND THEN** 系统 MUST NOT 创建 global memory、global candidate 或无项目归属的 project candidate

#### Scenario: A non-Git directory has been explicitly initialized
- **WHEN** 用户已为当前目录完成显式项目初始化并提交 project memory
- **THEN** 系统 MUST 将其路由到该本地项目的 project scope
- **AND THEN** 该项目身份 MUST 在同一目录及其子目录中保持稳定
- **AND THEN** 系统 MUST 保留现有候选审核和项目 bank 隔离语义

### Requirement: Session context MUST be independent of project identity

系统 MUST 允许 `session_context` 在没有 Git 项目身份的目录中工作。session context MUST 保持 session scope，不得因为项目身份缺失而进入长期 global scope 或失败。

#### Scenario: Session context is captured outside a Git project
- **WHEN** 用户在非 Git 目录中保存不超过既定边界的当前会话上下文
- **THEN** 系统 MUST 产生可追踪的 session-scoped memory outcome
- **AND THEN** 当前会话及其合法的会话恢复流程 MUST 能够召回该上下文
- **AND THEN** 该上下文 MUST NOT 被当作 global standing memory 提供给无关会话

#### Scenario: Session context is recalled without project identity
- **WHEN** 当前目录没有项目身份但当前会话存在 session context
- **THEN** 系统 MUST 能够查询当前 session scope
- **AND THEN** recall 结果 MUST 标明 session 范围，不得伪装成 project 或 global 结果

### Requirement: Routing failures MUST be observable and actionable

路由拒绝、受控降级、策略拒绝和存储失败 MUST 写入 L0/audit 的有界诊断记录。诊断记录 MUST 包含 kind、scope（若已确定）、reason、环境身份状态和结果状态，但 MUST NOT 包含完整记忆正文、Token、凭据或敏感数据。

#### Scenario: Routing rejects a write before candidate creation
- **WHEN** 记忆在分类或路由阶段因缺少项目身份、无效 scope 或其他环境条件被拒绝
- **THEN** 系统 MUST 记录 `routing_rejected` 或等价的结构化失败事件
- **AND THEN** status/doctor MUST 能够按原因统计该拒绝
- **AND THEN** 工具响应 MUST 返回具体原因而不是仅返回 `Memory write failed.`

#### Scenario: A write fails after routing
- **WHEN** L0、candidate store 或 T1 backend 在路由完成后失败
- **THEN** 系统 MUST 区分路由拒绝、候选未决和存储失败
- **AND THEN** 诊断 MUST 表明数据是否已进入 L0、候选队列或 T1 bank
- **AND THEN** 当前会话 MUST 遵循既有的数据安全策略，不因可观测性记录泄露正文

### Requirement: Memory scope metadata MUST match semantic scope

系统 MUST 使用一致的 scope 语义：global memory 为 `global`，project memory 为 `project`，session context 为 `session`。跨范围可见性若需要表达，MUST 使用独立的 visibility 或等价字段，不得用 `scope: global` 代替。

#### Scenario: Project memory is stored in a project bank
- **WHEN** project memory 被持久化或导出
- **THEN** 其 scope MUST 为 `project`
- **AND THEN** status、audit、recall 和导出结果 MUST 使用相同的 scope 语义

#### Scenario: Session context is represented in diagnostics
- **WHEN** session context 出现在候选、audit、recall 或 status 中
- **THEN** 其 scope MUST 为 `session`
- **AND THEN** 诊断和召回范围 MUST 不把它统计为 global standing memory

### Requirement: Automatic activation MUST be verifiable without TUI interaction

系统 MUST 支持通过用户自然语言触发确定性 activation loop，并在非 TUI 环境中完成可验证的捕获、候选治理、幂等和后续召回。离线提取不可用、失败或关闭时，MUST NOT 阻塞该确定性路径。

#### Scenario: Explicit preference is captured in non-TUI mode
- **WHEN** 用户在非 TUI 会话中明确表达一个 global preference 或 workflow，且未手动调用 remember 工具
- **THEN** activation loop MUST 产生直接存储或候选结果
- **AND THEN** 结果 MUST 关联原始 session/event provenance
- **AND THEN** 重放同一输入 MUST 不产生重复 T1 row 或重复 candidate

#### Scenario: Explicit project decision is governed in non-TUI mode
- **WHEN** 用户在已识别或已初始化的项目中明确表达 project decision、constraint 或 gotcha
- **THEN** activation loop MUST 遵循该 kind 的候选或存储治理
- **AND THEN** 测试 MUST 能在无 TUI 确认按钮的条件下验证候选状态、后续确认和最终 recall

#### Scenario: Activation is exercised in a non-Git directory
- **WHEN** activation loop 在非 Git 且未初始化项目的目录中处理 global memory、session context 和 project memory
- **THEN** global memory 与 session context MUST 遵循各自可用的 scope 语义
- **AND THEN** project memory MUST 产生明确拒绝或显式初始化提示
- **AND THEN** L0/audit MUST 保留该结果的有界诊断证据

### Requirement: Sleep capability and fallback MUST be explicit

sleep MUST 保持显式用户授权。系统 MUST 将 dedicated model、session model fallback、mechanical consolidation 和 disabled 状态区分展示；未配置或不可用时不得声称执行了 dedicated sleep。

#### Scenario: Sleep is authorized but no execution mode is configured
- **WHEN** 用户明确授权执行 sleep，但没有可用的执行模式
- **THEN** 系统 MUST 返回明确的 `SLEEP_DISABLED` 或等价状态
- **AND THEN** status/doctor MUST 说明缺失能力和配置下一步
- **AND THEN** 系统 MUST NOT 修改记忆或声称 sleep 已完成

#### Scenario: An explicit fallback mode is configured
- **WHEN** 用户明确授权且配置了 session model 或 mechanical fallback
- **THEN** 系统 MAY 执行该 fallback
- **AND THEN** 结果 MUST 标明实际执行模式和边界
- **AND THEN** fallback MUST 遵循与 dedicated sleep 相同的隐私、幂等和审计约束

### Requirement: Recall scope and backend state MUST be visible

recall MUST 区分 global-only、current-project-plus-global 和 current-session 等查询范围，并区分 backend 已执行但无命中与没有 backend 执行。范围受限时，系统 MUST 在有界结果或 status 中给出原因。

#### Scenario: Recall runs outside a project
- **WHEN** 用户在没有项目身份的目录中执行 recall
- **THEN** 结果 MUST 显示当前查询范围为 global-only 或 session-aware 的实际范围
- **AND THEN** 系统 MUST 说明 project memory 未被查询的原因

#### Scenario: Recall backend returns no hits
- **WHEN** 可用 backend 已执行但没有匹配结果
- **THEN** 工具和诊断 MUST 将其标记为 backend-queried-no-hits
- **AND THEN** 该状态 MUST 不与 no-search-backend 或 routing failure 混淆
