## Purpose

Tightens the remember tool contract and candidate confirmation so writes are explicit, outcomes are unambiguous, and governance is not relaxed.

## ADDED Requirements

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

Candidate confirmation SHALL present Store, Later, and Reject with kind, target bank, and evidence summary visible before a choice. Store and Reject MUST keep existing candidate-lifecycle semantics. Later MUST leave the candidate pending and visible in the `/xpi-memo` Pending inbox. A blocking yes/no dialog MUST NOT be the only confirmation path.

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
