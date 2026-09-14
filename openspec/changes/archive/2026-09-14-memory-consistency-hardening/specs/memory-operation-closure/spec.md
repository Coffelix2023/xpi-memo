## MODIFIED Requirements

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

### Requirement: Forget MUST fail closed when exact ID read is unavailable

`xpi_memo_forget(memoryId)` MUST 保持单参数调用兼容性，并继续按当前 project bank、default bank 的顺序处理。只有存在稳定的精确 ID 读取能力时，系统才可执行 recovery 后删除；在该能力缺失时 MUST 返回明确、有界的上游限制，不得使用语义 recall、全库 export 扫描或直接访问 Mnemosyne 数据库作为默认 workaround。

#### Scenario: Exact ID capability is unavailable

- **WHEN** forget 收到 memory ID 但当前 Mnemosyne CLI 没有稳定的精确读取命令
- **THEN** 工具 MUST 返回 `status: error` 和可诊断的 upstream limitation reason
- **AND THEN** backend delete MUST NOT 被调用
- **AND THEN** 系统 MUST NOT 声称 recovery 或删除已完成

#### Scenario: Exact ID capability is available

- **WHEN** 上游提供稳定的精确 ID 读取能力且目标 memory 在 eligible bank 中存在
- **THEN** forget MUST 先写 recovery，再删除目标 memory
- **AND THEN** 只在删除成功后记录成功状态和实际 bank

### Requirement: Deletion audit MUST report the actual bank outcome

系统 MUST 仅在删除成功后记录 confirmed deleted audit，并 MUST 在审计和工具结果中标明实际命中的 bank。失败、未决或上游能力缺失的结果 MUST 不包含成功删除记录，且不得泄漏记忆正文。

#### Scenario: Upstream limitation does not claim deletion

- **WHEN** forget 因缺少精确 ID 读取能力而停止
- **THEN** audit MUST 记录有界的 limitation reason 或诊断状态
- **AND THEN** audit MUST NOT 记录 `memory-deleted-by-user` 成功结果

#### Scenario: Successful deletion records its bank

- **WHEN** forget 在某个 bank 成功删除 memory ID
- **THEN** 工具结果 MUST 返回 `status: deleted`、memory ID 和实际 bank
- **AND THEN** audit MUST 记录相同 bank 与 `memory-deleted-by-user` 原因

#### Scenario: Failed deletion does not claim success

- **WHEN** 所有可尝试 bank 均未删除 memory ID
- **THEN** 工具结果 MUST 返回 `status: error`
- **AND THEN** audit MUST NOT 包含该请求的成功删除记录
