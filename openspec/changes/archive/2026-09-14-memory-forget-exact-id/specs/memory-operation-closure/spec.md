## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Forget MUST fail closed when exact ID read is unavailable

**Reason**: 该要求把"缺少精确读取能力"与"必须拒绝删除"绑定，使删除在所有 bank 上不可用——实测 3 次删除请求 3 次失败。上游 delete 命令本身不做预读、自带 not-found 判定，因此"必须先精确读取"是本项目自行附加的约束，不应作为拒绝删除的理由。

**Migration**: 由 `Forget MUST delete when exact ID read is unavailable` 与 `Adapter exact-ID capability MUST be probed, not assumed` 取代。原有的 recovery 前置约束保留，但仅在精确读取能力可用时适用；能力不可用时删除照常执行，且不得声称已写 recovery。既有 `upstream-exact-id-read-unavailable` 理由码改为能力判定结果，不再作为终止理由。
