## Purpose

Manages the candidate lifecycle and confirmation flow for T1 memories, now writing to both L0 event log and current storage during the transition phase.

## MODIFIED Requirements

### Requirement: Candidate generation and confirmation

The system SHALL generate pending candidates for high-impact memories and write confirmation decisions to both L0 event log and mnemosyne during the transition phase.

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
