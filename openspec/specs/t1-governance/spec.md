# t1-governance Specification

## Purpose

Tightens the remember tool contract and candidate confirmation so writes are explicit, outcomes are unambiguous, and governance is not relaxed.

## Requirements

### Requirement: Remember requires an explicit kind

The `xpi_memo_remember` tool SHALL require `kind` as a closed enumeration of T1 memory kinds. The tool MUST NOT default missing `kind` to `session_context`. Auto-store policy MUST remain unchanged: only explicit stable preferences or workflows and verified project facts auto-store; other kinds become candidates.

#### Scenario: Kind omitted is rejected

- **WHEN** remember is invoked without `kind`
- **THEN** the call fails validation before any candidate or store write
- **AND** no audit `write` entry is recorded

#### Scenario: Explicit preference may auto-store

- **WHEN** remember is invoked with `kind` `global_preference` and explicit-user-statement evidence
- **THEN** the memory is stored without a candidate
- **AND** the tool result status is `stored`

#### Scenario: Project decision still needs confirmation

- **WHEN** remember is invoked with `kind` `project_decision`
- **THEN** a pending candidate is created
- **AND** the tool does not store to T1 until Store is chosen
- **AND** auto-store is not applied

### Requirement: Remember outcomes are explicit

Every successful remember invocation SHALL return exactly one of `stored`, `candidate`, or `rejected`. Error paths that never reached governance MUST return `error` and MUST NOT be counted as a stored memory.

#### Scenario: Stored outcome

- **WHEN** auto-store or a Store confirmation persists the memory
- **THEN** the tool result status is `stored`
- **AND** an audit write or confirmation is recorded
- **AND** an L0 `t1_memory_write` or `candidate_confirmed` event is recorded

#### Scenario: Candidate deferred

- **WHEN** the user chooses Later
- **THEN** the tool result status is `candidate`
- **AND** the candidate remains in the pending inbox
- **AND** T1 banks are unchanged

#### Scenario: User rejected

- **WHEN** the user chooses Reject
- **THEN** the tool result status is `rejected`
- **AND** the candidate is removed
- **AND** T1 banks are unchanged

### Requirement: Three-way candidate confirmation

Candidate confirmation SHALL present Store, Later, and Reject with kind, target bank, and evidence summary visible before a choice. Store and Reject MUST keep existing candidate-lifecycle semantics. Later MUST leave the candidate pending and visible in the `/xpi-memo` Pending inbox. A blocking yes/no dialog MUST NOT be the only confirmation path. 可工具验证的候选 SHALL 在进入确认流程前自动验证,验证通过则直接存储,绕过人工确认;验证失败则进入待审队列。

#### Scenario: Store from the card

- **WHEN** a pending candidate is shown and the user chooses Store
- **THEN** the candidate is confirmed
- **AND** the memory is written to the target bank
- **AND** L0 records `candidate_confirmed`

#### Scenario: Later queues for inbox review

- **WHEN** a pending candidate is shown and the user chooses Later
- **THEN** the candidate stays pending
- **AND** `/xpi-memo` Pending lists it
- **AND** no T1 row is written

#### Scenario: Inbox can still confirm later

- **WHEN** a Later-queued candidate is reviewed in the Pending inbox
- **THEN** the user can confirm or reject it with the same lifecycle semantics as the original card

#### Scenario: Auto-verified candidate bypasses confirmation

- **WHEN** 候选 kind 为 `project_gene`,且工具验证通过
- **THEN** 候选直接存储到目标 bank,不进入待审队列
- **AND** L0 记录 `candidate_auto_verified` 和 `candidate_confirmed` 事件
- **AND** audit.json 记录验证依据(文件路径、匹配内容)

#### Scenario: Verification-failed candidate enters review queue

- **WHEN** 候选 kind 为 `project_gene`,但工具验证失败
- **THEN** 候选保持 `l0-conclusion` 证据类型
- **AND** 候选进入待审队列,等待用户 Store/Later/Reject
- **AND** L0 记录 `tool_verification_failed` 事件

#### Scenario: Non-verifiable kind skips auto-verification

- **WHEN** 候选 kind 为 `project_decision`(不可工具验证)
- **THEN** 候选直接进入待审队列
- **AND** 不调用工具验证路径
- **AND** 保持现有三态确认流程

### Requirement: Candidate generation and confirmation

The system SHALL generate pending candidates for high-impact memories and write confirmation decisions to both L0 event log and mnemosyne during the transition phase. 工具验证产生的自动存储 SHALL 同样记录 L0 事件,保持审计完整性。

#### Scenario: Candidate created and logged to L0
- **WHEN** a project_decision memory is submitted
- **THEN** a pending candidate is created
- **AND** candidate_created event is written to L0 log
- **AND** candidate is stored in candidates.json

#### Scenario: Confirmation logged to L0
- **WHEN** user confirms a pending candidate
- **THEN** memory is written to mnemosyne
- **AND** candidate_confirmed event is written to L0 log
- **AND** confirmation is recorded in audit.json

#### Scenario: Rejection logged to L0
- **WHEN** user rejects a pending candidate
- **THEN** candidate is marked rejected
- **AND** candidate_rejected event is written to L0 log
- **AND** rejection is recorded in audit.json

#### Scenario: Auto-verification logged to L0
- **WHEN** 工具验证通过,候选自动存储
- **THEN** memory 写入 mnemosyne
- **AND** L0 记录 `candidate_auto_verified` 和 `candidate_confirmed` 事件
- **AND** audit.json 记录 `tool-verified` 审计条目,包含验证依据

### Requirement: Candidate queue persistence

The system SHALL persist candidate queue state to both candidates.json and L0 event log, enabling recovery from either source.

#### Scenario: Dual persistence during transition
- **WHEN** candidates are added or resolved
- **THEN** state is written to candidates.json
- **AND** events are appended to L0 log
- **AND** both sources remain synchronized

#### Scenario: Recovery from L0 log
- **WHEN** candidates.json is missing or corrupt
- **THEN** candidate queue is reconstructed from L0 events
- **AND** all pending candidates are recovered

#### Scenario: Recovery from candidates.json
- **WHEN** L0 log is unavailable
- **THEN** candidate queue is loaded from candidates.json
- **AND** system continues operating

### Requirement: Evidence recording in L0

The system SHALL record evidence metadata (provenance, confidence, source) for all candidates in L0 events, enabling full audit trail.

#### Scenario: Evidence captured in L0
- **WHEN** creating a candidate with evidence
- **THEN** L0 event includes full evidence metadata
- **AND** evidence is traceable back to source

#### Scenario: Evidence immutability
- **WHEN** candidate evidence is recorded in L0
- **THEN** evidence cannot be modified
- **AND** any changes create new candidate with new evidence

### Requirement: T1 outcomes require lifecycle-consistent reporting

T1 writes from direct capture, candidate confirmation and gated offline extraction MUST use the same failure-aware lifecycle semantics. A backend success without a recorded commit result MUST be reported as unresolved rather than as a confirmed stored outcome.

#### Scenario: Direct capture succeeds

- **WHEN** direct governed capture writes a T1 memory successfully
- **THEN** the tool result MUST identify the operation as stored only after its commit outcome is recorded
- **AND THEN** the corresponding L0 lifecycle records MUST be available for projection and audit

#### Scenario: Candidate confirmation backend fails

- **WHEN** a user confirms a candidate but the T1 backend rejects the write
- **THEN** the candidate MUST remain recoverable or be marked with a failure outcome
- **AND THEN** the tool MUST NOT report a successful confirmation
- **AND THEN** no confirmed T1 memory write may be projected

#### Scenario: Offline extraction write is unresolved

- **WHEN** offline extraction completes a backend call but the commit lifecycle record is unavailable
- **THEN** the result MUST expose an unresolved outcome
- **AND THEN** the system MUST NOT silently count it as a confirmed stored memory

### Requirement: T1 governance preserves existing candidate boundaries

Failure-aware lifecycle tracking MUST NOT bypass candidate creation, explicit confirmation, scope routing, provenance validation or content policy. Lifecycle metadata supplements governance and does not turn an unconfirmed candidate into a T1 row.

#### Scenario: Project decision remains gated

- **WHEN** a project decision requires candidate confirmation
- **THEN** the candidate MUST remain pending until Store is selected
- **AND THEN** lifecycle records MUST describe the confirmation operation separately from the candidate-created event
