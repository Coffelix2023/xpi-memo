# memory-observability Delta Specification

## MODIFIED Requirements

### Requirement: Offline extraction MAY enrich memory capture when gated

系统 MUST 支持受门控的离线提取路径以丰富记忆捕获，但该路径 MUST 保持可选且 MUST NOT 成为核心捕获的前提。系统 MUST 能区分"提取路径未开启"、"提取已执行但无提案"与"提取因 runner 不可用而失败"三种运行结果。在 TUI 模式下，离线提取运行时 MUST 在用户输入编辑器上方显示进度指示器，让用户感知系统正在工作。

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

#### Scenario: TUI 模式下显示提取进度

- **WHEN** 离线提取在 TUI 模式下运行且 `ctx.ui` 可用
- **THEN** 系统 MUST 在用户输入编辑器上方显示流光文本进度指示器
- **AND THEN** 进度指示器 MUST 包含"正在提取记忆候选..."等描述性文本
- **AND THEN** 提取完成或失败后 MUST 停止进度指示器并清理

#### Scenario: 非 TUI 模式下静默运行

- **WHEN** 离线提取在非 TUI 模式下运行或 `ctx.ui` 不可用
- **THEN** 系统 MUST 静默执行提取
- **AND THEN** 不尝试显示进度指示器
- **AND THEN** 提取结果通过诊断或审计记录可见
