## MODIFIED Requirements

### Requirement: kind 级准入策略

系统 SHALL 为每个记忆 kind 定义准入策略，并在统一准入决定中执行。`project_gene` 可执行 repository-fact 验证；其验证成功仅在显式 auto-admit rollout 允许时自动存储，其他情况下进入待审。`project_constraint` 仅可 shadow 验证，`global_preference` 的 `accumulate` 为保留策略，其他 kind 保持人工确认。

#### Scenario: project_gene 走工具验证

- **WHEN** `project_gene` 候选有有效 repository-fact 声明且验证通过
- **THEN** 系统执行 shadow 或 auto-admit 决定
- **AND** 只有 auto-admit 已启用时直接存储
- **AND** 其余情况不经过自动 T1 写入

#### Scenario: global_preference 走累积证据

- **WHEN** `global_preference` 候选路由为 `accumulate`
- **THEN** 系统跳过工具验证并进入待审队列
- **AND** 不查询相似候选或记忆
- **AND** 不以出现次数自动存储

#### Scenario: project_decision 保持人工确认

- **WHEN** 候选 kind 为 `project_decision`
- **THEN** 候选不走 repository-fact 验证
- **AND** 直接进入待审队列
- **AND** 必须由用户 Store/Reject 确认

#### Scenario: project_constraint 走工具验证

- **WHEN** `project_constraint` 有已注册的仓库事实验证器
- **THEN** 验证结果只作为 shadow 审计与待审辅助信息
- **AND** 候选不自动存储
- **AND** 放量必须由后续独立 change 修改

### Requirement: 策略路由可配置

全局 `XPI_MEMO_AUTO_VERIFY=false|0` SHALL 作为总 kill switch。`XPI_MEMO_AUTO_ADMIT=true` SHALL 是唯一允许 `project_gene` 自动存储的显式 opt-in；其缺失、任意其他值或 kill switch 都必须保持 shadow 或待审。项目级策略覆盖不属于当前契约。

#### Scenario: 全局关闭自动验证

- **WHEN** `XPI_MEMO_AUTO_VERIFY=false` 或 `0`
- **THEN** 所有 kind 的工具验证路径被禁用
- **AND** 全部候选进入待审队列
- **AND** 不记录通过验证后自动写入的结果

#### Scenario: 项目级覆盖策略

- **WHEN** 项目尝试提供 kind 级自动准入覆盖
- **THEN** 当前运行时忽略该项目级覆盖
- **AND** 仅全局 kill switch 和 auto-admit opt-in 决定准入
- **AND** 所有未显式允许的候选保持待审

#### Scenario: 默认 shadow mode

- **WHEN** `XPI_MEMO_AUTO_VERIFY` 未关闭且 `XPI_MEMO_AUTO_ADMIT` 缺失或不为 `true`
- **THEN** 已启用 kind 的验证结果记录为 shadow
- **AND** 候选进入待审队列
- **AND** 不自动写入 T1

### Requirement: 策略路由失败回退

验证失败、超时、工具不可用、缺少验证器、缺少声明或无效声明时，候选 SHALL 保持待审且不丢失；审计使用 `tool-verification-failed` 与有界 reason code。当前 `accumulate` 不执行查询，因此不产生累积查询超时事件。

#### Scenario: 工具验证模块不可用

- **WHEN** 工具验证模块因依赖缺失或异常不可用
- **THEN** 候选进入待审队列
- **AND** audit.json 记录 `tool-verification-failed` 和有界原因
- **AND** 用户可手动确认，系统不静默丢弃候选

#### Scenario: 累积证据查询超时

- **WHEN** `global_preference` 路由为当前保留的 `accumulate` 策略
- **THEN** 系统不执行累积证据查询
- **AND** 候选进入待审队列
- **AND** 不记录不存在的 `accumulation-timeout` 事件
