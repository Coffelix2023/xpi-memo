## MODIFIED Requirements

### Requirement: MEMORY.md updates incrementally

当新增 confirmed T1 memory 或 confirmed deletion 需要更新长期记忆视图时，系统 MUST 从完整可读的 L0 历史重建 MEMORY.md，再以原子方式替换投影。增量状态 MAY 用于避免重复追加 daily 日志，但不得用本次事件子集覆盖完整 MEMORY.md。

#### Scenario: New memory does not erase existing entries

- **WHEN** MEMORY.md 已包含 memory A，之后 memory B 成功确认并触发 export
- **THEN** MEMORY.md MUST 包含 A 和 B
- **AND THEN** A 的内容、稳定排序和来源引用 MUST 保持

#### Scenario: Deletion removes only confirmed target

- **WHEN** memory A 的 confirmed deletion 已进入 L0，其他 memory B 未删除
- **THEN** 下一次 MEMORY.md 重建 MUST 移除 A
- **AND THEN** B MUST 保持

### Requirement: Export progress MUST reflect projection success

导出进度 MUST 分别表达 daily 日志和 MEMORY.md 投影的完成状态。若 MEMORY.md 写入失败，系统 MUST 保留可重试状态，不得把相关 L0 memory events 标记为已完整投影。

#### Scenario: MEMORY.md write fails

- **WHEN** daily 日志写入成功但 MEMORY.md 原子替换失败
- **THEN** daily 日志可以报告成功
- **AND THEN** MEMORY projection MUST 报告失败或待重试
- **AND THEN** 后续 export MUST 能重新处理该投影

### Requirement: Automatic export covers confirmed deletion

系统 MUST 在 confirmed deletion 后调度 MEMORY.md 投影重建，并 MUST 把 T1 删除结果与投影结果作为两个可区分的状态暴露。

#### Scenario: Confirmed deletion schedules rebuild

- **WHEN** `xpi_memo_forget` 完成 confirmed deletion
- **THEN** 系统 MUST 调度一次 MEMORY.md 投影重建
- **AND THEN** 删除成功与投影失败 MUST 作为两个可区分的结果暴露

### Requirement: Legacy deletion correlation is explicit

系统 MUST 对缺少 backend memory ID 的历史写入采用保守兼容行为；没有可验证关联时不得根据正文猜测删除，并 MUST 暴露有界诊断。

#### Scenario: Legacy write remains without verified correlation

- **WHEN** 历史 T1 write event 没有 backend memory ID
- **THEN** export MUST 保留该条目，除非存在明确的可验证关联
- **AND THEN** export 或诊断 MUST 标记该条目无法由 deletion event 关联
