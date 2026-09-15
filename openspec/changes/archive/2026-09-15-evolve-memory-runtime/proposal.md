## Why

`xpi-memo` 已经具备 L0 会话轨迹、T1 治理记忆、显式意图捕获、作用域隔离、证据链和降级检索，但用户仍难以知道记忆是否正在被捕获、召回、注入或拒绝；偏好也主要停留在分类存储，尚未形成可纠正、可演化、可评估的用户画像闭环。2026 年 Agent memory 的竞争重点已从“保存并搜索文本”转向“可观察生命周期、冲突与版本管理、反馈驱动的持续维护”，因此应在不替换现有治理底座的前提下补齐运行时能力。

## What Changes

- 新增受隐私约束的 Memory Event Stream，覆盖检测、拒绝、候选、确认、存储、召回、注入、使用、替代、删除和降级等生命周期事件。
- 将记忆运行状态以低噪声方式暴露到 footer/TUI、status/doctor 和 Agent 可见的受控摘要，明确区分 stored、candidate、rejected、recalled、injected 和 degraded。
- 在现有 7 类 taxonomy 与 T1 记忆之上新增派生 User Preference Profile，不建立第二个事实存储；Profile 必须保留来源、作用域、确认时间、置信度和替代关系。
- 增加偏好冲突、supersedes、纠正和反馈语义，支持用户纠正后停止使用旧偏好。
- 增加 memory-used/helpful/wrong/irrelevant 等受控反馈，作为偏好置信度、召回排序和维护策略的输入。
- 增加跨 session 记忆行为评测契约，验证偏好准确性、作用域隔离、纠正延迟、错误记忆率和用户可感知性。
- 保留现有 L0/T1、candidate、evidence、scope fail-closed、Markdown export 和搜索 fallback；不引入第二套记忆数据库、云端服务或大型外部 memory runtime。

## Capabilities

### New Capabilities

- `memory-event-stream`: 记忆生命周期事件、低噪声状态呈现、隐私安全的事件订阅和受控 Agent 摘要。
- `preference-profile-evolution`: 从现有 T1 记忆派生用户偏好画像，并支持来源、置信度、冲突、替代、纠正和反馈演化。
- `memory-behavior-evaluation`: 跨 session 记忆行为评测场景、指标和固定验证契约。

### Modified Capabilities

- `memory-activation-loop`: 自动捕获、候选创建、提取失败和偏好纠正必须发出可观察事件，并保留原有治理与证据边界。
- `memory-observability`: status/doctor 必须展示记忆生命周期事件摘要、Profile 状态和反馈/冲突计数，同时不得暴露记忆正文或敏感内容。
- `memory-operation-closure`: 记忆操作必须具备可关联的 operationId、最终状态和降级结果，便于用户和测试确认操作是否完成。
- `t1-governance`: 新增反馈、替代、冲突和 Profile 派生结果不得绕过现有证据、作用域、候选和删除治理。

## Impact

- 主要影响 `src/index.ts`、`src/memory-activation.ts`、`src/observability.ts`、`src/status.ts`、`src/footer.ts`、`src/surface.ts`、`src/t1-lifecycle.ts` 及新增的事件/Profile/反馈模块。
- 需要扩展现有 audit、L0 provenance、candidate lifecycle、recall ranking 和 status schema，但不改变既有记忆存储的单一真相源。
- 需要补充集成测试和固定评测脚本；实现阶段必须继续通过 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test`。
- 不包含数据库迁移、完整 Web dashboard、云端 embedding、自动人格/情绪诊断或直接替换 Mnemosyne 的范围。
