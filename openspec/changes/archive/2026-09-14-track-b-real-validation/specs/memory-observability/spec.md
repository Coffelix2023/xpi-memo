## MODIFIED Requirements

### Requirement: Offline extraction MAY enrich memory capture when gated

系统 MUST 支持受门控的离线提取路径以丰富记忆捕获，但该路径 MUST 保持可选且 MUST NOT 成为核心捕获的前提。系统 MUST 能区分"提取路径未开启"、"提取已执行但无提案"与"提取因 runner 不可用而失败"三种运行结果。

#### Scenario: Extraction path is enabled

- **WHEN** 受门控的提取路径被开启且 runner 可用
- **THEN** 系统 MUST 能基于会话上下文提出额外的候选记忆
- **AND THEN** 该路径 MUST 保留 provenance 与置信度信息

#### Scenario: Extraction path is disabled

- **WHEN** 受门控的提取路径未开启
- **THEN** 系统 MUST 继续支持显式确定性捕获
- **AND THEN** 任何核心记忆行为 MUST NOT 依赖该路径存在

#### Scenario: Runner is unavailable

- **WHEN** 提取路径已开启但当前会话没有可用模型或 provider 未认证
- **THEN** 诊断 MUST 报告 runner 不可用，并 MUST 与"已执行但无提案"区分
- **AND THEN** 该状态 MUST NOT 被计为一次成功的提取执行
- **AND THEN** 诊断输出 MUST NOT 包含记忆正文或模型原始输出

#### Scenario: Extraction executed without proposals

- **WHEN** runner 可用且已完成一次提取，但没有产生通过治理的提案
- **THEN** 诊断 MUST 区分该结果与 runner 不可用
- **AND THEN** 系统 MUST NOT 因此回退或修改显式捕获行为
