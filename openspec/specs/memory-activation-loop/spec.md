# memory-activation-loop Specification

## Purpose

This capability closes xpi-memo's activation gap: valuable user and project knowledge must enter governed memory without depending on perfect agent behavior, while recall remains bounded, relevant, and explainable across global, project, and session scope.

## Requirements

### Requirement: Explicit memory intent MUST enter a governed activation path

The system MUST detect explicit user intent to preserve a preference, workflow, project constraint, project decision, project gotcha, bounded session context, or an art/write-domain statement without requiring a separate manual memory-tool call. Art/write-domain statements MUST be governed through the DNA file outcome instead of a T1 candidate; all other categories MUST follow the existing T1 candidate or storage governance unchanged.

#### Scenario: User states an explicit preference

- **WHEN** the user explicitly states a durable preference or workflow rule
- **THEN** the system MUST create a governed memory outcome for the appropriate global category
- **AND THEN** the outcome MUST retain the originating session and event provenance

#### Scenario: User states an explicit project decision

- **WHEN** the user explicitly confirms a project decision, constraint, or gotcha
- **THEN** the system MUST route it to the current project scope when a recognized project exists
- **AND THEN** the system MUST apply the existing candidate or storage governance for that category

#### Scenario: User states an art/write-domain rule

- **WHEN** the user explicitly states a durable visual-design or writing-creation rule in a trusted project
- **THEN** the system MUST create a governed DNA file outcome with user-statement provenance in the matching domain
- **AND THEN** it MUST NOT create a T1 candidate or T1 record for that statement
- **AND THEN** in an untrusted project or when the statement falls outside the art/write domains, the system MUST fall back to the existing T1 governance path

#### Scenario: Ambiguous content is encountered

- **WHEN** content could map to more than one category or lacks enough scope context
- **THEN** the system MUST skip direct durable storage or create a governed candidate
- **AND THEN** it MUST NOT guess a category or silently place project content in the global scope
### Requirement: Capture evidence MUST distinguish user statements from agent-derived content

The system MUST preserve the difference between explicit user statements, verified repository or tool evidence, model-derived suggestions, and T2-derived proposals. Content captured or derived for offline processing MUST pass the same external-boundary credential protection as other memory transmission, and unsafe or uncertain content MUST not enter durable memory, candidates, or diagnostic body output.

#### Scenario: T2 proposes a memory

- **WHEN** a memory originates from a T2 index, graph, embedding result, or model-derived proposal
- **THEN** the system MUST retain that derived evidence type and linked source events
- **AND THEN** it MUST NOT label the result as an explicit user statement without a supporting user event

#### Scenario: Agent proposes a memory

- **WHEN** a memory originates from an agent tool input, model inference, or offline extraction
- **THEN** the system MUST NOT label it as an explicit user statement without a linked user event that supports that claim
- **AND THEN** the evidence type and source reference MUST remain visible to governance and diagnostics

#### Scenario: Sensitive content is encountered

- **WHEN** explicit or derived content contains secrets, credentials, tokens, or prohibited personal data
- **THEN** the system MUST prevent the content from entering durable memory, candidates, or diagnostic body output
- **AND THEN** before any external processing the system MUST use a redacted safe copy or refuse the external call when safety cannot be confirmed
- **AND THEN** the system MUST retain only bounded non-sensitive rejection metadata where required for diagnosis

#### Scenario: Derived content is sent to an external runner

- **WHEN** offline extraction prepares content for a provider or external runner
- **THEN** known credentials MUST be redacted before transmission
- **AND THEN** uncertain content MUST prevent the external request from being sent
- **AND THEN** the original local event MAY remain available for L0 replay without being used as the external payload

### Requirement: Offline extraction MUST be gated and non-blocking

系统 MUST 支持可选的离线提取路径，在 compaction 或 session shutdown 等有界生命周期点运行，且不得阻塞正在进行的编码交互。该路径 MUST 提供一个默认的会话模型 runner 作为可选实现，同时 MUST 保留外部注入的 runner 作为更高优先级的装配点。默认 runner MUST NOT 在未显式开启时调用任何模型。

#### Scenario: Offline extraction is enabled

- **WHEN** 有界的离线提取运行被显式开启
- **THEN** 系统 MUST 产生有界的记忆提案，每条带类别、置信度、证据类型和来源引用
- **AND THEN** 高置信度低风险结果 MAY 直接存储，其余结果 MUST 走候选生命周期
- **AND THEN** 候选按 kind 分流:可工具验证的(gene/constraint)走自动验证并存储路径,不可验证的(decision)走待审队列
- **AND THEN** 自动验证通过的候选直接入库,不进入待审队列,验证失败的保持待审

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

### Requirement: Pending candidates MUST have a visible, low-noise digest

The system MUST expose pending candidates through the existing review flow, provide a concise reminder when the backlog requires attention, and expose bounded transient status for candidate creation and resolution.

#### Scenario: Candidate is created by T2

- **WHEN** a T2 proposal enters the candidate lifecycle
- **THEN** the system MUST show a bounded candidate-created status
- **AND THEN** the candidate MUST remain available through the existing review surface

#### Scenario: Pending candidates exist at session start

- **WHEN** a new session starts and pending candidates exist
- **THEN** the system MUST make the backlog count and review command or surface discoverable
- **AND THEN** the reminder MUST NOT block the user or open a mandatory confirmation dialog

#### Scenario: Candidate actions are applied

- **WHEN** a user stores, defers, or rejects a candidate
- **THEN** the system MUST preserve the existing lifecycle semantics
- **AND THEN** the resulting state MUST be reflected in counts, provenance-safe diagnostics, and transient status

### Requirement: Recall MUST separate memory roles and enforce bounded ranking

The system MUST distinguish standing memory from contextual memory and MUST apply relevance, query intent, recency, scope priority, diversity, deduplication, and output budgets before automatic injection.

#### Scenario: A prompt requests project context

- **WHEN** the system evaluates memory for a prompt about the current project
- **THEN** project contextual memory and relevant standing memory MUST be ranked separately before selection
- **AND THEN** unrelated global or other-project memory MUST be excluded

#### Scenario: A prompt requests user preferences

- **WHEN** the system evaluates memory for a prompt about the user's general preferences or workflow
- **THEN** global standing memory MUST receive the appropriate scope and intent priority
- **AND THEN** project-only context MUST not crowd out relevant global preferences without a stronger relevance signal

#### Scenario: Recall results exceed the budget

- **WHEN** eligible results exceed the configured item or character budget
- **THEN** the system MUST select a bounded diverse subset and omit the remainder
- **AND THEN** an empty result MUST omit the memory block rather than injecting an empty or raw trace block

#### Scenario: A memory is stale or superseded

- **WHEN** a memory is marked superseded or has fallen below the configured freshness contribution
- **THEN** it MUST not dominate automatic recall
- **AND THEN** the ranking decision MUST remain diagnosable through bounded metrics

### Requirement: Activation and recall health MUST be measurable

The system MUST expose counts and outcomes that allow an operator to distinguish no capture, candidate accumulation, failed writes, empty recall, successful recall, and automatic injection.

#### Scenario: Health status is requested

- **WHEN** the user requests xpi-memo status or doctor information
- **THEN** the system MUST report bounded counts for explicit capture, extraction proposals, candidate creation, direct storage, confirmation, rejection, recall execution, recall hits, and injection
- **AND THEN** the report MUST identify the relevant global and current-project scope without exposing memory bodies

#### Scenario: Recall backend ran with no hits

- **WHEN** a recall backend was queried but returned no eligible memory
- **THEN** the system MUST distinguish that outcome from a recall that did not execute
- **AND THEN** it MUST report the queried scope or bank in the diagnostic evidence

### Requirement: Recall 精排必须门控、有界且可完全旁路

系统 MAY 在粗排之后应用可选的决策精排,但仅当头部结果相关性分差不高于配置阈值时才可发起精排调用;精排 MUST 只重排既有候选,MUST NOT 增删结果、MUST NOT 改变条目与字符预算。精排关闭、被门控跳过或调用失败时,recall 输出 MUST 与未启用精排时一致。

#### Scenario: 头部分差明显时跳过精排

- **WHEN** 粗排第一名与第二名的分差高于门控阈值
- **THEN** 不发起精排调用,直接采用粗排顺序
- **AND THEN** 门控跳过计数 +1

#### Scenario: 分差接近时启用精排

- **WHEN** 粗排头部结果分差不高于门控阈值且 runner 已启用
- **THEN** 对既有头部候选发起一次精排判定并按得分重排
- **AND THEN** 结果集成员与预算不变

#### Scenario: 精排失败时输出不变

- **WHEN** 精排调用失败、超时或回答被回筛丢弃
- **THEN** recall 采用粗排原始顺序返回
- **AND THEN** 用户可见结果与未启用精排时一致,失败计数 +1

### Requirement: 重复 prompt 必须经确定性计数与稳定性判定才产生候选

系统 MUST 从 L0 事件日志确定性统计同义重复的用户 prompt(不调用模型计数),仅在重复次数达到配置阈值(默认 3)后,才可请求一次稳定性判定;判定概率达到配置阈值时系统 MUST 生成**待审候选**并标注重复证据来源,MUST NOT 自动写入 T1;概率低于阈值或判定不可用时 MUST 丢弃本次提议并仅留有界计数。

#### Scenario: 重复达阈值且判定通过

- **WHEN** 同义 prompt 在会话/跨会话累计达到 3 次且稳定性判定概率不低于阈值
- **THEN** 生成一条待审候选,证据类型为重复信号并带 L0 来源引用
- **AND THEN** 该候选不自动写入 T1,等待既有候选治理裁决

#### Scenario: 判定未达阈值

- **WHEN** 稳定性判定概率低于配置阈值
- **THEN** 不生成候选,丢弃提议
- **AND THEN** 丢弃以有界计数记录,不含 prompt 正文

#### Scenario: 重复计数但 runner 不可用

- **WHEN** 重复次数已达阈值但决策 runner 关闭或失败
- **THEN** 不生成候选也不放宽为自动入库
- **AND THEN** 行为等同该规则不存在,会话不被阻塞

#### Scenario: 挫败型重复不产生偏好

- **WHEN** 重复的 prompt 属于同一故障的反复追问(如重复报错)
- **THEN** 稳定性判定概率低于阈值,不生成偏好候选
- **AND THEN** 现有显式意图捕获路径不受影响
