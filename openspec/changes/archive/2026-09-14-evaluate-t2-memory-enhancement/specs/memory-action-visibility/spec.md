## Purpose

让用户能够在不被打断的情况下知道记忆动作是否发生、是否生成候选以及是否失败，同时保留低噪声、可配置和可审计的状态反馈。

## ADDED Requirements

### Requirement: Memory actions MUST expose bounded transient status

记忆捕获、候选生成、确认、拒绝、失败和降级 MUST 产生短暂、可区分的状态提示，且提示不得包含记忆正文、凭据或敏感内容。

#### Scenario: Explicit memory is captured
- **WHEN** a memory action completes successfully
- **THEN** the user MUST see a bounded transient status with action type and outcome
- **AND THEN** the status MUST disappear without blocking the active Pi interaction

### Requirement: Visibility MUST be configurable

系统 MUST 支持流光显示、灰度显示和不显示三种状态提示等级；配置改变不得改变记忆治理结果。

#### Scenario: User disables transient status
- **WHEN** the user selects the no-display level
- **THEN** memory capture and governance MUST continue unchanged
- **AND THEN** detailed outcome MUST remain available through status or audit surfaces

### Requirement: Candidate confirmation MUST be the only interruptive path

普通捕获、成功、降级和失败状态 MUST NOT 强制打开咨询框；只有需要用户确认的候选 MAY 打开现有确认界面。

#### Scenario: Derived proposal needs review
- **WHEN** a T2 proposal requires confirmation under T1 policy
- **THEN** the system MAY open the existing candidate review surface
- **AND THEN** the user MUST be able to store, defer, or reject it

### Requirement: Failure status MUST identify safe recovery

当 T2 或其模型/索引不可用时，状态 MUST 表明失败或降级，并指向可用的 baseline recall；失败不得阻塞当前会话。

#### Scenario: T2 backend is unavailable
- **WHEN** an optional T2 backend cannot start or returns an error
- **THEN** the user MUST receive a bounded degraded-status indication
- **AND THEN** xpi-memo MUST continue using its existing backend fallback chain
