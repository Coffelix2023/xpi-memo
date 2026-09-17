## MODIFIED Requirements

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
