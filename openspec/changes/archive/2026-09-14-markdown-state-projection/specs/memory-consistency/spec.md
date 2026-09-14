## RENAMED Requirements

- FROM: `### Requirement: MEMORY.md is a deterministic projection of complete L0 history`
- TO: `### Requirement: MEMORY.md is a deterministic projection of the current bank state`

## MODIFIED Requirements

### Requirement: MEMORY.md is a deterministic projection of the current bank state

MEMORY.md MUST 由 bank 当前状态确定性重建，而不是由 L0 事件历史推导条目集合。相同 bank 状态与相同注解输入 MUST 产生相同的投影。L0 历史只用于注解来源、位置与稳定排序；confirmed deletion 通过"条目已不在 bank 中"自然反映，不再依赖删除事件的投影逻辑。

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
