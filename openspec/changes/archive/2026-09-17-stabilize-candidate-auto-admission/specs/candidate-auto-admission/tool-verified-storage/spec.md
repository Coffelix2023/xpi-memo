## MODIFIED Requirements

### Requirement: 工具验证器接口

系统 SHALL 验证结构化 repository-fact 声明，而非将候选正文作为全文搜索词。声明 MUST 指向当前项目根内的相对文件、一个有界非空证据片段，并可选指定 revision；验证器 MUST 拒绝越界路径、缺失文件、注释证据、片段不匹配或 revision 不匹配。无有效声明的候选为不可自动验证，仍可进入人工待审。

#### Scenario: project_gene 候选验证通过

- **WHEN** `project_gene` 候选携带指向仓库内非注释证据的有效声明
- **THEN** 验证器确认所指文件和片段
- **AND** 返回通过的仓库事实验证结论
- **AND** 候选依照 rollout 决定进入 shadow 待审或自动存储

#### Scenario: project_gene 候选验证失败

- **WHEN** `project_gene` 候选的声明缺失、越界、过期，或文件/片段验证失败
- **THEN** 验证器返回有界失败状态
- **AND** 候选保持原始证据类型
- **AND** 候选进入待审队列

#### Scenario: 不可验证的 kind 跳过工具验证

- **WHEN** 候选 kind 不是已启用的 repository-fact 验证 kind
- **THEN** 不调用仓库事实验证器
- **AND** 候选保持原有生命周期并进入待审队列

### Requirement: 验证结果可审计

工具验证过程 SHALL 记录候选 ID、相对文件路径、通过/失败结果、验证时间、有界 reason code 与 shadow/auto-stored 决定。审计和 L0 MUST NOT 记录候选正文、完整文件内容或未通过片段。

#### Scenario: 验证通过的审计记录

- **WHEN** `project_gene` 候选通过仓库事实验证
- **THEN** audit.json 记录 `tool-verified` 或 bounded shadow outcome
- **AND** 条目包含候选 ID、相对文件路径、验证时间和准入决定
- **AND** 审计条目不包含候选正文或完整文件内容

#### Scenario: 验证失败的审计记录

- **WHEN** 仓库事实验证失败、超时或工具不可用
- **THEN** audit.json 记录 `tool-verification-failed`
- **AND** 条目包含有界失败原因
- **AND** 人工审核可查阅失败原因而不暴露候选正文

### Requirement: 验证器扩展点

工具验证模块 SHALL 允许按 kind 注册独立验证策略，但注册本身 MUST NOT 启用自动存储。新增 kind 必须先在 shadow mode 记录其验证结果与人工审核对照；在独立 change 修改 kind policy 前，它保持人工待审。

#### Scenario: 为新 kind 注册验证器

- **WHEN** 开发者为 `project_constraint` 注册仓库事实验证器
- **THEN** 验证结果仅作为 shadow 审计和待审辅助信息
- **AND** 候选不会因注册自动存储
- **AND** 核心 confirmation 流程不需修改
