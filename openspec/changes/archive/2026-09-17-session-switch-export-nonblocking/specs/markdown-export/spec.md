## MODIFIED Requirements

### Requirement: Automatic export on session end

The system SHALL optionally auto-export Markdown when a session ends, configurable via user settings. The export SHALL be initiated as background work that does not delay session shutdown or session switching; the session MUST NOT wait for export completion before becoming ready for the next session.

#### Scenario: Auto-export enabled

- **WHEN** session ends and auto-export is enabled
- **THEN** export is initiated and proceeds in the background
- **AND** session shutdown completes without waiting for export completion
- **AND** export errors are swallowed and do not surface as session errors

#### Scenario: Session switch is not delayed by export

- **WHEN** the user switches sessions (`/new`, `/resume`, or `/fork`) and the outgoing session has auto-export enabled
- **THEN** the switch completes without waiting for the outgoing session's Markdown export
- **AND** the export of the outgoing session still runs to completion if the process remains alive

#### Scenario: Early exit during background export

- **WHEN** the process exits while a background export from a previous session shutdown is still running
- **THEN** the session event log remains intact as the source of truth
- **AND** the next successful export converges to the correct Markdown state (no data loss)

#### Scenario: Auto-export disabled

- **WHEN** session ends and auto-export is disabled
- **THEN** no export occurs
- **AND** user must manually trigger export later
