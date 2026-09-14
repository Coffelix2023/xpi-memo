## ADDED Requirements

### Requirement: Security handling outcomes MUST be visible at runtime boundaries

运行时遇到记忆正文阻断、外部传输拒绝或安全副本生成失败时，系统 MUST 返回可行动且有界的结果状态。该状态 MUST 区分安全处理拒绝、候选/存储结果和未执行外部调用，并 MUST NOT 暴露完整记忆正文、Token、凭据或敏感片段。

#### Scenario: Recall output is partially blocked
- **WHEN** recall 返回的部分记忆因安全规则被阻断
- **THEN** 工具或自动激活结果 MUST 返回未阻断的安全条目
- **AND THEN** 结果 MUST 说明成功条目数和阻断条目数
- **AND THEN** 结果 MUST 不包含被阻断正文

#### Scenario: External transmission is refused
- **WHEN** 外部 runner 或 provider 调用因凭证或不确定安全状态被阻止
- **THEN** 运行时结果 MUST 标记外部调用未执行
- **AND THEN** 结果 MUST 说明不包含敏感数据的失败原因和后续可行动信息
- **AND THEN** 系统 MUST 保持既有 scope、L0 和治理状态语义，不得伪装成已完成的外部处理

#### Scenario: Security diagnostics are queried without a TUI
- **WHEN** 用户在非 TUI 环境请求 status 或 doctor
- **THEN** 系统 MUST 展示有界安全处理计数和失败类别
- **AND THEN** 结果 MUST 与 L0/audit 中的安全元数据一致
- **AND THEN** 结果 MUST 不包含记忆正文或凭证
