## Purpose

定义 T1 受治理记忆、L0 事件、删除 recovery 与 Markdown 投影之间的可识别一致性边界，使跨存储失败不会被误报为成功，也不会静默破坏可重建状态。

## ADDED Requirements

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

删除 MUST 在破坏性 backend 操作前完成 recovery 前置步骤，并 MUST 只有在 backend 删除确认后才产生 confirmed deletion 状态。任一前置步骤失败时，系统 MUST 保留记忆且不得声称删除成功。

#### Scenario: Recovery is written before deletion

- **WHEN** 请求删除一个可精确定位的 T1 memory
- **THEN** 完整 recovery 记录 MUST 在 backend delete 尝试前成功写入
- **AND THEN** recovery MUST 包含足以人工恢复的记忆标识、scope、bank、kind 和正文

#### Scenario: Recovery cannot be written

- **WHEN** recovery 记录写入失败
- **THEN** backend delete MUST NOT 被调用
- **AND THEN** 工具 MUST 返回有界错误

#### Scenario: Backend deletion fails

- **WHEN** recovery 已成功写入但 backend delete 失败
- **THEN** 系统 MUST 保留 T1 memory
- **AND THEN** 系统 MUST NOT 记录 confirmed deletion 或从 MEMORY.md 移除该条目

### Requirement: MEMORY.md is a deterministic projection of complete L0 history

MEMORY.md MUST 根据完整可读的 L0 事件历史确定性重建，而不是只根据本次增量读取的 memory events 覆盖现有投影。只有 committed T1 writes 才能成为当前记忆条目，confirmed deletions MUST 排除对应条目。

#### Scenario: Incremental export preserves prior memories

- **WHEN** memory A 已导出，之后 memory B 成功写入并触发下一次 export
- **THEN** MEMORY.md MUST 同时包含 A 和 B
- **AND THEN** A 的稳定顺序和来源引用 MUST 保持

#### Scenario: Confirmed deletion is projected

- **WHEN** memory A 已导出，之后产生 confirmed deletion 事件并再次 export
- **THEN** MEMORY.md MUST 不再包含 A
- **AND THEN** 其他未删除记忆 MUST 保持

#### Scenario: Legacy write has no backend ID

- **WHEN** 历史 write event 没有 memory ID 且无法与 deletion event 关联
- **THEN** MEMORY.md MUST 保留该条目
- **AND THEN** 诊断或 export 结果 MUST 能说明该条目无法关联删除

### Requirement: Daily export progress and memory projection progress are independent

系统 MUST 独立维护 daily 日志进度与 MEMORY.md 投影进度。MEMORY.md 写入失败时，不得把对应的 memory projection 状态标记为完成；daily 日志成功与否不得掩盖 MEMORY.md 失败。

#### Scenario: Memory projection fails after daily export succeeds

- **WHEN** daily 日志写入成功但 MEMORY.md 写入失败
- **THEN** daily 进度 MAY 推进
- **AND THEN** memory projection MUST 保持待重试状态
- **AND THEN** 下一次 export MUST 能重建 MEMORY.md
