# memory-consistency Specification

## Purpose

定义 T1 受治理记忆、L0 事件、删除 recovery 与 Markdown 投影之间的可识别一致性边界，使跨存储失败不会被误报为成功，也不会静默破坏可重建状态。

## Requirements

### Requirement: Governed memory operations expose failure-aware lifecycle states

每个 T1 写入和删除操作 MUST 有稳定的 operation ID，并 MUST 能区分 requested、committed、failed 和 unresolved 状态。系统 MUST NOT 将缺少最终提交证据的操作报告为已完成。

#### Scenario: T1 write commits successfully

- **WHEN** 一个受治理写入被接受且 T1 backend 写入成功
- **THEN** L0 MUST 保留可关联的 write request 与 commit 结果
- **AND THEN** commit 结果 MUST 包含 backend memory ID（如果 backend 返回该 ID）
- **AND THEN** 工具和 audit MUST 报告 `stored`

#### Scenario: T1 backend fails

- **WHEN** 一个受治理写入已创建 operation ID 但 T1 backend 写入失败
- **THEN** L0 MUST 保留该操作的失败结果或可诊断的未决状态
- **AND THEN** 工具 MUST NOT 报告 `stored`
- **AND THEN** 不得生成成功写入的 MEMORY.md 条目

#### Scenario: Cross-layer completion is interrupted

- **WHEN** T1 backend 已完成但最终生命周期事件未能落盘
- **THEN** 系统 MUST 将该 operation 视为 unresolved，而不是伪造 committed 状态
- **AND THEN** 状态或诊断输出 MUST 暴露该未决操作供后续处理

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

### Requirement: MEMORY.md is a deterministic projection of the current bank state

MEMORY.md MUST 由 bank 当前状态确定性重建，而不是由 L0 事件历史推导条目集合。相同 bank 状态与相同注解输入 MUST 产生相同的投影。L0 历史只用于注解来源、位置与稳定排序；confirmed deletion 通过“条目已不在 bank 中”自然反映，不再依赖删除事件的投影逻辑。

#### Scenario: Incremental export preserves prior memories

- **WHEN** memory A 已在 bank 中并已导出，之后 memory B 成功写入并触发下一次 export
- **THEN** MEMORY.md MUST 同时包含 A 和 B
- **AND THEN** A 的稳定顺序和来源引用 MUST 保持

#### Scenario: Confirmed deletion is projected

- **WHEN** memory A 已从 bank 删除并再次 export
- **THEN** MEMORY.md MUST 不再包含 A
- **AND THEN** 其他仍在 bank 中的记忆 MUST 保持

#### Scenario: Legacy write has no backend ID

- **WHEN** bank 中存在一条无法关联到 L0 write 事件的记忆
- **THEN** MEMORY.md MUST 保留该条目并标注来源缺失
- **AND THEN** 系统 MUST NOT 按正文猜测其来源或删除状态

#### Scenario: Projection is reproducible

- **WHEN** 在 bank 状态与注解输入均未改变的情况下重复执行投影
- **THEN** 生成的 MEMORY.md MUST 与上一次逐字节一致

### Requirement: Daily export progress and memory projection progress are independent

系统 MUST 独立维护 daily 日志进度与 MEMORY.md 投影进度。MEMORY.md 写入失败时，不得把对应的 memory projection 状态标记为完成；daily 日志成功与否不得掩盖 MEMORY.md 失败。

#### Scenario: Memory projection fails after daily export succeeds

- **WHEN** daily 日志写入成功但 MEMORY.md 写入失败
- **THEN** daily 进度 MAY 推进
- **AND THEN** memory projection MUST 保持待重试状态
- **AND THEN** 下一次 export MUST 能重建 MEMORY.md
