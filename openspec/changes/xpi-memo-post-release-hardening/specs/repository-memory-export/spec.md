## Purpose

让项目记忆以安全、可读、可 diff、可协作的 Markdown 形态跟随项目，同时保留全局 SQLite 机器态索引和跨 worktree 共享能力，支持显式导出、幂等回流与孤儿 bank 治理。

## ADDED Requirements

### Requirement: Project memory export MUST use a separate human-readable layer

系统 MUST 支持将当前 project scope 的已治理记忆显式导出到项目目录的 `.pi/memory/` 层。项目导出 MUST 使用人类可读的 Markdown；project SQLite、WAL 和 SHM 机器态文件 MUST 继续位于全局 xpi-memo 数据目录，不得因导出而复制或移动到项目仓库。

#### Scenario: A user exports project memory
- **WHEN** 用户对当前项目执行显式 memory export
- **THEN** 系统 MUST 在项目根目录的 `.pi/memory/` 下生成或更新对应的 Markdown 文件
- **AND THEN** 导出内容 MUST 仅包含已通过治理且允许导出的 project memory
- **AND THEN** 全局 project bank MUST 继续作为写入和 recall 引擎

#### Scenario: A user inspects the project repository
- **WHEN** 用户执行 Git status、diff 或提交操作
- **THEN** 导出层 MUST 不包含 SQLite、WAL、SHM 或搜索 backend 的机器态索引文件
- **AND THEN** Markdown 内容 MUST 可以被人类阅读、审查和正常 diff

### Requirement: Export format MUST be stable and traceable

每个导出 memory item MUST 保留稳定的 memory ID 或等价锚点、kind、scope、治理状态和必要的来源摘要。导出 MUST 具有稳定排序和确定性格式，以便重复执行时产生干净 diff。

#### Scenario: Export is repeated without new memory
- **WHEN** 用户对同一项目重复执行 export
- **THEN** 相同的已治理记忆 MUST 复用相同锚点和稳定顺序
- **AND THEN** 第二次导出 MUST 不产生无意义内容变化

#### Scenario: A memory is superseded or removed
- **WHEN** project memory 被 supersede、forget 或不再满足导出策略
- **THEN** 后续导出 MUST 按确定性规则移除或标记该条目
- **AND THEN** 不得产生无法关联来源的重复条目

### Requirement: Project export MUST respect privacy and explicit user control

系统 MUST 将项目导出视为显式的数据边界操作。默认导出 MUST 经过现有内容策略和隐私 redaction；系统 MUST 拒绝或脱敏 secrets、credentials、tokens、内部敏感路径及其他禁止内容。系统不得在没有配置或用户操作授权时自动把完整 session trace 写入项目目录。

#### Scenario: Export contains prohibited or sensitive content
- **WHEN** 待导出的记忆包含禁止内容或敏感信息
- **THEN** 系统 MUST 阻止该正文进入项目 Markdown
- **AND THEN** 系统 MAY 记录有界拒绝元数据，但不得在错误或诊断中回显敏感正文

#### Scenario: Session trace exists during project export
- **WHEN** 项目存在大量 L0 session trace，但用户未请求导出 session transcript
- **THEN** 系统 MUST 只导出符合 project memory 策略的已治理内容
- **AND THEN** 系统 MUST 不自动复制完整会话事件到 `.pi/memory/`

### Requirement: Repository memory MUST be importable as governed evidence

系统 MUST 支持从项目 `.pi/memory/` Markdown 读取可识别的 memory entries，并将其作为 `repo-export` evidence 生成候选或执行既有治理流程。回流 MUST 可去重，不得绕过候选、内容策略、scope 路由或用户确认要求。

#### Scenario: A project is cloned on a new machine
- **WHEN** xpi-memo 在包含有效 `.pi/memory/` 文件的新机器项目中发现项目导出
- **THEN** 系统 MUST 能够识别其 memory ID、kind、scope 和 repo-export 来源
- **AND THEN** 回流内容 MUST 进入当前机器的 project memory 治理流程
- **AND THEN** 未经规则允许或用户确认的内容 MUST 不得直接写入 T1 bank

#### Scenario: The same export is discovered repeatedly
- **WHEN** 同一项目导出在多个 session 中被重复扫描
- **THEN** 系统 MUST 使用稳定 ID、内容 fingerprint 或等价证据避免重复候选和重复 T1 row
- **AND THEN** provenance MUST 保留 repo-export 来源

### Requirement: Orphan project banks MUST be diagnosed without destructive cleanup

系统 MUST 能够识别 project bank 对应的 Git common directory 或显式项目身份已不存在的 orphan bank，并在 doctor/status 中给出有界提示。系统 MUST 默认不自动删除、合并或迁移 orphan bank。

#### Scenario: A project root no longer exists
- **WHEN** doctor 检测到某个 project bank 无法关联到现存项目身份
- **THEN** 报告 MUST 标记 orphan bank 及其 bank 标识
- **AND THEN** 报告 MUST 提供人工归档或清理建议
- **AND THEN** 系统 MUST 保留原始 bank 数据不变

#### Scenario: A shared Git worktree is inspected
- **WHEN** 用户从同一仓库的不同 worktree 执行 status 或 export
- **THEN** 系统 MUST 继续使用稳定的共享 project identity 和全局 project bank
- **AND THEN** 导出目标 MUST 解析到对应 worktree 的项目根，不得复制或拆分 SQLite bank
