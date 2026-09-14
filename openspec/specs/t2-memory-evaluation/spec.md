# t2 memory evaluation Specification

## Purpose

为 xpi-memo 建立一个可回滚、可审计、中文优先的 T2 派生记忆评估协议，在不改变 T1 事实主权和热路径性能的前提下判断外部记忆工具是否真正提升召回与自我进化。

## Requirements

### Requirement: T2 evaluation MUST preserve xpi-memo authority

评估中的 T2 系统 MUST 只能读取 L0/T1 数据并生成派生索引、关系或候选提案；不得直接覆盖、删除或成为 T1 事实来源。

#### Scenario: Candidate produces a durable proposal
- **WHEN** T2 derives a user, workflow, project, or skill memory
- **THEN** the proposal MUST retain its L0/T1 source references and evidence type
- **AND THEN** it MUST enter the existing governed candidate or confirmation path before durable storage
### Requirement: Evaluation MUST cover real Chinese memory workloads

评估 MUST 使用可复现的真实中文场景，覆盖用户偏好、中文项目连续性、中英混合技术文本和中文多跳语义。

#### Scenario: Candidate is compared with the baseline
- **WHEN** a candidate is evaluated against xpi-memo plus Mnemosyne
- **THEN** the comparison MUST report recall quality, false recall, provenance completeness, latency, and degradation behavior for each scenario
### Requirement: Evaluation MUST test three embedding modes

评估 MUST 分别覆盖无 embedding、本地 embedding 和云端 embedding，并报告隐私、延迟、成本和召回质量差异。

#### Scenario: Cloud embedding is disabled
- **WHEN** the user selects no embedding or local-only mode
- **THEN** the system MUST not send memory content to a remote provider
- **AND THEN** text search or local semantic fallback MUST remain available when supported
### Requirement: Evidence graph MUST remain derived and optional

轻量证据图 MUST 保留原始记忆与来源证据，并只能作为可选的关系召回或重排信号；图谱结果 MUST NOT 替换原文证据或 T1 状态。

#### Scenario: Graph extraction is unavailable
- **WHEN** graph construction or traversal fails
- **THEN** baseline vector/full-text recall MUST continue
- **AND THEN** the failure MUST be observable through bounded status metadata
### Requirement: Candidate MUST pass governance gates

外部候选 MUST 同时满足以下条件才可进入 adapter PoC：不增加热路径模型调用、保持精确删除和回滚能力、改善中文召回，且保留完整证据链。

#### Scenario: Candidate fails a hard gate
- **WHEN** a candidate requires direct writes, opaque remote storage, or unbounded hot-path processing
- **THEN** it MUST be rejected from runtime integration
- **AND THEN** the baseline xpi-memo behavior MUST remain unchanged
