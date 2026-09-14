# xpi-memo 记忆体优化实施计划

- 工作流标识: `xpi-fast-fix-2026-09-04-xpi-memo-memory-optimization`
- 创建时间: `2026-09-04T14:04:30+0800`
- 原始需求摘要: 优化本项目 `xpi-memo`，按照 `docs/plans/plan-note-04.md` 指定开发任务。
- `planStatus: archived`
- `executionStatus: deferred`
- 计划文件: [`plan.md`](./plan.md)
- 工作任务: [`tasks.md`](./tasks.md)
- 只读基线: [`tasks.initial.md`](./tasks.initial.md)

## 当前任务状态

计划已确认并持久化。阶段 1–5、6.1、7.1–7.3 已完成。6.2 真实会话止损线因环境不支持而 blocked，未伪造通过。基础门禁：`pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 全绿（589 passed / 6 skipped）。

## 基线说明

`tasks.initial.md` 是 `tasks.md` 的只读基线，禁止修改；用于每次任务完成后核对任务 id 与顺序，防止执行过程中遗漏任务。

## 恢复说明

执行命令：

```text
/xpi-fast-fix execute .pi/fast-fixes/2026-09-04-xpi-memo-memory-optimization
```

恢复执行时必须同时读取 `README.md`、`plan.md`、`tasks.md`、`tasks.initial.md`。只能编辑 `tasks.md`，不得修改 `tasks.initial.md`。

## 阻塞记录

- 6.2 真实会话止损线 blocked：未设置 `XPI_MEMO_RUN_PI_INTEGRATION=1`，当前会话也不是可交互真实 Pi 会话。开启该环境变量并跑真实会话后再验收证据链闭合 / ≥1 条自动捕获候选 / MEMORY.md 非空。
- “存量 8 条记忆”尚未在当前环境中得到证据支持；实施阶段必须先核实。若不存在，按计划中的替代验收标准执行，不得虚构数量。
- 全局清理必须先 dry-run 列举目标；无法确认归属的数据只归档，不删除。
