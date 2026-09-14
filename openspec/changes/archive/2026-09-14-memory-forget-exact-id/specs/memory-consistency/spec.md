## MODIFIED Requirements

### Requirement: Deletion recovery has an explicit confirmed outcome

删除 MUST 按 adapter 的精确 ID 读取能力分流。能力可用时，系统 MUST 在破坏性 backend 操作前完成 recovery 前置步骤，并 MUST 只有在 backend 删除确认后才产生 confirmed deletion 状态。能力不可用时，系统 MAY 跳过 recovery 前置直接执行删除，但 MUST NOT 声称已写入 recovery。任一前置步骤失败或删除本身失败时，系统 MUST 保留记忆且不得声称删除成功。

#### Scenario: Recovery is written before deletion

- **WHEN** 请求删除一个可精确定位的 T1 memory，且 adapter 具备精确 ID 读取能力
- **THEN** 完整 recovery 记录 MUST 在 backend delete 尝试前成功写入
- **AND THEN** recovery MUST 包含足以人工恢复的记忆标识、scope、bank、kind 和正文

#### Scenario: Recovery cannot be written

- **WHEN** adapter 具备精确 ID 读取能力但 recovery 记录写入失败
- **THEN** backend delete MUST NOT 被调用
- **AND THEN** 工具 MUST 返回有界错误

#### Scenario: Recovery is skipped without claiming it

- **WHEN** adapter 不具备精确 ID 读取能力
- **THEN** 系统 MAY 直接执行 backend delete
- **AND THEN** 工具结果与 audit MUST NOT 声称 recovery 已写入
- **AND THEN** backend 删除成功时，该记忆 MUST 不再存在于对应 bank

#### Scenario: Backend deletion fails

- **WHEN** recovery 已成功写入或已按能力跳过，但 backend delete 因非 not-found 原因失败
- **THEN** 系统 MUST 保留 T1 memory
- **AND THEN** 系统 MUST NOT 记录 confirmed deletion 或从 MEMORY.md 移除该条目
