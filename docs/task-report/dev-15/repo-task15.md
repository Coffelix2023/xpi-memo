# Task Report: evolve-memory-runtime task 1.x–2.x

## 完成范围

本次完成了 `evolve-memory-runtime` 变更的 Section 1(Memory lifecycle event foundation)与 Section 2(User-visible status),共 6 个任务。

### 目的

xpi-memo 已有 L0 会话轨迹、T1 治理记忆和 audit 审计,但用户与 Agent 均无法感知记忆"正在被捕获/召回/注入/拒绝"这一运行时事实。本节任务在不改动治理底座的前提下,把 audit 审计日志投影为低噪声、隐私安全的生命周期事件流,并暴露到三处用户可见表面。

### 作用与特点

- **单一事实源不变**:audit log 仍是持久化 provenance 记录;事件流只是它的 presentation-only 投影。没有第二套存储。
- **body-free 契约**:事件只携带 kind/scope/count/operationId/reasonCode 等有界元数据,序列化层硬性拒绝 content/body/query/token 等字段。
- **fail-open**:事件观察者抛错不影响 T1 写入或 recall 正确性。
- **全路径覆盖**:remember/reject/candidate/confirm/write/recall/inject/delete/degrade 全部经 `audit.record` 一处挂钩发出事件,每个操作带 correlation operationId。

### 边界

- 不包含 Profile 派生(Section 3)、反馈语义(Section 4)、跨 session 评测(Section 5)。
- footer 事件行仅 TUI 模式渲染;非 TUI(如 SDK)模式无状态条。

## 各任务实现要点

| 任务 | 实现 |
|------|------|
| 1.1 事件契约 | `src/event-stream.ts`:9 种有限事件 kind、有界元数据(文本 80 字符、计数 ≤9999)、`serializeMemoryEvent` 拒绝 forbidden keys、`shortOperationId` 有界短标识 |
| 1.2 in-process observer | `createMemoryEventBus`:有界 ring buffer(默认 20)、订阅者异常吞掉、非 commit 路径;挂在 `createAuditLog.record` 尾部 |
| 1.3 全路径发事件 | audit → event 投影覆盖 capture/rejected/candidate/confirmed/stored/recalled/injected/deleted/degraded;remember 与 recall 操作生成 `randomUUID` operationId 并写入全部相关 audit 条目;recall 带 injectedCount 时重分类为 injected 事件 |
| 2.1 footer 一行状态 | `setFooterEventStatus`:节流 1.5s 回落、显示 kind ×count scope #opId;`session_start` 订阅 bus,渲染异常 fail-open |
| 2.2 status 事件摘要 | `MemoryStatus.events`(最近 10 条 body-free 事件)进入 `/xpi-memo-status` JSON;backend 字段区分 backend-not-run 与 queried-no-hits |
| 2.3 Agent 可见摘要 | `ToolDetails.statusSummary`:candidatePending/injectedLast/recalledLast/scope 计数;candidate 数量始终标为 pending,不冒充已确认事实 |

## 验证

- `pnpm typecheck` ✓
- `pnpm -w run lint`(biome)✓ 0 warning
- `pnpm test` ✓ 713 passed(新增 `event-stream.test.ts` 10 条 + footer 事件行 1 条)

## 回滚

事件流为纯附加投影:删除 `src/event-stream.ts`、还原 `audit.ts` 的 emit 挂钩、去掉 footer 订阅与 `MemoryStatus.events` 即回到原状;L0/T1 数据与既有工具行为完全不变。
