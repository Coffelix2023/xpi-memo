## MODIFIED Requirements

### Requirement: kind 级准入策略

系统 SHALL 为每个记忆 kind 定义当前生效的准入策略，并在候选生命周期的 confirm 阶段按策略路由。当前 `tool-verify` 仅适用于 `project_gene` 与 `project_constraint`；`manual-confirm` 直接进入待审；`accumulate` 是 `global_preference` 的保留策略，在证据累积能力交付前 MUST 进入待审，不得声称已累积证据或自动存储。

#### Scenario: project_gene 走工具验证
- **WHEN** 候选 kind 为 `project_gene`
- **THEN** 候选进入工具验证路径
- **AND** 验证通过后自动存储，验证失败进入待审
- **AND** 不经过人工确认对话框

#### Scenario: global_preference 走累积证据
- **WHEN** 候选 kind 为 `global_preference`
- **THEN** 系统 MUST 跳过工具验证并将候选留在待审队列
- **AND THEN** 系统 MUST NOT 查询相似候选或记忆来决定自动存储
- **AND THEN** 系统 MUST NOT 因候选出现次数自动存储该候选

#### Scenario: project_decision 保持人工确认
- **WHEN** 候选 kind 为 `project_decision`
- **THEN** 候选不走工具验证或证据累积路径
- **AND** 直接进入待审队列
- **AND** 必须由用户 Store/Reject 确认

#### Scenario: project_constraint 走工具验证
- **WHEN** 候选 kind 为 `project_constraint`
- **THEN** 候选进入工具验证路径（与 gene 同策略）
- **AND** 验证通过后自动存储
- **AND** 验证失败进入待审

### Requirement: 策略路由可配置

kind 级准入策略 SHALL 支持用全局 `XPI_MEMO_AUTO_VERIFY` 暂时关闭自动验证。项目级 kind 覆盖不属于当前配置契约；系统 MUST NOT 承诺读取 `.pi/xpi-memo.yaml` 或 `auto_verify_kinds`。

#### Scenario: 全局关闭自动验证
- **WHEN** 配置 `XPI_MEMO_AUTO_VERIFY=false`
- **THEN** 所有 kind 的工具验证路径被禁用
- **AND** 全部候选进入待审队列
- **AND** 用户可逐个手动确认，验证工具验证逻辑正确性

#### Scenario: 项目级覆盖策略
- **WHEN** 项目目录包含 `.pi/xpi-memo.yaml` 或其中声明 `auto_verify_kinds`
- **THEN** 系统 MUST NOT 将该文件作为当前准入策略配置读取
- **AND THEN** 当前有效策略仅由既有 kind 路由和 `XPI_MEMO_AUTO_VERIFY` 决定
- **AND THEN** 系统 MUST NOT 因该文件自动启用或禁用任何 kind 的工具验证

### Requirement: 策略路由失败回退

kind 级准入策略 SHALL 定义工具验证失败的安全回退行为：验证不可用、超时或异常时，候选默认进入待审队列，不丢失候选。验证失败 MUST 记录 `tool-verification-failed` audit 事件，并以有界 `reason` 区分失败原因；保留的 `accumulate` 策略不执行查询，因此不存在当前的累积查询超时事件。

#### Scenario: 工具验证模块不可用
- **WHEN** 工具验证模块因依赖缺失或异常不可用
- **THEN** 候选进入待审队列
- **AND THEN** audit.json 记录 `tool-verification-failed` 事件，且 `reason` 标识不可用或异常原因
- **AND THEN** 用户可手动确认，系统不静默丢弃候选

#### Scenario: 累积证据查询超时
- **WHEN** `global_preference` 候选按 `accumulate` 策略处理
- **THEN** 候选进入待审队列
- **AND THEN** 系统 MUST NOT 执行累积查询或写入 `accumulation-timeout` audit 事件
- **AND THEN** 系统 MUST NOT 将该候选误报为已自动存储
