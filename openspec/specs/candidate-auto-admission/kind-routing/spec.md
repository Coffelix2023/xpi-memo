# candidate-auto-admission/kind-routing Specification

## Purpose

按记忆 kind 路由候选处理——gene/constraint 走工具验证,preference 的累积证据为保留策略(交付前进待审),decision 保持人工确认,建立 kind 级准入策略。

## Requirements

### Requirement: kind 级准入策略

系统 SHALL 为每个记忆 kind 定义准入策略，并在统一准入决定中执行。kind 策略 SHALL 作为准入偏好的默认值来源，而不是唯一的裁决者：当用户在准入偏好中为某 kind 显式设置了自动准入取值时，偏好取值 MUST 优先于 kind 默认策略。默认策略 MUST 使除硬底线命中的候选外全部自动准入，MUST NOT 要求候选先通过 repository-fact 验证。

#### Scenario: project_gene 走工具验证

- **WHEN** `project_gene` 候选有有效 repository-fact 声明且验证通过
- **THEN** 验证结论作为证据增强被记录
- **AND** 候选按准入偏好判定准入
- **AND** 候选不因缺少显式 rollout 开关而进入待审队列

#### Scenario: global_preference 走累积证据

- **WHEN** `global_preference` 候选路由为 `accumulate`
- **THEN** 系统跳过工具验证
- **AND** 候选按准入偏好判定准入
- **AND** 不以出现次数作为准入依据

#### Scenario: project_decision 保持人工确认

- **WHEN** 用户在准入偏好中停用 `project_decision` 的自动准入
- **THEN** 该 kind 候选保持人工确认并进入待审队列
- **AND** 必须由用户 Store/Reject 确认
- **AND** 该 kind 的自动准入路径仍然存在，只是被偏好关闭

#### Scenario: project_constraint 走工具验证

- **WHEN** `project_constraint` 有已注册的仓库事实验证器
- **THEN** 验证结果作为证据增强与审计信息
- **AND** 该 kind 的准入由准入偏好决定
- **AND** 注册验证器这一行为本身不改变准入结果

#### Scenario: 默认全自动准入

- **WHEN** 用户未修改任何准入偏好
- **THEN** 除硬底线命中的候选外，各 kind 候选自动写入 T1
- **AND** 候选不因 kind 的默认策略而进入待审队列

#### Scenario: 用户按 kind 停用

- **WHEN** 用户在准入偏好中停用某 kind 的自动准入
- **THEN** 该 kind 候选进入待审队列
- **AND** 偏好取值覆盖该 kind 的默认策略

#### Scenario: kind 默认策略作为偏好缺省值

- **WHEN** 准入偏好中未给出某 kind 的显式取值
- **THEN** 系统使用该 kind 的默认策略
- **AND** 该默认策略为自动准入

### Requirement: 策略路由可配置

系统 SHALL 支持通过配置文件与准入偏好设置自动准入行为，环境变量 `XPI_MEMO_AUTO_ADMIT` 作为覆盖选项。全局 `XPI_MEMO_AUTO_VERIFY=false|0` SHALL 作为总 kill switch。当环境变量未设置时，系统 SHALL 从配置文件读取默认值（默认启用自动准入）。项目级策略覆盖不属于当前契约。

#### Scenario: 全局关闭自动验证

- **WHEN** `XPI_MEMO_AUTO_VERIFY=false` 或 `0`
- **THEN** 所有 kind 的工具验证路径被禁用
- **AND** 全部候选进入待审队列
- **AND** 不记录通过验证后自动写入的结果

#### Scenario: 环境变量覆盖配置文件

- **WHEN** 环境变量 `XPI_MEMO_AUTO_ADMIT` 被显式设置为 `true` 或 `false`
- **THEN** 系统 MUST 使用环境变量值，忽略配置文件中的设置
- **AND** 环境变量优先级高于配置文件

#### Scenario: 默认启用自动准入

- **WHEN** `XPI_MEMO_AUTO_VERIFY` 未关闭且环境变量 `XPI_MEMO_AUTO_ADMIT` 未设置
- **THEN** 系统 SHALL 从配置文件读取默认值（默认启用）
- **AND** 各 kind 按准入偏好自动准入
- **AND** 无需候选先通过 repository-fact 验证

#### Scenario: 配置文件关闭自动准入

- **WHEN** 配置文件禁用自动准入且环境变量 `XPI_MEMO_AUTO_ADMIT` 未设置
- **THEN** 候选进入待审队列
- **AND** 不自动写入 T1

#### Scenario: 项目级覆盖策略

- **WHEN** 项目尝试提供 kind 级自动准入覆盖
- **THEN** 当前运行时忽略该项目级覆盖
- **AND** 仅全局 kill switch、环境变量、准入偏好与配置文件决定准入

### Requirement: 策略路由失败回退

验证失败、超时、工具不可用、缺少验证器、缺少声明或无效声明时，候选 MUST NOT 因此被阻止准入。系统 SHALL 记录有界失败原因，并继续按准入偏好判定该候选。审计使用 `tool-verification-failed` 与有界 reason code。当前 `accumulate` 不执行查询，因此不产生累积查询超时事件。

#### Scenario: 工具验证模块不可用

- **WHEN** 工具验证模块因依赖缺失或异常不可用
- **THEN** 候选继续按准入偏好判定
- **AND** audit.json 记录 `tool-verification-failed` 和有界原因
- **AND** 候选不因验证不可用而被拒绝或长期滞留待审

#### Scenario: 累积证据查询超时

- **WHEN** `global_preference` 路由为当前保留的 `accumulate` 策略
- **THEN** 系统不执行累积证据查询
- **AND** 候选按准入偏好判定
- **AND** 不记录不存在的 `accumulation-timeout` 事件

#### Scenario: 缺少声明的候选

- **WHEN** 候选没有可用的 repository-fact 声明
- **THEN** 系统跳过工具验证
- **AND** 候选按准入偏好判定，不因缺少声明而滞留待审
