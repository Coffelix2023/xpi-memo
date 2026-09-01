## Purpose

Diagnoses empty T1 memory as a mutually exclusive health state so operators can tell “remember never called” from pending candidates, write failures, and empty recall.

## ADDED Requirements

### Requirement: Mutually exclusive empty-memory diagnosis

The system SHALL classify an empty T1 surface into exactly one of `NEVER_CALLED`, `PENDING`, `WRITE_FAILED`, or `RECALL_EMPTY`. The classification MUST be derived from audit entries, L0 T1 events, candidate queue presence, and bank row counts. The report MUST NOT claim that storage or search is broken when `xpi_memo_remember` has never been invoked.

#### Scenario: Remember never invoked

- **WHEN** audit contains no `write`, `candidate`, `confirmation`, or `rejection` entries
- **AND** L0 contains no `t1_memory_write`, `candidate_created`, `candidate_confirmed`, or `candidate_rejected` events
- **AND** the candidate queue is empty or missing
- **AND** all inspected memory tables have zero rows
- **THEN** the diagnosis is `NEVER_CALLED`
- **AND** the report names the missing remember invocations as the cause

#### Scenario: Candidates waiting

- **WHEN** one or more pending candidates exist
- **AND** no confirmed T1 rows exist
- **THEN** the diagnosis is `PENDING`
- **AND** the report includes the pending count and how to open the inbox

#### Scenario: Write attempted and failed

- **WHEN** audit or L0 records a remember attempt that ended in error or rejected store
- **AND** no stored T1 row resulted
- **THEN** the diagnosis is `WRITE_FAILED`
- **AND** the report includes the recorded reason without dumping raw memory content

#### Scenario: Banks queried but empty

- **WHEN** remember has stored at least once historically, or write evidence exists, but current recall against the configured data root returns zero rows
- **THEN** the diagnosis is `RECALL_EMPTY`
- **AND** the report lists the banks that were queried

### Requirement: Evidence bundle in the doctor report

The system SHALL include a bounded evidence bundle with audit action counts, L0 T1-related event counts, per-bank row counts, and configured versus CLI-default data roots. Sensitive memory content MUST NOT be copied into the report.

#### Scenario: Empty production surface

- **WHEN** a user runs the health doctor against a configured data root that has sessions but no T1 rows
- **THEN** the report includes audit counts, L0 session count, bank row counts, and both data-root paths
- **AND** the report does not embed candidate or memory body text

#### Scenario: Doctor remains read-only by default

- **WHEN** the health doctor runs (it is always read-only; there is no migrate mode)
- **THEN** no database, audit, candidate, or L0 file is modified
