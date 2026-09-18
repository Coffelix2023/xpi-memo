# candidate-auto-admission/tool-verified-storage Specification

## Purpose

为可工具验证的候选(如 `project_gene`)提供自动存储路径,通过读文件/跑 grep 等工具确认仓库事实后直接入库,无需人工审核。

## Requirements

### Requirement: 工具验证器接口

系统 SHALL 验证结构化 repository-fact 声明，而非将候选正文作为全文搜索词。声明 MUST 指向当前项目根内的相对文件、一个有界非空证据片段，并可选指定 revision；验证器 MUST 拒绝越界路径、缺失文件、注释证据、片段不匹配或 revision 不匹配。无有效声明的候选为不可自动验证，其准入 MUST 由准入偏好决定，MUST NOT 因缺少有效声明而被钉在待审队列。

#### Scenario: project_gene 候选验证通过

- **WHEN** `project_gene` 候选携带指向仓库内非注释证据的有效声明
- **THEN** 验证器确认所指文件和片段
- **AND** 返回通过的仓库事实验证结论
- **AND** 候选按准入偏好判定准入

#### Scenario: project_gene 候选验证失败

- **WHEN** `project_gene` 候选的声明缺失、越界、过期，或文件/片段验证失败
- **THEN** 验证器返回有界失败状态
- **AND** 候选保持原始证据类型
- **AND** 候选按准入偏好判定，不因验证失败被拒绝

#### Scenario: 不可验证的 kind 跳过工具验证

- **WHEN** 候选 kind 不是已启用的 repository-fact 验证 kind
- **THEN** 不调用仓库事实验证器
- **AND** 候选按准入偏好判定

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

工具验证模块 SHALL 允许按 kind 注册独立验证策略。注册本身 MUST NOT 单独授予自动准入；准入由准入偏好决定。验证结果 MUST 只作为证据增强与审计信息。

#### Scenario: 为新 kind 注册验证器

- **WHEN** 开发者为 `project_constraint` 注册仓库事实验证器
- **THEN** 验证结果仅作为证据增强与审计信息
- **AND** 该 kind 的准入由准入偏好决定
- **AND** 注册验证器这一行为本身不改变准入结果
