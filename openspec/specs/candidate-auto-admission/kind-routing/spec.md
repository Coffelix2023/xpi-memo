# candidate-auto-admission/kind-routing Specification

## Purpose

按记忆 kind 路由候选处理——gene/constraint 走工具验证,preference 走累积证据,decision 保持人工确认,建立 kind 级准入策略。

## Requirements

### Requirement: kind 级准入策略

系统 SHALL 为每个记忆 kind 定义准入策略,明确该 kind 的候选走工具验证、累积证据还是人工确认,并在候选生命周期的 confirm 阶段按策略路由。

#### Scenario: project_gene 走工具验证

- **WHEN** 候选 kind 为 `project_gene`
- **THEN** 候选进入工具验证路径
- **AND** 验证通过后自动存储,验证失败进入待审
- **AND** 不经过人工确认对话框

#### Scenario: global_preference 走累积证据

- **WHEN** 候选 kind 为 `global_preference`,证据类型为 `l0-conclusion`
- **THEN** 系统检查是否已存在相似内容的候选或记忆
- **AND** 第 2 次出现时,累积证据权重提升,自动存储
- **AND** 首次出现时进入待审,等待第二次确认或用户手动确认

#### Scenario: project_decision 保持人工确认

- **WHEN** 候选 kind 为 `project_decision`
- **THEN** 候选不走工具验证或累积证据路径
- **AND** 直接进入待审队列
- **AND** 必须由用户 Store/Reject 确认

#### Scenario: project_constraint 走工具验证

- **WHEN** 候选 kind 为 `project_constraint`
- **THEN** 候选进入工具验证路径(与 gene 同策略)
- **AND** 验证通过后自动存储
- **AND** 验证失败进入待审

### Requirement: 策略路由可配置

kind 级准入策略 SHALL 支持按项目或全局配置调整,允许在测试阶段暂时关闭自动验证,或为特定项目启用更严格的人工确认。

#### Scenario: 全局关闭自动验证

- **WHEN** 配置 `XPI_MEMO_AUTO_VERIFY=false`
- **THEN** 所有 kind 的工具验证路径被禁用
- **AND** 全部候选进入待审队列
- **AND** 用户可逐个手动确认,验证工具验证逻辑正确性

#### Scenario: 项目级覆盖策略

- **WHEN** 项目 `.pi/xpi-memo.yaml` 配置 `auto_verify_kinds: [project_gene]`
- **THEN** 仅 `project_gene` 走工具验证
- **AND** 其他 kind(包括 `project_constraint`)走待审
- **AND** 全局配置不覆盖项目级配置

### Requirement: 策略路由失败回退

kind 级准入策略 SHALL 定义失败回退行为——工具验证不可用、累积证据查询失败时,候选默认进入待审队列,不丢失候选。

#### Scenario: 工具验证模块不可用

- **WHEN** 工具验证模块因依赖缺失或异常不可用
- **THEN** 候选进入待审队列
- **AND** audit.json 记录 `verification-unavailable` 事件
- **AND** 用户可手动确认,系统不静默丢弃候选

#### Scenario: 累积证据查询超时

- **WHEN** preference 累积证据查询超时(数据库锁/慢查询)
- **THEN** 候选进入待审队列
- **AND** audit.json 记录 `accumulation-timeout` 事件
- **AND** 不因超时而误判为"首次出现"自动存储
