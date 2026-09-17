## MODIFIED Requirements

### Requirement: Project routing MUST be explicit when Git identity is unavailable

当当前目录没有可识别的 Git 项目身份时，系统 MUST NOT 将 project memory 静默写入 global bank。系统 MUST 提供显式初始化项目身份的入口；未初始化前，project memory MUST 返回可行动的拒绝结果，并说明初始化或切换目录的下一步。本地项目身份只可由当前 Pi context 已信任的项目使用；系统 MUST 在采用仓库内元数据前验证元数据文件所在目录、`root` 与按该目录派生的 `id` 一致。未信任、损坏或不自证的元数据 MUST 视为未初始化，且不得将元数据内的 `id`、`root` 或 `label` 用于路由或展示。可识别的 Git 身份 MUST 继续优先于本地项目身份。

#### Scenario: Project memory is requested in a non-Git directory
- **WHEN** 用户在没有 Git 项目身份且未完成显式初始化的目录中提交 `project_decision`、`project_constraint`、`project_gene` 或 `project_gotcha`
- **THEN** 系统 MUST 拒绝该 project memory 写入
- **AND THEN** 工具结果 MUST 说明当前目录缺少项目身份，并指向项目初始化或切换到 Git 项目的操作
- **AND THEN** 系统 MUST NOT 创建 global memory、global candidate 或无项目归属的 project candidate

#### Scenario: A non-Git directory has been explicitly initialized
- **WHEN** 当前 Pi context 信任用户已显式初始化的非 Git 目录，且该目录的项目元数据自证有效
- **THEN** 系统 MUST 将该目录及其子目录中的 project memory 路由到该本地项目的 project scope
- **AND THEN** 该项目身份 MUST 在同一目录及其子目录中保持稳定
- **AND THEN** 系统 MUST 保留现有候选审核和项目 bank 隔离语义

#### Scenario: An untrusted directory contains local project metadata
- **WHEN** 当前 Pi context 不信任非 Git 目录，且该目录或其祖先包含 `.pi/xpi-memo/project.json`
- **THEN** 系统 MUST 忽略该元数据并按没有本地项目身份处理
- **AND THEN** project memory MUST 遵循缺少项目身份的既有拒绝语义
- **AND THEN** 系统 MUST NOT 使用该文件的 `id`、`root` 或 `label` 创建或选择 project bank

#### Scenario: Local project metadata does not prove its directory identity
- **WHEN** 受信任非 Git 目录的 `.pi/xpi-memo/project.json` 中 `root` 不等于元数据所在项目目录，或 `id` 不等于该目录派生的本地项目 ID
- **THEN** 系统 MUST 忽略该元数据并按没有本地项目身份处理
- **AND THEN** 系统 MUST NOT 使用文件提供的 `id`、`root` 或 `label`
- **AND THEN** project memory MUST 遵循缺少项目身份的既有拒绝语义

#### Scenario: Git identity remains authoritative
- **WHEN** 当前目录可解析出 Git 项目身份，同时目录层级中存在本地项目元数据
- **THEN** 系统 MUST 使用 Git 项目身份路由 project memory
- **AND THEN** 系统 MUST NOT 读取本地项目元数据来替换 Git project bank
