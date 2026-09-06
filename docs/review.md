# xpi-memo P0 架构修复执行结果评审

- 评审日期: 2026-09-05
- 评审提交: `e462767` (`feat(p0): add memory lifecycle visibility`)
- 评审范围: `.pi/fast-fixes/2026-09-04-xpi-memo-p0-architecture-fix`
- 结论: **不能验收为完成**

## TL;DR

本次 P0 实现存在一个 P0 级回归：为了获取 Mnemosyne 返回的 `memoryId`，实现将既有的 L0/T1 双写顺序从“L0 first，失败即终止 T1”改成了“T1 first，再写 L0”。这会在 L0 写入失败时留下无 L0 记录的 T1 记忆，破坏记忆、审计和 `MEMORY.md` 的一致性。

同时，`getMemoryById()` 使用相关性 `recall` 模拟精确 ID 查询；真实 Mnemosyne CLI 验证表明该方式不可靠。`2.5` 和 `5.4` 仍未完成，fast-fix 不应关闭。

## Findings

### P0：破坏既有 L0/T1 双写顺序

位置：

- `src/index.ts:1033`
- `src/memory-activation.ts:339`
- `src/offline-extraction.ts:513`

原实现契约是：

```text
L0 first → L0 失败则终止 T1 写入
```

本次改动后的顺序是：

```text
T1 adapter.store() → L0 t1_memory_write
```

影响：

1. Mnemosyne 写入成功；
2. L0 写入失败；
3. 工具返回 error，或在 `recordSafe()` 路径静默失败；
4. T1 记忆已存在，但没有对应的 L0 `t1_memory_write` 记录。

这违反了 `src/l0/l0-runtime.ts` 与相关文档中已有的双写契约，也会让 T1 bank、L0、审计和 `MEMORY.md` 不一致。

修复方向：

- 保持 L0 first；
- 如果需要记录 Mnemosyne `memoryId`，扩展事件协议或增加后续关联事件；
- 不要用“先写 T1，再写 L0”规避协议；
- governed write 不应把必须成功的 L0 写入降级为 `recordSafe()`。

### P1：`getMemoryById()` 不是可靠的精确 ID 查询

位置：`src/operations.ts:143`

实现调用：

```text
mnemosyne recall <memoryId> 50 --explain --json
```

再从相关性检索结果中查找相同 ID。

真实 CLI 验证结果：

- 空 query 可以返回 working-memory 条目；
- 使用真实 memory ID 查询时，返回结果仍可能为空；
- `recall` 是相关性检索接口，不是主键读取接口。

影响：

- `xpi_memo_forget` 可能找不到有效记忆；
- `xpi_memo_show_injected` 可能无法反查已注入记忆；
- forget 的 recovery 写入可能在删除前失败。

应使用 Mnemosyne 的稳定主键读取能力。若 CLI 没有该能力，应将其记录为上游能力缺口，不能把相关性 recall 当作精确查询实现。

### P1：fallback backend 未实现 offset 分页

位置：

- `src/search/mnemosyne-backend.ts:159`
- `src/search/ripgrep-backend.ts:120`
- `src/search/qmd-backend.ts:100`

`SearchQuery` 新增了 `offset`，但：

- Mnemosyne backend 实现了 offset；
- ripgrep 忽略 offset；
- qmd 忽略 offset。

当 Mnemosyne 不可用时，`xpi_memo_recall({ offset: ... })` 会返回第一页，而不是请求页，不符合 recall 的分页契约。

### P1：多 bank 查询的分页语义不稳定

位置：`src/search/mnemosyne-backend.ts:170`

项目查询并发查询 project bank 和 default bank，然后对合并结果统一执行：

```ts
batches.flat().slice(offset, offset + query.limit)
```

但每个 bank 只请求 `query.limit + offset` 条，且分页发生在两个 bank 拼接后。结果的分页边界依赖 bank 合并顺序，没有稳定的全局排序和明确的去重规则。

### P2：`formatMemoryList()` 未接入用户可见工具输出

位置：

- `src/formatting.ts:18`
- `src/index.ts:1194`

`formatMemoryList()` 已实现，但生产代码没有调用方。`xpi_memo_recall` 仍返回原始 JSON，因此标题生成和列表格式化没有完成用户可见接入。

### P2：MEMORY.md 止血方案无法覆盖没有 memoryId 的存量事件

位置：`src/markdown-export/memory-generator.ts:89`

剔除逻辑仅删除带 `memoryId` 的 `t1_memory_write`：

```ts
if (memoryId && deletedIds.has(memoryId)) continue;
```

历史 `t1_memory_write` 事件没有 `memoryId` 时，后续 `memory_deleted` 无法关联旧事件。任务 `2.5` 保持未完成是正确的，不能视为 P0 完成。

## 任务状态

`tasks.md` 当前仍有两个未完成项：

- `2.5` 存量已删条目处理；
- `5.4` Track B 的 `show_injected` 端到端验收。

`tasks.initial.md` 与 `tasks.md` 的任务 ID 集合一致，未发现任务遗漏。

但 `README.md` 的状态统计和阻塞记录已过时，仍写着：

- 已完成: 5；
- 失败: 1；
- 待执行: 15；
- 任务 1.6 失败。

这些内容与 `tasks.md` 当前状态不一致，应修正，或不要将 fast-fix 标记为 `archived`。

## Verification

本次评审已执行：

```text
pnpm typecheck        通过
pnpm -w run lint      通过
pnpm test             通过：600 passed，6 skipped
 git diff --check      通过
LSP primary diagnostics 通过
```

上述检查不能覆盖协议和真实 CLI 语义问题。测试主要使用 mock runner，未能证明真实 Mnemosyne 的按 ID 查询行为；该行为已通过本地 CLI 重现为不可靠。

## Standards

- 仓库要求 governed T1 write 遵守 L0 first 双写语义；当前改动违反该契约。
- 新增分页参数后，fallback backend 未同步实现相同契约。
- 关键测试依赖 mock，真实 CLI 行为覆盖不足。

## Final Recommendation

**不要关闭该 fast-fix。** 执行顺序建议：

1. 立即恢复 L0/T1 双写顺序，或设计具备一致性保证的补偿方案；
2. 找到稳定的 Mnemosyne 精确 ID 查询能力，或正式记录该上游缺口；
3. 保持 `2.5` 和 `5.4` 为未完成/阻塞；
4. 更新 `README.md` 的任务统计和阻塞记录；
5. 在 runner 接入后重新执行至少 10 个真实 Track B 会话，再验证 `show_injected`。
