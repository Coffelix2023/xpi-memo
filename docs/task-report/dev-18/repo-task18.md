# Task Report: evolve-memory-runtime task 5.x

## 完成范围

本次完成 Section 5(Cross-session behavior evaluation)全部 3 个任务,进度从 14/21 推进到 17/21。

### 目的

记忆写入了不等于记忆有用。本节建立可重复的跨 session 行为评测:固定场景驱动与生产一致的治理钩子,验证记忆真的改变了后续注入/召回行为,并把作用域泄漏、错误记忆、纠正滞后等风险变成有界指标而非主观体验。

### 作用与特点

- **行为而非存储**:每个场景的通过标准是"记忆影响了下一次 session 的注入上下文/召回结果",不是"行存在于 bank"。比如偏好存活的判定是第二个 session 的 `before_agent_start` 注入块包含该偏好,且用户看到有界状态行。
- **治理入口零旁路**:场景走真实 `input`/`before_agent_start` 钩子、真实候选生命周期(candidates.json)、真实 audit/idempotency/L0 文件持久化;Mnemosyne 仅在 CLI 边界 mock,双写顺序与生产一致。
- **环境与逻辑分离**:`buildEvaluationReport(cases, backendAvailable)` 把后端缺失从逻辑失败里拆出,环境缺失永不伪装成记忆逻辑通过(spec 硬性要求)。

### 边界

- 评测 fixtures 是测试代码,不是产品功能;metrics 模块 `eval-metrics.ts` 是纯函数,不在运行时注入。
- 语义级矛盾仍由显式纠正驱动(4.3);本节只验证其跨 session 效果。
- passive 反馈不能创建/确认持久记忆的约束沿用 4.2,本节场景覆盖其副作用(无额外审计动作)。

## 各任务实现要点

| 任务 | 实现 |
|------|------|
| 5.1 固定 fixtures | `src/cross-session-eval.integration.test.ts`:7 个场景——偏好跨 session 注入、项目隔离(A 决策不进 B 上下文)、候选未确认(不注入、不写 bank、留在 pending)、显式纠正(supersedes → 下个 session 新值主导)、召回无命中(有界 no-op)、后端 fallback(audit 投影 fallback 标志)、写入失败(L0 memory_failed,无 phantom write)。全部经真实钩子 |
| 5.2 有界指标 | `src/eval-metrics.ts`:`computeBehaviorMetrics` 输出六项 0..1 有界指标(preferenceAccuracy/scopeLeakRate/falseMemoryRate/correctionLatency/memoryUtility/userAwareness),计数 clamp,延迟 clamp 99 session;`backendAvailable` 独立字段。`src/eval-metrics.test.ts` 4 条单测 |
| 5.3 跨 session 集成 | 同文件 2 条:durable 偏好在第二个 session 实例注入成功;`traceMemoryEvent` 把 t1_memory_write 事件链回 `input:interactive` 溯源(sessionId/provenance/kind);指标投影锁定 6 案例基线 |

## 验证

- `pnpm typecheck` ✓
- `pnpm -w run lint`(biome)✓ 0 issue
- `pnpm test` ✓ 745 passed(新增 eval-metrics 4 条 + cross-session 集成 9 条)

## 修复过程中的两个真问题

1. `sessionTurn` 最初按 `[xpi-memo]` 前缀拆分状态行,但实际钩子返回 `✦` 前缀状态行 + `<untrusted-memory-data>` 上下文块,拆分逻辑按实际格式重写。
2. 显式纠正经 `xpi_memo_remember`(evidenceType=verified-tool-result)必然进入候选队列(rpc 模式判 "later"),这是治理设计而非 bug;测试改用 `ctx.mode="tui"` + `select:"Store"` 走真实用户确认路径,correction feedback 才会落 audit。

## 回滚

删除 `src/eval-metrics.ts`、`src/eval-metrics.test.ts`、`src/cross-session-eval.integration.test.ts` 即回到 4.x 状态;这三个文件均为纯附加,不触碰运行时代码路径,T1/L0/audit 行为不变。
