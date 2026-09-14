## Why

受门控的离线提取（offline extraction，会话末让模型通读会话并提炼记忆的路径）已全部实装：输入预算、幂等、治理管道、`session_shutdown` / `session_before_compact` 触发点、审计计数、诊断状态都在。但**从未用真实模型跑过一次**——已有冒烟使用的是测试注入的假 runner，真实会话的捕获质量零数据，连续三轮评审都记为"最刺眼的空格"。

原因是运行时边界的设计选择：runner（执行器）由宿主注入，仓库内不持有模型客户端，所以无法在真实会话里通电。但 Pi 的 `ExtensionContext` 已经提供 `modelRegistry.complete(model, context, options)` 与当前会话模型，扩展可以自行调用——"必须由外部宿主提供"是我们的自我约束，不是平台限制。

这块数据缺失有明确代价：ai-memory 在本项目的角色（分工模式 vs 接管模式）按既定决策树由 Track B 的漏捕获率决定，没有数据就连接入规格都写不出来。

## What Changes

- 新增一个默认的会话模型 runner 实现，使用 `ctx.modelRegistry` 与 `ctx.model`；仅在 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` 且当前会话存在可用模型时启用，**默认关闭**。
- 保持 `dependencies.offlineExtractionRunner` 为最高优先级的注入点，测试与外部宿主的既有行为不变；默认 runner 只在注入缺失时作为兜底。
- 保持全部既有边界不变：最多 200 个尾部事件、60,000 输入字符、每 session 一次执行、20 条提案、5,000 输出字符、出域前凭证脱敏、证据类型为 `llm-extracted` 且永不冒充 `explicit-user-statement`、失败不阻塞会话关闭。
- 新增可诊断的运行结果状态：模型不可用、provider 未认证、超时或被中止，各自产生有界、无正文的诊断记录，且不消耗或正确消耗既有预算账本。
- 新增一次真实会话的验证记录：人工标注表、漏捕获率、准确率、漏捕获根因分类，作为 ai-memory 角色判定的输入证据。
- 明确不做：不在本 change 内接入或安装 ai-memory，不改变默认开启策略，不引入嵌入模型或新运行时依赖。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `memory-activation-loop`: `Offline extraction MUST be gated and non-blocking` 增加"默认会话模型 runner 作为可选的默认实现"以及"runner 不可用时产生有界诊断"的行为，仍保持默认关闭与非阻塞。
- `memory-observability`: `Offline extraction MAY enrich memory capture when gated` 增加运行器可用性状态，使"开启了但模型不可用"与"开启了但没抓到东西"可区分。

## Impact

- 运行时路径：`src/offline-extraction.ts`（runner 装配与结果归一化）、`src/index.ts`（`session_shutdown` / `session_before_compact` 装配与依赖边界）、新增默认 runner 模块。
- 契约与诊断：`src/observability.ts` 的提取结果计数、`src/status.ts` 的提取状态展示、`src/extraction-budget.ts` 的预算消耗语义。
- 安全：出域内容继续经过 `src/memory-safety.ts` 的凭证脱敏，失败即拒绝外发。
- 文档：离线提取契约说明与验证记录归档位置。
- 不新增运行时依赖，不修改 L0 契约，不改动候选治理与 Markdown 投影。
