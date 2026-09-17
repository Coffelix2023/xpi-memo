## MODIFIED Requirements

### Requirement: Three-way candidate confirmation

Candidate confirmation SHALL present Store, Later, and Reject with kind, target bank, and evidence summary visible before a choice. Store and Reject MUST keep existing candidate-lifecycle semantics. Later MUST leave the candidate pending and visible in the `/xpi-memo` Pending inbox. A blocking yes/no dialog MUST NOT be the only confirmation path.

Every candidate-producing entry path MUST obtain exactly one admission decision before presenting a confirmation choice. The decision SHALL be `pending`, `shadow-verified`, or `auto-stored`; it MUST apply content policy, scope routing, provenance validation, kind policy, verification, and permitted evidence upgrade in that order. Verification failure, timeout, unavailability, a missing repository-fact declaration, or a disabled rollout MUST leave the candidate pending and MUST NOT throw a tool-visible error.

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

- **WHEN** a `project_gene` candidate has a passing repository-fact verification and `XPI_MEMO_AUTO_ADMIT=true` while `XPI_MEMO_AUTO_VERIFY` is not disabled
- **THEN** the candidate is stored directly in the target bank without entering the pending queue
- **AND** L0 records `candidate_auto_verified` and `candidate_confirmed`
- **AND** audit.json records bounded verification evidence

#### Scenario: Verification-failed candidate enters review queue

- **WHEN** a `project_gene` candidate has failed, timed-out, unavailable, or missing repository-fact verification
- **THEN** the candidate retains its original evidence type
- **AND** the candidate enters the pending queue for Store/Later/Reject
- **AND** L0 and audit record a bounded failure reason without candidate content

#### Scenario: Non-verifiable kind skips auto-verification

- **WHEN** a candidate kind is not enabled for repository-fact verification
- **THEN** it enters the pending queue
- **AND** no automatic T1 write occurs
- **AND** the existing three-way confirmation flow remains available

#### Scenario: Verified candidate runs in shadow mode by default

- **WHEN** a `project_gene` candidate has a passing repository-fact verification and `XPI_MEMO_AUTO_ADMIT` is absent or not `true`
- **THEN** the candidate enters the pending queue
- **AND** audit records the bounded shadow verification outcome
- **AND** no T1 row is written automatically

#### Scenario: Remember uses the same admission decision

- **WHEN** `xpi_memo_remember` creates a `project_gene` candidate without a valid repository-fact declaration
- **THEN** it completes the shared admission decision as pending
- **AND** the tool returns a candidate outcome without an automatic T1 write
- **AND** the user can choose Store, Later, or Reject
