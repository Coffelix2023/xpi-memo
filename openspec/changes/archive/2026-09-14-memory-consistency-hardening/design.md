## Context

See `proposal.md` - Why. 当前写入路径分布在直接 remember、候选确认和离线提取；它们都调用 Mnemosyne adapter，并在不同位置追加 L0 与 audit。L0 合约要求事件追加、不可变、可离线重放；现有 `MEMORY.md` 则从 T1 写入事件投影，但普通 export 的读取范围由 daily 增量游标控制。

Mnemosyne 当前 CLI 提供 `recall` 和 `delete`，没有稳定的精确按 ID 读取命令。`getMemoryById` 不能继续把相关性搜索当作主键读取。跨 T1、L0、audit 和 Markdown 的物理存储也不存在共享事务。

## Goals / Non-Goals

**Goals:**

- 让每个受治理写入和删除都有可关联的请求、终态或未决状态。
- 保留现有 L0 事件的追加、不可变和离线重放特征。
- 让 MEMORY.md 在新增、删除、重试和多 session 场景下都能从完整历史确定性重建。
- 将 daily 增量导出与 MEMORY.md 全量投影的进度和失败状态分开。
- 在上游精确 ID 能力缺失时，让 `forget` 明确失败并保持 fail-closed。
- 通过行为测试验证 backend、L0、导出和恢复失败的边界。

**Non-Goals:**

- 不实现 Mnemosyne 的 `get <id>`，不修改 Mnemosyne CLI，不读取其私有数据库 schema。
- 不用 `export` 扫描或语义 recall 作为默认精确 ID workaround。
- 不改变 L0 凭证保留策略、召回安全策略或 UI visual layer。
- 不承诺 T1 backend、L0、audit 和文件系统之间的分布式原子事务。
- 不在本 change 中实现自动 dedup 删除、T1 当前库枚举或性能缓存层。

## Decisions

### 1. 用 operation ID 和有限状态描述跨层操作

每次 governed write/delete 在产生副作用前生成一次 operation ID。写入沿用现有 `routing_decision` 作为请求记录，并为其增加 operation correlation；`t1_memory_write` 表示 committed，`memory_failed` 表示 failed。删除增加对应的 delete-requested 事件，继续使用 `memory_deleted` 表示 confirmed deletion，并使用有界失败事件表达 failed。没有终态的请求在读取时归类为 unresolved。

投影器按 operation ID 折叠这些事件，只把 committed write 和 confirmed deletion作为当前状态。旧的没有 operation ID 的 `t1_memory_write` 和 `memory_deleted` 按兼容规则处理：可验证的旧 committed write 继续保留；无法关联的删除不猜测匹配。

替代方案是新增一整套独立事务日志，语义更完整但会增加事件类型、迁移和解析负担。复用现有写入/失败/删除事件，只新增删除请求事件，能减少协议变更面。

### 2. L0-first，但明确 unresolved 而非假装原子

操作先追加必需的 request event，再调用 T1 backend。backend 成功后追加 required commit event；backend 失败时追加 failure event。request、commit 和 failure 的关键记录使用会抛错的 L0 写入，不再把 governed lifecycle 降级为 `recordSafe()`。

若 backend 已完成但 commit event 写入失败，工具返回 unresolved，诊断显示 operation ID；它不能返回 `stored`，投影器也不能把该请求当作 committed。若 failure event 也写失败，同样保留 unresolved，而不是吞掉错误。audit 记录终态，但不取代 L0 的生命周期事实。

这不能消除跨存储 crash window，只能把窗口变成可识别状态。替代方案“先写 T1 再写 L0”会继续产生无法从 L0 重建的孤儿 T1；跳过 L0 失败也会破坏事件真源，因此不采用。

### 3. 精确 ID 读取是 recovery 的前置能力

`forget` 只在 adapter 能通过上游稳定精确 ID 能力读取目标 row 时创建 recovery 并删除。能力不存在时，工具返回固定的 upstream limitation reason，不调用 delete，不写成功 deletion event，不生成伪 recovery。

当前不使用语义 recall、全库 export 扫描或直接 SQLite。前者无法证明 ID 对应关系，中者输出不保证无损且成本随数据库增长，后者绑定上游 schema 和锁行为。未来 Mnemosyne 提供稳定命令后，只需在 CLI adapter 增加能力映射，恢复既有 bank probing、recovery-before-delete 和 audit 语义。

### 4. MEMORY.md 全量重建，daily 保持增量

导出器将两类工作分开：

```text
L0 readAfter(daily cursor) ──> daily/YYYY-MM-DD.md append

L0 readAll(all sessions) ────> MEMORY.md atomic rebuild
```

当本轮包含 committed write 或 confirmed deletion 时，MEMORY.md 从所有可读 session 的完整事件历史重建；没有 memory-affecting event 时可以跳过该重建。daily 游标只表示 daily 输出进度，不代表 MEMORY.md 已完成。MEMORY projection 的成功状态在原子替换完成后更新，失败时保持待重试。

删除成功后调度一次 memory projection。旧事件缺少 memory ID 时保留条目并输出 bounded diagnostic；只有明确的 ID 关联才可移除条目。MEMORY.md 重建采用当前已有的稳定 section/order/duplicate 标记规则，不引入第二套 Markdown 真源。

全量扫描的已知代价是每次 memory-affecting export 的成本随 L0 历史增长。单用户本地场景先优先正确性；若 profiling 证明不可接受，后续再增加可验证 checkpoint，不在本 change 中预建缓存。

### 5. 统一三条 T1 写入路径

直接 capture、候选 confirm 和 offline extraction 都通过同一 lifecycle coordinator 产生 request、backend call、commit/failure 和 audit 结果。候选队列只有在 commit 成功后才移除；backend 失败或 unresolved 时保留可恢复状态。现有 candidate-created、candidate-confirmed 和 candidate-rejected 事件继续表达候选生命周期，不与 T1 commit 混用。

这样可以避免为每条入口复制顺序修复，也能让测试覆盖真实共享边界。治理前的内容策略、scope routing、provenance 和 confirmation 规则保持不变。

### 6. 以历史兼容和可回滚为迁移边界

新 reader 兼容没有 operation ID 的历史事件，并把缺失关联的删除标记为 unresolved/diagnostic，而不是删除正文。第一次启用新投影逻辑时允许执行一次完整 MEMORY.md rebuild；daily 状态继续沿用现有位置。

回滚代码时不能继续写入新事件类型，否则旧 reader 可能把它们视为未知行。回滚前应完成一次导出并停止产生新 lifecycle events；旧 MEMORY.md 可由备份或原有导出恢复。该限制记录在迁移文档和任务验收中。

## Risks / Trade-offs

- [Risk] T1 backend 与 L0 仍无法共享事务，崩溃可能留下 unresolved operation。→ Mitigation: request/terminal 状态、operation ID 和诊断明确暴露未决项，禁止将其计为成功。
- [Risk] MEMORY.md 全量重建在长 session 历史上变慢。→ Mitigation: daily 仍走增量路径，先测量；checkpoint/cache 延后到后续 change。
- [Risk] Mnemosyne 长期没有精确 ID API，forget 继续不可用。→ Mitigation: 返回固定上游限制，保留现有手工 CLI 删除和 recovery 文档，不执行不可靠删除。
- [Risk] 新 lifecycle event 与旧 reader 的兼容性有限。→ Mitigation: 尽量复用既有事件，兼容旧事件；迁移计划禁止在回滚后继续写新事件。
- [Risk] L0、audit、MEMORY.md 对同一操作的可见时间不同。→ Mitigation: L0 lifecycle 作为事实来源，工具结果区分 T1 结果和投影结果，诊断显示未完成投影。

## Migration Plan

1. 先增加 lifecycle event reader 的兼容解析和诊断，再切换新的写入路径，确保历史 L0 仍可读取。
2. 用受控测试数据执行一次 MEMORY.md 全量重建，确认旧事件、已删除事件和缺少 memory ID 的事件都按兼容规则处理。
3. 切换 direct capture、candidate confirm 和 offline extraction 到统一 lifecycle coordinator。
4. 让正常 export 在 memory-affecting event 后执行全量 MEMORY.md rebuild，同时保持 daily 增量 cursor 独立。
5. 验证失败重试、删除投影和 unresolved 诊断后，再更新用户文档中的 forget 上游限制。
6. 回滚时停止产生新 lifecycle events，保留已生成的导出和 L0 日志；旧代码恢复后不得把新事件静默当作已知成功事件。

## Open Questions

- MEMORY.md 全量重建在真实长期 session 数据上的可接受耗时，需要通过实现后的 profiling 确认；若超出阈值，再单独设计 checkpoint。
- Mnemosyne 未来精确 ID API 的命令名、JSON schema 和最低版本，需要在上游发布后补入 adapter 兼容矩阵。
