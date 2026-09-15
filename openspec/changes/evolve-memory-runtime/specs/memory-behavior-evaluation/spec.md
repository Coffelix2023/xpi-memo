## Purpose

为记忆生命周期建立可重复的跨会话验证契约，确认记忆确实改善后续 Agent 行为，同时把作用域泄漏、错误记忆、纠正滞后和用户不可见状态作为可测风险而不是主观体验。

## ADDED Requirements

### Requirement: Memory behavior MUST be evaluated across sessions

系统 MUST 提供固定的跨 session 场景，验证记忆在新会话中是否改变了后续 Agent 行为，而不只验证记录是否写入数据库或文件。

#### Scenario: Durable preference survives a new session
- **WHEN** 用户在一个 session 明确确认语言或回答风格偏好，并在另一个 session 提出普通请求
- **THEN** Agent MUST 在不重复询问的情况下采用该偏好
- **AND THEN** 评测 MUST 能追溯采用行为关联的记忆来源

#### Scenario: Project memory does not leak
- **WHEN** 用户在项目 A 保存项目决策并在项目 B 提出相似请求
- **THEN** 项目 A 的记忆 MUST NOT 主导项目 B 的自动上下文
- **AND THEN** 评测 MUST 记录 scope leakage 为失败

### Requirement: Evaluation MUST cover corrections and uncertainty

评测 MUST 覆盖偏好纠正、候选未确认、召回无命中、后端降级、写入失败和过期/冲突记忆。

#### Scenario: Corrected preference takes effect
- **WHEN** 用户在后续 session 明确纠正旧偏好
- **THEN** 新偏好 MUST 在规定的会话边界内生效
- **AND THEN** 旧偏好不得继续主导行为

#### Scenario: Unconfirmed candidate is encountered
- **WHEN** 候选记忆尚未被用户确认
- **THEN** Agent MUST 把它视为不确定信息
- **AND THEN** 评测 MUST 验证它不会被当作稳定事实使用

### Requirement: Evaluation MUST expose bounded outcome metrics

评测 MUST 输出至少包含 preference accuracy、scope leakage rate、false memory rate、correction latency、memory utility 和 user-awareness outcome 的有界结果，并 MUST 区分测试失败与记忆后端未启用。

#### Scenario: Evaluation runs without semantic backend
- **WHEN** Mnemosyne 或 embedding backend 不可用
- **THEN** 评测 MUST 使用可用 fallback 或明确标记 backend unavailable
- **AND THEN** 不得将环境缺失伪装成记忆逻辑通过
