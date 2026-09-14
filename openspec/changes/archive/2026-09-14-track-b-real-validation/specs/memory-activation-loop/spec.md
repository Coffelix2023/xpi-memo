## MODIFIED Requirements

### Requirement: Offline extraction MUST be gated and non-blocking

系统 MUST 支持可选的离线提取路径，在 compaction 或 session shutdown 等有界生命周期点运行，且不得阻塞正在进行的编码交互。该路径 MUST 提供一个默认的会话模型 runner 作为可选实现，同时 MUST 保留外部注入的 runner 作为更高优先级的装配点。默认 runner MUST NOT 在未显式开启时调用任何模型。

#### Scenario: Offline extraction is enabled

- **WHEN** 有界的离线提取运行被显式开启
- **THEN** 系统 MUST 产生有界的记忆提案，每条带类别、置信度、证据类型和来源引用
- **AND THEN** 高置信度低风险结果 MAY 直接存储，其余结果 MUST 走候选生命周期

#### Scenario: Default runner is used only when explicitly enabled

- **WHEN** 离线提取未被显式开启，或当前会话没有可用模型
- **THEN** 系统 MUST NOT 发起任何模型请求
- **AND THEN** 显式确定性捕获 MUST 继续正常工作

#### Scenario: Injected runner takes precedence

- **WHEN** 外部宿主或测试注入了 runner
- **THEN** 系统 MUST 使用注入的 runner 而不是默认 runner
- **AND THEN** 默认 runner MUST NOT 被调用

#### Scenario: Offline extraction is disabled or unavailable

- **WHEN** 该功能被关闭、默认 runner 不可用，或提取失败
- **THEN** 显式确定性捕获 MUST 继续工作
- **AND THEN** 失败 MUST 可在不中断当前会话的前提下被观察

#### Scenario: Extraction budget is exhausted

- **WHEN** 配置的每会话提取预算或输出预算用尽
- **THEN** 系统 MUST 停止该生命周期事件的后续提取
- **AND THEN** 系统 MUST 记录有界诊断计数，而不是处理无界历史

#### Scenario: Model call is bounded and abortable

- **WHEN** 默认 runner 向会话模型发起请求
- **THEN** 请求 MUST 在既定的时间与字符预算内，并 MUST 可被中止
- **AND THEN** 超时或中止 MUST NOT 阻塞会话关闭流程
- **AND THEN** 外发内容 MUST 先经过既有的凭证脱敏边界，无法确认安全时 MUST 拒绝外发

#### Scenario: Model-derived proposals keep their evidence type

- **WHEN** 默认 runner 产出的提案进入治理流程
- **THEN** 其证据类型 MUST 为模型推导类型，且 MUST NOT 被标记为显式用户陈述
- **AND THEN** 需要审核的类别 MUST 走候选生命周期而不是直接存储
