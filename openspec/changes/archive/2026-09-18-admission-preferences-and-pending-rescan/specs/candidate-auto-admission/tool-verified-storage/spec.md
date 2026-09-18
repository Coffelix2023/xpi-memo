## MODIFIED Requirements

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

### Requirement: 验证器扩展点

工具验证模块 SHALL 允许按 kind 注册独立验证策略。注册本身 MUST NOT 单独授予自动准入；准入由准入偏好决定。验证结果 MUST 只作为证据增强与审计信息。

#### Scenario: 为新 kind 注册验证器

- **WHEN** 开发者为 `project_constraint` 注册仓库事实验证器
- **THEN** 验证结果仅作为证据增强与审计信息
- **AND** 该 kind 的准入由准入偏好决定
- **AND** 注册验证器这一行为本身不改变准入结果
