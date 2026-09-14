# 记忆动作状态可见性模型

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 4.1 / 4.2。

**作用**：定义六类记忆动作在三种可见性等级下**显示什么、不显示什么、以及什么时候才可以打断用户**。

**边界**：本文件只定义模型与边界，不实现；示例数据在 `action-visibility.example.json`，断言在 `scripts/t2-contract-check.ts`。可见性等级只影响**显示**，不改变任何治理结果。

---

## 1. 三种可见性等级

配置键：`statusVisibility`，取值 `stream` / `dim` / `hidden`。默认 `stream`——**保持现状**（今天 `setFooterStatus(ctx, paused, true)` 会打 1 秒的 `✦ memo on` 脉冲，见 `src/footer.ts:22-35`）。

| 等级 | 中文 | 呈现 | 是否动画 | 是否占用定时器 |
| --- | --- | --- | --- | --- |
| `stream` | 流光 | `ctx.ui.setStatus` 播放脉冲（如 `✦ memo on`）后 1 s 回落常驻态（`● memo on`） | 是 | 是（1 s 后自动清除） |
| `dim` | 灰度 | 直接落到常驻态的中性文案，不做脉冲 | 否 | 否 |
| `hidden` | 不显示 | 完全不改 footer；细节仍可从 `xpi-memo-status` 与 audit 取 | 否 | 否 |

**等级不改变什么**（写进契约，`memory-action-visibility` 的 Scenario: User disables transient status 要求）：

- 不改变捕获、候选、确认、拒绝、失败、降级的**判定与落库结果**；
- 不改变候选队列内容与计数；
- 不改变 L0 事件与 audit 记录；
- 不改变 recall 返回内容。

`hidden` 只是关掉**像素**，不是关掉**记录**。审计与状态面板在任何等级下都可回查细节。

## 2. 六类动作状态

`actionState` 是封闭集合。每个状态都必须有：一个 `auditAction`（回查入口）、一组 `payloadKeys`（允许出现在状态里的字段）、以及明确的"是否可打断"。

| `actionState` | 触发点 | payload 允许字段 | 对应 `auditAction` | 可打断 |
| --- | --- | --- | --- | --- |
| `captured` | 直接写入 T1（`xpi_memo_remember` / 激活循环） | `actionState` `level` `kind` `scope` `bank` `status` | `write` | ❌ |
| `candidate-created` | 生成待审候选 | `actionState` `level` `kind` `scope` `bank` `reason` `evidenceType` | `candidate` | ❌ |
| `candidate-confirmed` | 用户确认并成功落库 | `actionState` `level` `kind` `scope` `bank` `operationId` | `confirmation` | ❌（确认**之前**的那一次交互才是打断点） |
| `candidate-rejected` | 用户拒绝或冲突上报 | `actionState` `level` `kind` `reason` | `rejection` | ❌ |
| `failed` | 写入失败 / `unresolved` / 抽取出错 | `actionState` `level` `reason` `operationId` `identity` | `write` / `extraction` | ❌ |
| `degraded` | 后端回退、embedding 无贡献、图谱降级、T2 不可用 | `actionState` `level` `backend` `fallback` `reason` | `fallback` | ❌ |

### 2.1 三档呈现（同一状态，三种画法）

| `actionState` | `stream` | `dim` | `hidden` |
| --- | --- | --- | --- |
| `captured` | `✦ memo on` 脉冲 1 s | `● memo on` | 不动 footer |
| `candidate-created` | `✦ memo pending` 脉冲 1 s | `● memo pending` 常驻 | 不动 footer |
| `candidate-confirmed` | `✦ memo stored` 脉冲 1 s | `● memo on` | 不动 footer |
| `candidate-rejected` | `✦ memo skipped` 脉冲 1 s | `● memo on` | 不动 footer |
| `failed` | `✦ memo error` 脉冲 1 s（有界 reason 进 audit） | `● memo error` 常驻直到下一次成功动作 | 不动 footer |
| `degraded` | `✦ memo degraded` 脉冲 1 s | `● memo degraded` 常驻直到恢复 | 不动 footer |

注意：**文案里没有正文**。状态行只携带动作与结果，`reason` 是有界错误码，不是错误原文。

## 3. 字段白名单（任务 4.1 的核心验证点）

状态 payload 的允许字段 = `src/audit.ts` 的 `AuditMetadata` 字段集合的子集 + 三个状态字段：

```
actionState, level, status, outcome, reason, kind, scope, bank, backend,
fallback, evidenceType, operationId, identity, confidence,
resultCount, injectedCount, omittedCount, blockedCount, candidateCount,
```

**禁止键（出现即视为违规）**：

```
content, text, body, memory, memoryContent, preview, snippet,
query, prompt, transcript, toolResult, raw, secret, token, apiKey, credential
```

这条边界不是靠自觉，而是靠断言：`scripts/t2-contract-check.ts` 检查示例里每个状态的 `payloadKeys` 都在白名单内，且整个文件里不出现任何禁止键。

来源一致性：`AuditMetadata` 的注释里已经写明「never memory bodies」（`src/audit.ts:31-32`），本表只是把它扩展到状态提示。

## 4. 交互边界（任务 4.2）

### 4.2.1 只有一条路径可以打断

| 路径 | 能否打开咨询框 | 代码依据 |
| --- | --- | --- |
| 普通捕获（tool 调用 / 激活循环 / 离线抽取） | ❌ | 捕获路径只调 `setFooterStatus`（`src/index.ts:417`），不触碰 `ui.select/confirm/custom` |
| T2 失败 / 降级 / 后端回退 | ❌ | 失败路径写 audit（`action: "fallback"` / `"write"`）与 L0 事件，不开对话框 |
| 候选需要用户确认 | ✅ **唯一** | `chooseCandidateAction`（`src/index.ts:671-691`） |
| 显式命令（`/xpi-memo`、`/xpi-memo-candidates`、`/xpi-memo-trace`） | ✅（用户主动请求，不算打断） | `ctx.ui.custom`（`src/console.ts:588`、`src/status-panel.ts:458`）与 `ctx.ui.notify` |

全仓库的阻塞式提示调用点只有三处：`src/index.ts:681`（候选动作选择）、`src/console.ts:588` 与 `src/status-panel.ts:458`（面板）。其余 `ctx.ui.notify` 全部在命令处理器里，属用户主动请求。

### 4.2.2 候选确认还要过两道闸

`chooseCandidateAction` 的前两行就是闸门：

1. `if (ctx.mode !== "tui") return "later";` —— 非 TUI（`print` / `json`）**永不**弹框，候选留队列。
2. `if (!force && !config.confirmStore) return "store";` —— 默认 `confirmStore=false`，普通路径不弹框。

只有显式传入 `force=true`（`/xpi-memo` 控制台的 Pending 复核路径，`src/index.ts:2144-2148`）才会强制显示选择面板。

**推导出的结论**：T2 提案想打断用户，唯一合法方式是**进入候选队列**，然后等用户在复核面板里主动操作。T2 不能自己触发 `force`，也没有别的入口。

### 4.2.3 状态与打断的关系

可见性等级**不影响**打断边界：

- `hidden` 下候选仍然进队列，用户仍能从 `/xpi-memo` 复核；
- `stream` 下捕获仍不弹框，只是多闪一下；
- 任何等级下 T2 失败都不弹框。

## 5. 示例与断言

示例：`docs/evaluation-reports/t2/action-visibility.example.json`（6 个状态 × 3 档呈现 + 5 条边界用例）。

```bash
node scripts/t2-contract-check.ts
```

断言的 4 条硬规则：

| 编号 | 断言 |
| --- | --- |
| V1 | 每个状态的 `payloadKeys` 全部在白名单内 |
| V2 | 每个状态的 `payloadKeys` 不含禁止键，且整个示例文件**不以禁止键作为字段名**（数组中声明这些字符串是允许的） |
| V3 | 每个状态的 `auditAction` 属于 `AUDIT_ACTIONS` 封闭集合 |
| V4 | 5 条边界用例中**恰好 1 条**允许打开提示框，且普通捕获/T2 失败/降级三条必须为「不可打断」 |

## 6. 对后续任务的影响

- **5.2**：V4 是门槛条款——任何让 T2 直接弹框、或在非 TUI 模式下阻塞的方案一律拒绝。
- **4.3**：`degraded` 状态的 `reason` 字段与诊断字段共用同一套有界错误码，避免出现两套命名。
