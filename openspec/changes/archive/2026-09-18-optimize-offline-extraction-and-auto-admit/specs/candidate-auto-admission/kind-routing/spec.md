# candidate-auto-admission/kind-routing Delta Specification

## MODIFIED Requirements

### Requirement: 策略路由可配置

系统 SHALL 支持通过配置文件设置 `autoAdmit` 默认值，环境变量 `XPI_MEMO_AUTO_ADMIT` 作为覆盖选项。全局 `XPI_MEMO_AUTO_VERIFY=false|0` SHALL 作为总 kill switch。当环境变量未设置时，系统 SHALL 从配置文件读取 `autoAdmit` 默认值（默认 `true`），允许 `project_gene` 验证通过后自动存储。项目级策略覆盖不属于当前契约。

#### Scenario: 全局关闭自动验证

- **WHEN** `XPI_MEMO_AUTO_VERIFY=false` 或 `0`
- **THEN** 所有 kind 的工具验证路径被禁用
- **AND** 全部候选进入待审队列
- **AND** 不记录通过验证后自动写入的结果

#### Scenario: 环境变量覆盖配置文件

- **WHEN** 环境变量 `XPI_MEMO_AUTO_ADMIT` 被显式设置为 `true` 或 `false`
- **THEN** 系统 MUST 使用环境变量值，忽略配置文件中的 `autoAdmit` 设置
- **AND** 环境变量优先级高于配置文件

#### Scenario: 默认启用自动准入

- **WHEN** `XPI_MEMO_AUTO_VERIFY` 未关闭且环境变量 `XPI_MEMO_AUTO_ADMIT` 未设置
- **THEN** 系统 SHALL 从配置文件读取 `autoAdmit` 值（默认 `true`）
- **AND** `project_gene` 验证通过后自动存储到 T1
- **AND** 其他 kind 根据其准入策略处理

#### Scenario: 配置文件关闭自动准入

- **WHEN** 配置文件 `autoAdmit: false` 且环境变量 `XPI_MEMO_AUTO_ADMIT` 未设置
- **THEN** 已启用 kind 的验证结果记录为 shadow
- **AND** 候选进入待审队列
- **AND** 不自动写入 T1

#### Scenario: 项目级覆盖策略

- **WHEN** 项目尝试提供 kind 级自动准入覆盖
- **THEN** 当前运行时忽略该项目级覆盖
- **AND** 仅全局 kill switch、环境变量和配置文件决定准入
- **AND** 所有未显式允许的候选保持待审
