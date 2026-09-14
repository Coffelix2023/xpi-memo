# memory-operation-closure Specification

## Purpose

确保用户以自然表达声明记忆后，系统能够保留可操作的记忆标识，并在当前项目与全局范围内可靠完成召回和删除闭环。

## Requirements

### Requirement: Category evidence MUST activate explicit memory intent

系统 MUST 在且仅在输入命中一个支持的记忆类别时，将其视为显式记忆意图。系统 MUST NOT 再要求输入额外命中独立的显式标记词表。

#### Scenario: Natural global preference is recognized

- **WHEN** 用户输入“我偏好使用中文回复”且没有同时命中其他记忆类别
- **THEN** 系统 MUST 将其识别为 `global_preference`

#### Scenario: Natural project constraint is recognized

- **WHEN** 用户在具有 project identity 的上下文输入“本项目禁止引入 ink 库”且没有同时命中其他记忆类别
- **THEN** 系统 MUST 将其识别为 `project_constraint`

#### Scenario: Natural workflow is recognized

- **WHEN** 用户输入“每次提交前都要运行 pnpm typecheck”且没有同时命中其他记忆类别
- **THEN** 系统 MUST 将其识别为 `global_workflow`

#### Scenario: Ordinary statement remains skipped

- **WHEN** 输入没有命中任何支持的记忆类别
- **THEN** 系统 MUST 返回 `no-explicit-intent`，且 MUST NOT 创建记忆或候选

### Requirement: Existing intent governance boundaries MUST remain enforced

移除独立标记词闸门后，系统 MUST 继续执行类别冲突、project fact 验证、project identity 和 session 长度边界，不得把更高捕获率实现为无条件写入。

#### Scenario: Project fact requires verification

- **WHEN** 用户输入“本仓库使用 FastAPI 技术栈”
- **THEN** 系统 MUST 返回 `project-fact-requires-verification`
- **AND THEN** 系统 MUST NOT 自动创建 `project_gene`

#### Scenario: Conflicting categories remain ambiguous

- **WHEN** 单条输入同时命中多个记忆类别
- **THEN** 系统 MUST 返回 `ambiguous-intent`，且 MUST NOT 猜测类别

#### Scenario: Project intent lacks project identity

- **WHEN** project-scoped 意图在没有 project identity 的上下文中被识别
- **THEN** 系统 MUST 返回 `missing-project-context`，且 MUST NOT 降级写入 global bank

#### Scenario: Session context exceeds its bound

- **WHEN** session context 超过既定长度上限
- **THEN** 系统 MUST 返回 `session-context-too-long`，且 MUST NOT持久化该内容

### Requirement: Recall MUST preserve actionable memory identifiers

当活动搜索后端返回真实 T1 memory ID 时，recall 结果 MUST 返回该 ID；当后端没有可删除的 T1 标识时，系统 MUST 返回 `id: null`，不得构造伪标识。语义 recall MUST NOT 被当作精确主键读取能力。

#### Scenario: Mnemosyne result exposes its memory ID

- **WHEN** mnemosyne recall 返回包含 memory ID 的结果行
- **THEN** `xpi_memo_recall` 对应结果 MUST 包含同一 ID
- **AND THEN** 结果 MUST 同时保留实际来源 bank

#### Scenario: Fallback result has no T1 identifier

- **WHEN** recall 结果来自不提供可删除 T1 ID 的 fallback 后端
- **THEN** 对应结果 MUST 返回 `id: null`

#### Scenario: Recall cannot prove exact identity

- **WHEN** recall 只返回相关性结果而不能证明目标 ID 对应的完整 T1 row
- **THEN** 系统 MUST NOT 将该结果用于 recovery 前置确认
- **AND THEN** 该结果 MUST NOT 被描述为精确 ID 命中

### Requirement: Forget MUST locate memory across the current project and global banks

`xpi_memo_forget(memoryId)` MUST 保持单参数调用兼容性。在当前上下文存在 project bank 时，系统 MUST 先尝试该 project bank，再尝试 default bank；没有 project bank 时仅尝试 default bank。首次成功后 MUST 停止。

#### Scenario: Project memory is deleted from the current project bank

- **WHEN** memory ID 存在于当前 project bank
- **THEN** forget MUST 从当前 project bank 删除该记忆
- **AND THEN** forget MUST NOT继续尝试 default bank

#### Scenario: Global memory is deleted while inside a project

- **WHEN** memory ID 不存在于当前 project bank 但存在于 default bank
- **THEN** forget MUST 在 project bank 未命中后从 default bank 删除该记忆

#### Scenario: Global memory is deleted outside a project

- **WHEN** 当前上下文没有 project bank 且 memory ID 存在于 default bank
- **THEN** forget MUST 从 default bank 删除该记忆

#### Scenario: Memory is absent from every eligible bank

- **WHEN** memory ID 不存在于所有可尝试 bank
- **THEN** forget MUST 返回删除失败
- **AND THEN** 系统 MUST NOT记录成功删除状态

### Requirement: Forget MUST delete when exact ID read is unavailable

`xpi_memo_forget(memoryId)` MUST 保持单参数调用兼容性，并按当前 project bank、default bank 的顺序处理。当 adapter 不具备稳定的精确 ID 读取能力时，系统 MUST 直接调用 backend delete，并把 backend 的 not-found 结果作为"目标不存在"的判定依据。系统 MUST NOT 把"缺少精确读取能力"本身当作拒绝删除的理由。

#### Scenario: 目标存在于 project bank 且无精确读取能力

- **WHEN** forget 收到 memory ID、当前上下文存在 project bank，且 adapter 不具备精确 ID 读取能力
- **THEN** 系统 MUST 对该 project bank 直接调用 delete
- **AND THEN** backend 报告删除成功时，工具 MUST 返回 `status: deleted`、memory ID 与实际 bank

#### Scenario: project bank 未命中时回退 default bank

- **WHEN** project bank 的 delete 报告目标不存在
- **THEN** 系统 MUST 继续对 default bank 尝试 delete
- **AND THEN** 首次成功后 MUST NOT 继续尝试剩余 bank

#### Scenario: 所有可尝试 bank 都没有该目标

- **WHEN** 所有可尝试 bank 的 delete 均报告目标不存在
- **THEN** 工具 MUST 返回 `status: error`
- **AND THEN** audit MUST NOT 记录成功删除

#### Scenario: 精确读取能力可用时保留 recovery 前置

- **WHEN** adapter 具备稳定的精确 ID 读取能力且目标存在于 eligible bank
- **THEN** 系统 MUST 先成功写入 recovery 快照，再调用 delete
- **AND THEN** recovery 写入失败时 MUST NOT 调用 delete

#### Scenario: 精确读取能力不可用时不得伪装 recovery

- **WHEN** adapter 不具备精确 ID 读取能力
- **THEN** 工具结果 MUST NOT 声称已写入 recovery
- **AND THEN** 系统 MUST NOT 使用语义 recall、全库 export 扫描或直接访问 Mnemosyne 数据库作为替代手段

### Requirement: Adapter exact-ID capability MUST be probed, not assumed

系统 MUST 在运行时判定 adapter 的精确 ID 读取能力，并把判定结果暴露为可诊断状态。该能力由不可用变为可用且没有其他配置变更时，删除路径 MUST 自动回到 recovery 前置流程，不需要修改调用方。

#### Scenario: 能力判定结果可见

- **WHEN** 用户请求 forget，或查看 status / doctor 诊断
- **THEN** 系统 MUST 能区分"精确读取可用"与"精确读取不可用"
- **AND THEN** 该诊断 MUST NOT 包含记忆正文

#### Scenario: 上游能力恢复

- **WHEN** adapter 的精确读取能力由不可用变为可用
- **THEN** 下一次 forget MUST 自动使用 recovery 前置路径
- **AND THEN** 不需要修改调用方或用户配置

### Requirement: Deletion audit MUST report the actual bank outcome

系统 MUST 仅在删除成功后记录 confirmed deleted audit，并 MUST 在审计和工具结果中标明实际命中的 bank。失败或未决的结果 MUST 不包含成功删除记录，且不得泄漏记忆正文。

#### Scenario: Successful deletion records its bank

- **WHEN** forget 在某个 bank 成功删除 memory ID
- **THEN** 工具结果 MUST 返回 `status: deleted`、memory ID 和实际 bank
- **AND THEN** audit MUST 记录相同 bank 与 `memory-deleted-by-user` 原因

#### Scenario: Upstream limitation does not claim deletion

- **WHEN** adapter 不具备精确 ID 读取能力且所有可尝试 bank 的 delete 均未删除目标
- **THEN** audit MUST 记录有界、可诊断的失败原因或能力判定状态
- **AND THEN** audit MUST NOT 记录 `memory-deleted-by-user` 成功结果
- **AND THEN** 工具结果 MUST NOT 声称 recovery 已写入

#### Scenario: Failed deletion does not claim success

- **WHEN** 所有可尝试 bank 均未删除 memory ID，或 backend delete 因非 not-found 原因失败
- **THEN** 工具结果 MUST 返回 `status: error` 与有界可诊断 reason
- **AND THEN** audit MUST NOT 包含该请求的成功删除记录
- **AND THEN** 结果 MUST NOT 包含记忆正文
