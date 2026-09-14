# xpi-memo memory consistency fixes

- workflowId: `ff-20260907-memory-consistency-fixes`
- createdAt: `2026-09-07T01:45:50Z`
- planStatus: `archived`
- executionStatus: `deferred`

## 原始需求摘要

按审核报告修复 `memory-consistency-hardening` 当前实现的三个一致性缺口：单 session 导出可能截断全局 `MEMORY.md`；T1/L0 的 `unresolved` 被压缩为 `rejected` 且 TUI 可能误写 `candidate_confirmed`；删除失败事件无法写入时仍返回 `failed`。补齐对应回归测试，不引入依赖，不自动提交 Git。

## 计划路径

- 计划：`.pi/fast-fixes/2026-09-07-memory-consistency-fixes/plan.md`
- 工作任务：`.pi/fast-fixes/2026-09-07-memory-consistency-fixes/tasks.md`
- 只读基线：`.pi/fast-fixes/2026-09-07-memory-consistency-fixes/tasks.initial.md`

`tasks.initial.md` 是任务集合与顺序的只读基线，用于每次更新 `tasks.md` 后核对任务未被遗漏或重排；执行期间禁止修改、重命名或删除。

## 当前任务状态

已执行完成(2026-09-07):全部 14 个任务标记为 done。Task 1(MEMORY.md 全量投影)、Task 2(unresolved 状态传播)、Task 3(deletion failure-event 边界)与 Task 4(质量门禁)均通过验证:`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`(644 passed)、`git diff --check` 全绿;`tasks.md` 与 `tasks.initial.md` 任务 ID 和顺序一致。

## 恢复说明

执行命令：

```text
/xpi-fast-fix execute .pi/fast-fixes/2026-09-07-memory-consistency-fixes
```

恢复执行时先读取本文件、`plan.md`、`tasks.md` 和 `tasks.initial.md`。每次只推进一个任务：先标记 `in_progress`，完成并通过该任务验证后立即标记 `done`，再与只读基线核对任务 ID 集合与顺序。验证失败或出现计划冲突时标记 `failed`、记录 blocker 并暂停。

## 阻塞记录

当前无阻塞。工作区已有未提交改动，本计划默认与这些改动共存，不回滚、不覆盖无关文件；本次执行范围只包含计划列出的生命周期、导出、调用方和测试文件。
