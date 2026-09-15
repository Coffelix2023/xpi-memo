## Purpose

为记忆生命周期提供低噪声、隐私安全且可关联的运行事件，使用户、Agent 与诊断工具能够知道记忆是否被检测、保存、召回、注入、拒绝或降级。

## ADDED Requirements

### Requirement: Memory lifecycle events MUST be emitted with bounded metadata

系统 MUST 为一次记忆操作发出可关联的生命周期事件，并为每个操作提供 operationId、session 标识、作用域、类别、状态和时间信息。事件默认 MUST 不包含记忆正文、原始工具结果、凭据或隐藏推理。

#### Scenario: Explicit preference is captured
- **WHEN** 用户明确表达一个可持久化偏好
- **THEN** 系统 MUST 发出检测事件，并继续发出 stored 或 candidate-created 的最终事件
- **AND THEN** 事件 MUST 保留来源事件位置和作用域

#### Scenario: Content is rejected
- **WHEN** 记忆内容因敏感信息、作用域不明或治理策略被拒绝
- **THEN** 系统 MUST 发出 rejected 事件
- **AND THEN** 事件 MUST 只包含有界 reason code，不得包含被拒正文

#### Scenario: Recall executes without hits
- **WHEN** 检索后端实际执行但没有可用结果
- **THEN** 系统 MUST 发出 recalled 事件并标记 no-hit
- **AND THEN** 该状态 MUST 与 backend-not-run 区分

### Requirement: Memory status MUST be visible without forcing a review dialog

系统 MUST 在现有 footer/TUI/status 表面提供当前或最近记忆操作的简短状态，并 MUST 支持用户进一步查看有界事件摘要。状态展示不得阻塞编码交互。

#### Scenario: Memory is being processed
- **WHEN** 捕获、候选创建、导出或检索正在进行
- **THEN** 系统 MUST 显示正在执行的阶段和 operationId 的可读短标识
- **AND THEN** 长耗时或失败状态 MUST 不阻塞主 Agent 会话

#### Scenario: Memory is automatically injected
- **WHEN** 召回结果被自动加入 Agent 上下文
- **THEN** 系统 MUST 让用户能够知道注入数量、作用域和受限结果状态
- **AND THEN** 系统 MUST 不强制展示全部记忆正文

### Requirement: Agent-visible memory summaries MUST be provenance-safe

系统 MAY 向 Agent 提供本轮记忆状态摘要，但摘要 MUST 仅包含经治理的范围、计数、状态和必要的记忆引用；候选、拒绝或未验证内容 MUST 不得伪装成已确认事实。

#### Scenario: Pending candidate exists
- **WHEN** 记忆候选已生成但尚未确认
- **THEN** Agent 摘要 MUST 标明 pending/candidate 状态
- **AND THEN** Agent MUST NOT 将其作为已确认长期记忆使用

#### Scenario: Event stream is unavailable
- **WHEN** 事件发布或状态表面发生可恢复失败
- **THEN** 记忆写入治理 MUST 保持原有成功或失败语义
- **AND THEN** 系统 MUST 记录 bounded degraded 状态，不得因可视化失败伪造成功
