## Purpose

为 xpi-memo 建立统一、可审计的记忆安全边界，使召回内容不会被默认当作可信指令，敏感凭证不会未经保护进入模型可见输出、外部 provider 或派生导出。

## ADDED Requirements

### Requirement: Memory recall output MUST be treated as untrusted data

所有自动召回、显式召回、历史注入查询和 context preview 输出中的记忆正文 MUST 被标记和格式化为不可信数据，而不是可执行指令。系统 MUST 使用高置信度本地规则识别明显的提示注入模式；命中条目 MUST 被单独阻断，未命中条目仍可继续处理。

#### Scenario: Safe memories are returned with an untrusted boundary
- **WHEN** 召回结果不命中高置信度提示注入规则
- **THEN** 系统返回该记忆的安全格式化内容
- **AND THEN** 输出明确标记其为不可信记忆数据
- **AND THEN** 输出不得把记忆正文放在可被误解为系统或用户指令的结构中

#### Scenario: A suspicious memory is blocked individually
- **WHEN** 单条召回记忆命中高置信度提示注入规则
- **THEN** 系统不得向模型或用户输出该条正文
- **AND THEN** 同一批次中未命中的记忆仍可返回
- **AND THEN** 系统返回或记录该批次的阻断数量和有界阻断原因

#### Scenario: Every memory-visible entry point uses the same safety contract
- **WHEN** 记忆通过自动召回、`xpi_memo_recall`、`xpi_memo_show_injected` 或 context preview 输出
- **THEN** 该入口 MUST 使用相同的阻断、格式化、计数和策略版本语义
- **AND THEN** 入口可以使用不同的展示外壳，但不得绕过安全处理

### Requirement: External memory transmission MUST protect credentials

发送给 Track B runner、Mnemosyne 或其他外部 provider 的内容 MUST 先经过凭证保护。已知凭证模式 MUST 被脱敏；无法可靠确认内容安全时，系统 MUST 阻止该次外部调用。L0 本地事件仍可按 lossless 合约保留原始内容，外部传输不得使用该原文副本。

#### Scenario: Known credential patterns are redacted before transmission
- **WHEN** 外部传输内容包含可识别的 token、API key、密码或其他凭证模式
- **THEN** 外部调用只接收脱敏后的安全副本
- **AND THEN** 原始凭证不得出现在 provider 请求、Mnemosyne 输入或外部 runner 输入中
- **AND THEN** L0 原始事件不因脱敏而被改写

#### Scenario: Uncertain external safety blocks the call
- **WHEN** 系统无法可靠判断待发送内容是否安全
- **THEN** 系统阻止外部调用
- **AND THEN** 系统仍可在本地 L0 保留原始事件
- **AND THEN** 系统返回或记录不包含正文或凭证的有界失败原因

#### Scenario: Export output does not bypass credential protection
- **WHEN** 记忆被写入 `MEMORY.md` 或其他派生导出
- **THEN** 导出继续遵循现有 privacy 脱敏策略
- **AND THEN** 本 change 不得让未脱敏凭证因导出路径绕过保护

### Requirement: Security diagnostics MUST be bounded and backward compatible

安全处理结果 MUST 通过有界诊断元数据解释阻断、预算省略和外部拒绝。诊断 MUST 不包含完整记忆正文、token、API key、密码或其他敏感数据。新增 `memory_injected` 字段 MUST 为向后兼容的可选字段，旧事件仍可读取。

#### Scenario: Injection diagnostics explain omitted results
- **WHEN** 自动召回完成且存在阻断或预算省略
- **THEN** `memory_injected` 记录成功注入数、阻断数、省略数、省略原因、策略版本和生命周期阶段
- **AND THEN** 记录不包含被阻断或省略的正文

#### Scenario: Existing injection events remain readable
- **WHEN** 系统读取没有新增安全字段的历史 `memory_injected` 事件
- **THEN** 系统按明确默认值解析缺失字段
- **AND THEN** 历史事件不会因缺少新字段而被拒绝、误报为安全处理失败或破坏查询

#### Scenario: External rejection is diagnosable without secret leakage
- **WHEN** 外部传输因凭证或不确定安全状态被阻止
- **THEN** L0/audit 记录有界的结果状态、原因类别和策略版本
- **AND THEN** 诊断不记录完整输入、匹配凭证或可恢复的敏感片段
