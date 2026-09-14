## Context

`offline-extraction.ts` 已具备完整的预算、幂等与治理管道，但 runner 由 `dependencies.offlineExtractionRunner` 注入，仓库内没有实现，因此真实会话从未跑过。见 `proposal.md - Why`。

实施前已核实的平台事实（`@earendil-works/pi-coding-agent` 类型与运行时）：

| 事实 | 位置 |
| --- | --- |
| `ExtensionContext.modelRegistry` 暴露 `complete(model, context, options): Promise<AssistantMessage>` | `dist/core/model-registry.d.ts` |
| `ExtensionContext.model` 是当前会话模型，可能为 `undefined` | `dist/core/extensions/types.d.ts` |
| 事件处理器签名是 `(event, ctx)`，可以是异步 | `dist/core/extensions/types.d.ts` |
| `session_shutdown` 的处理器被 **await**，之后才 dispose 会话 | `dist/core/agent-session-runtime.js` 的 `dispose()` / `teardownCurrent()` |

最后一条决定了本设计可行：在会话关闭阶段发起一次有界的模型调用，可以在会话被销毁前完成。

## Goals / Non-Goals

**Goals:**

- 提供一个默认的会话模型 runner，使受门控的离线提取能在真实会话中通电并被观测。
- 保持既有 seam：外部注入优先，默认实现只是兜底。
- 保持默认关闭，保持非阻塞，保持全部既有预算与脱敏边界。
- 产出一次可归档的真实会话验证记录，作为 ai-memory 角色判定的输入。

**Non-Goals:**

- 不接入、不安装、不评估 ai-memory 本体。
- 不改变默认开启策略，不引入嵌入模型，不新增运行时依赖。
- 不新增模型选择配置项（缺省使用当前会话模型）。
- 不做重试、不做后台补跑、不做跨会话的提取队列。

## Decisions

### D1: 默认 runner 独立成模块，生命周期模块保持 provider-neutral

新增默认 runner 模块，`offline-extraction.ts` 继续只接受注入的 runner，不引用模型类型。

- **替代方案：在 `index.ts` 里内联模型调用**。否决。会让生命周期模块与模型耦合，并失去现有的可注入测试面。
- **替代方案：继续只支持外部注入**。否决。这正是当前僵局的成因。

### D2: 三重启用条件，全部满足才调用模型

`XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` **且** 存在活跃模型 **且** 本次生命周期事件尚未消耗执行预算。任一不满足即不发起任何模型请求。

- **替代方案：默认开启**。否决。与仓库既定的默认值哲学冲突（消耗外部资源或不可逆的操作默认关闭），且会让费用与隐私暴露变成默认值。
- **替代方案：开启即忽略模型可用性**。否决。会把"没有模型"变成一次失败运行，污染诊断计数。

### D3: 调用形态用 `modelRegistry.complete`，不用会话消息

使用注入的 `ctx.modelRegistry.complete(ctx.model, context, options)`，带 `AbortSignal` 与固定超时。

- **替代方案：`pi.sendUserMessage`**。否决。它会触发一轮真实对话，污染当前会话上下文，与"会话末一次性提炼"的语义不符。
- **替代方案：`pi.exec` 调用外部 CLI 模型**。否决。引入新的外部依赖与密钥管理面。

### D4: 输出必须结构化，解析失败按"无提案"处理

要求结构化输出（类别、内容、置信度、来源引用），归一化后进入既有治理管道。解析失败不产生提案，只产生一个有界诊断计数；模型原始输出永不写入 audit 或 L0 正文。

- **替代方案：自由文本 + 二次解析**。否决。不可靠，且二次调用翻倍费用。

### D5: 预算语义保持不变

任何一次尝试（成功、失败、超时、不可用）都消耗该会话的执行预算，与既有实现一致，防止关闭阶段的重复触发造成重试风暴。本变更只增加**诊断状态的可区分性**，不改变消耗规则。

### D6: 出域前脱敏与拒绝外发沿用既有边界

`prepareExternalEvents` 仍是唯一的出域准备路径；无法确认安全时拒绝外发。会话模型被视为外部 runner，与既有 spec 的"外部 runner"约束同源，因此不新增 capability。

## Risks / Trade-offs

- **会话关闭阶段调用可能被进程退出打断** → 运行时已 await 关闭处理器；仍加固定超时，并把该路径设为 best-effort：失败只记状态，不阻塞关闭，不重试。
- **会话模型可能昂贵或受限** → 默认关闭；缺省不新增模型选择配置，若实际需要再由后续变更添加。
- **提案质量未知（这正是本变更要测的东西）** → 验证记录必须如实报告漏捕获率与准确率，包括"零提案"这一结果；不得为达成预期而调参。
- **模型输出可能夹带敏感内容** → 提案继续走既有 content policy 与脱敏；audit 只记计数、状态与类别，不记正文。
- **关闭路径的失败会影响用户对会话退出的感知** → 全程 best-effort，任何失败都不得改变会话关闭的结果。

## Migration Plan

无数据迁移，无默认值变化。

- 部署：默认 runner 随代码发布，但默认关闭，未开启用户的行为完全不变。
- 开启验证：设置 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true`，跑一次真实会话，观察 audit 提取记录与候选产出。
- 回滚：设回 `false`，或 revert 提交；已产出的候选照常走既有治理，不受影响。

## Open Questions

无。`session_shutdown` 阶段 `ctx` 的可用性已由运行时源码核实为 await 语义；若实施时发现特定退出路径（例如进程被强制终止）无法完成调用，属于既有的 best-effort 边界，不改变本设计或任务拆分。
