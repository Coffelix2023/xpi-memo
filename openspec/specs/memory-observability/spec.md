# memory-observability Specification

## Purpose

This capability defines the memory-state behavior that must exist behind xpi-memo's user-facing surfaces. It makes memory observable to humans, improves how memory enters the system, and keeps recall understandable through scope, provenance, lifecycle, and ranking rules.

## Requirements

### Requirement: Memory state MUST be human-readable

The system MUST expose memory items through human-readable labels that describe the memory's meaning, not only its internal kind.

#### Scenario: User inspects stored memories

- **WHEN** a user inspects stored memories in the console or status surface
- **THEN** each item MUST display a human-readable label
- **AND THEN** the item MUST make its scope and lifecycle state understandable

#### Scenario: Label mapping is consistent

- **WHEN** the system renders the same memory in different visual surfaces
- **THEN** the human-readable label MUST be consistent
- **AND THEN** the mapping MUST remain deterministic

### Requirement: Memory visibility MUST include scope, trust, and provenance

The system MUST show the memory scope, trust or confirmation state, and provenance summary for visible memory items without exposing sensitive raw body text as the default presentation.

#### Scenario: Candidate review card is rendered

- **WHEN** a candidate memory is shown for review
- **THEN** the view MUST show the target scope, candidate state, and provenance summary
- **AND THEN** the view MUST not require the user to infer those details from internal identifiers

#### Scenario: Diagnostic view shows counts

- **WHEN** the user opens a diagnostic or status view
- **THEN** the system MUST show useful counts for stored, pending, rejected, and recall-related states
- **AND THEN** the view MUST remain readable without revealing full sensitive memory bodies

### Requirement: Candidate backlog MUST be visible to the user

The system MUST surface pending review work so that candidate memories are not hidden in an invisible queue.

#### Scenario: Pending queue exists

- **WHEN** pending candidates exist
- **THEN** the system MUST provide a visible summary of the backlog
- **AND THEN** the user MUST be able to reach the pending items from the primary console flow

#### Scenario: Backlog digest is shown

- **WHEN** the backlog exceeds the lightweight visible summary threshold
- **THEN** the system MUST still surface that pending review work exists
- **AND THEN** the summary MUST be concise enough to fit into a routine startup or review flow

### Requirement: Explicit memory intent MUST be captured deterministically

The system MUST capture explicit user memory intent through a deterministic activation path that does not depend on the agent remembering to call memory capture at the right moment.

#### Scenario: User states a durable preference

- **WHEN** the user states a durable preference, workflow, or decision explicitly
- **THEN** the system MUST be able to route that content into the memory activation flow
- **AND THEN** the flow MUST produce a memory outcome or a candidate outcome

#### Scenario: Activation does not require guesswork

- **WHEN** the system processes explicit memory intent
- **THEN** it MUST not require ambiguous agent-side inference to decide that the content belongs in memory
- **AND THEN** the resulting state MUST be explainable from provenance

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

### Requirement: Recall MUST respect standing and contextual memory separation

The system MUST distinguish standing memory from contextual memory during recall and injection.

#### Scenario: Recall runs for a new prompt

- **WHEN** the system evaluates memory for injection into a prompt
- **THEN** it MUST treat long-lived standing memory separately from contextual memory
- **AND THEN** the system MUST apply budget limits before injection

#### Scenario: Recall ranking is computed

- **WHEN** the system ranks candidate memories for recall
- **THEN** it MUST consider relevance, intent, recency, scope priority, and diversity or dedupe constraints
- **AND THEN** stale or superseded memory MUST not dominate the injected context

### Requirement: Recall and observability MUST remain provenance-safe

The system MUST expose enough observability to explain decisions while avoiding raw sensitive body leakage in default diagnostic output.

#### Scenario: Diagnostic output is generated

- **WHEN** the system emits a status or doctor view
- **THEN** the output MUST include counts, kinds, scope, and provenance summaries
- **AND THEN** the output MUST not require dumping full memory bodies by default

### Requirement: Terminal and rich surfaces MUST consume one read-only memory contract

The terminal console and optional rich status surface MUST consume the same `MemoryStatus`, `ObservabilitySnapshot`, and canonical T1 taxonomy values. Neither surface may become a source of truth or persist UI-specific memory state.

#### Scenario: Both surfaces inspect the same status

- **WHEN** the same status is rendered in the terminal console and rich status surface
- **THEN** both surfaces MUST receive the same labels, scope, trust-state, lifecycle, provenance summaries, and bounded counts
- **AND THEN** neither surface MUST write memory bodies, candidates, audit records, or L0 events as part of rendering

#### Scenario: Traceability is needed

- **WHEN** a user or operator needs to understand why a memory exists
- **THEN** the system MUST provide a path back to its source event or review state
- **AND THEN** the traceability MUST remain bounded and readable
