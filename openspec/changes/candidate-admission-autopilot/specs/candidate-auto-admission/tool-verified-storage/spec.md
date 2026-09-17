## Purpose

为可工具验证的候选(如 `project_gene`)提供自动存储路径,通过读文件/跑 grep 等工具确认仓库事实后直接入库,无需人工审核。

## ADDED Requirements

### Requirement: 工具验证器接口

系统 SHALL 提供统一的工具验证器接口,封装文件读取、grep、类型检查等验证逻辑,接受候选内容与元数据,返回验证结果与升级后的证据类型。

#### Scenario: project_gene 候选验证通过

- **WHEN** 候选 kind 为 `project_gene`,content 声称"模块 X 存在约束 Y"
- **THEN** 验证器读取相关文件,确认约束存在
- **AND** 返回 `verified-repository-fact` 证据类型
- **AND** 候选自动存储,不进入待审队列

#### Scenario: project_gene 候选验证失败

- **WHEN** 候选 kind 为 `project_gene`,但文件读取或 grep 未找到对应约束
- **THEN** 验证器返回验证失败状态
- **AND** 候选保持 `l0-conclusion` 证据类型
- **AND** 候选进入待审队列,等待人工确认

#### Scenario: 不可验证的 kind 跳过工具验证

- **WHEN** 候选 kind 为 `project_decision`(架构选择无客观对错)
- **THEN** 工具验证路径不被调用
- **AND** 候选保持原有生命周期,进入待审队列

### Requirement: 验证结果可审计

工具验证过程 SHALL 记录验证依据(读取的文件路径、grep 匹配行、验证时间戳),存入 audit.json,支持事后追溯为何某候选被自动存储。

#### Scenario: 验证通过的审计记录

- **WHEN** project_gene 候选经工具验证后自动存储
- **THEN** audit.json 记录 `tool-verified` 事件
- **AND** 事件包含验证依据(文件路径、匹配内容、验证时间戳)
- **AND** 审计条目可通过候选 ID 关联

#### Scenario: 验证失败的审计记录

- **WHEN** 工具验证失败,候选进入待审
- **THEN** audit.json 记录 `tool-verification-failed` 事件
- **AND** 事件包含失败原因(文件不存在、grep 无匹配)
- **AND** 人工审核时可查阅验证失败原因

### Requirement: 验证器扩展点

工具验证模块 SHALL 提供扩展点,允许按 kind 注册不同的验证策略,支持未来新增可验证的 kind(如 `project_constraint`)而不修改核心逻辑。

#### Scenario: 为新 kind 注册验证器

- **WHEN** 未来新增 `project_constraint` kind,需要工具验证
- **THEN** 开发者可注册针对该 kind 的验证器函数
- **AND** 候选生命周期自动调用对应验证器
- **AND** 核心 confirm 流程不需修改
