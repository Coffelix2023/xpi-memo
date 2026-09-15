# preference-profile-evolution Specification

## Purpose

把显式偏好、工作流和沟通习惯从离散记忆记录提升为可追溯的派生画像，使 Agent 能在用户纠正、冲突和新证据出现后安全地更新长期理解，而不是简单累积文本。

## Requirements

### Requirement: Preference profiles MUST be derived from governed memories

Profile MUST 由已通过现有 T1 治理的记忆派生，不得成为绕过 L0、证据、作用域或候选流程的第二个事实存储。每个 profile 项 MUST 保留来源记忆引用、作用域、最后确认时间和当前状态。

#### Scenario: Stable preference is projected
- **WHEN** 一个 global preference 或 global workflow 已确认并可用于长期指导
- **THEN** 系统 MAY 将其投影到用户 Profile
- **AND THEN** Profile MUST 能追溯到原始记忆和用户事件

#### Scenario: Candidate is not confirmed
- **WHEN** 偏好仍处于 candidate 状态
- **THEN** 系统 MUST 将其标记为 pending 或排除在稳定 Profile 外
- **AND THEN** Agent MUST NOT 将其当作稳定用户偏好

### Requirement: Preference updates MUST support supersession and conflict states

系统 MUST 支持新偏好替代旧偏好，并 MUST 能表示相互冲突、临时覆盖和待确认状态。新偏好不得仅因时间更新就静默删除旧来源。

#### Scenario: User corrects a preference
- **WHEN** 用户明确纠正一个已有偏好
- **THEN** 新偏好 MUST 建立 supersedes 关系并成为当前有效值
- **AND THEN** 旧偏好 MUST 保留历史和来源，但不得主导自动 Profile 注入

#### Scenario: Prompt-local override occurs
- **WHEN** 用户只对当前任务临时要求不同语言、风格或工具策略
- **THEN** 系统 MUST 将其限制在 session/task 范围
- **AND THEN** 系统 MUST NOT 自动覆盖稳定 global preference

#### Scenario: Contradictory durable preferences exist
- **WHEN** 两个持久偏好无法同时成立
- **THEN** 系统 MUST 标记 conflict 并保留双方来源
- **AND THEN** 未经用户确认不得任意选择一方写入稳定 Profile

### Requirement: Preference confidence MUST incorporate bounded feedback

系统 MUST 能记录偏好被使用、被用户认可、被用户纠正、被标记无关或错误等反馈，并以有界方式更新 Profile 状态或置信度。反馈不得伪造用户明确陈述证据。

#### Scenario: Preference is helpful
- **WHEN** 用户明确确认或 Agent 记录到受控的 helpful feedback
- **THEN** 系统 MAY 提升该偏好的使用置信度或 freshness
- **AND THEN** 原始证据类型 MUST 保持不变

#### Scenario: Preference is wrong
- **WHEN** 用户明确表示某偏好错误或过时
- **THEN** 系统 MUST 降低、停用或进入候选替代流程
- **AND THEN** 后续 recall MUST 避免让该偏好继续主导结果

### Requirement: Profiles MUST be bounded and privacy-safe

Profile 注入 MUST 受条目数、字符数、作用域和敏感信息策略限制；系统 MUST 不得从单次情绪表达推断稳定人格、健康状态或敏感身份属性。

#### Scenario: Profile exceeds injection budget
- **WHEN** 可用 Profile 项超过配置预算
- **THEN** 系统 MUST 按状态、作用域、相关性和确认时间选择有界子集
- **AND THEN** 被省略项 MUST 可通过 status 或显式 recall 诊断

#### Scenario: Emotional statement is session-local
- **WHEN** 用户表达一次性情绪或当前压力
- **THEN** 系统 MUST 默认限制为 session context
- **AND THEN** 系统 MUST NOT 自动生成稳定 emotion/personality profile
