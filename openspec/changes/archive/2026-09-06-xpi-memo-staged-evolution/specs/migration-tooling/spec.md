## Purpose

Provides migration utilities to help users transition from fx-pi-memoharness to xpi-memo, including data import, configuration migration, and backward compatibility tooling.

## ADDED Requirements

### Requirement: Configuration migration

The system SHALL provide a command to migrate fx-pi-memoharness configuration files to xpi-memo format.

#### Scenario: Migrate user config
- **WHEN** user runs migration command on memoharness config
- **THEN** xpi-memo config is generated with equivalent settings
- **AND** original config is preserved

#### Scenario: Config path mapping
- **WHEN** memoharness used custom data directory
- **THEN** xpi-memo config points to same directory
- **AND** existing data remains accessible

#### Scenario: Unknown settings preserved
- **WHEN** memoharness config contains unrecognized settings
- **THEN** migration preserves them as comments
- **AND** warns user about unmapped settings

### Requirement: Audit log import

The system SHALL import existing audit.json from memoharness into L0 event log format.

#### Scenario: Audit entries converted to L0 events
- **WHEN** importing audit.json
- **THEN** each audit entry becomes an L0 event
- **AND** original timestamps are preserved

#### Scenario: Action type mapping
- **WHEN** audit action is "write"
- **THEN** L0 event type is "t1_memory_write"
- **AND** metadata is preserved in payload

#### Scenario: Partial import continues
- **WHEN** some audit entries are corrupt
- **THEN** valid entries are imported
- **AND** corrupt entries are logged as skipped

### Requirement: Mnemosyne bank preservation

The system SHALL recognize and use existing mnemosyne.db banks without requiring re-indexing or migration.

#### Scenario: Global bank reused
- **WHEN** xpi-memo starts with existing mnemosyne.db
- **THEN** it uses the database as-is
- **AND** no data is lost or re-indexed

#### Scenario: Project banks discovered
- **WHEN** xpi-memo finds existing banks/project-<id>/ directories
- **THEN** it recognizes them as project banks
- **AND** continues using them without migration

#### Scenario: Bank compatibility verified
- **WHEN** xpi-memo encounters a mnemosyne database
- **THEN** it checks schema version compatibility
- **AND** warns if version mismatch detected

### Requirement: Candidate queue import

The system SHALL import pending candidates from memoharness candidates.json into xpi-memo's candidate store.

#### Scenario: Pending candidates preserved
- **WHEN** candidates.json contains unconfirmed memories
- **THEN** they appear in xpi-memo's pending queue
- **AND** can be confirmed or rejected normally

#### Scenario: Candidate metadata preserved
- **WHEN** importing a candidate
- **THEN** its kind, content, evidence, and rationale are preserved
- **AND** timestamp reflects original creation time

### Requirement: Backward compatibility mode

The system SHALL provide a compatibility mode where xpi-memo operates exactly like memoharness for users not yet adopting L0/Markdown features.

#### Scenario: Legacy mode operation
- **WHEN** user enables legacy compatibility mode
- **THEN** L0 event log and Markdown export are disabled
- **AND** system behaves identically to memoharness

#### Scenario: Gradual feature adoption
- **WHEN** user disables legacy mode
- **THEN** L0 and Markdown features activate
- **AND** existing mnemosyne data remains usable

### Requirement: Migration dry-run

The system SHALL provide a dry-run mode that reports what would be migrated without performing actual changes.

#### Scenario: Dry-run reports findings
- **WHEN** running migration in dry-run mode
- **THEN** it reports found config, audit log, banks, candidates
- **AND** no files are written or modified

#### Scenario: Dry-run identifies issues
- **WHEN** dry-run detects potential issues
- **THEN** it reports them with severity levels
- **AND** suggests remediation steps

#### Scenario: Dry-run estimates impact
- **WHEN** dry-run completes
- **THEN** it reports estimated disk usage changes
- **AND** estimated migration time

### Requirement: Migration safety

The system SHALL never delete or overwrite original memoharness data during migration, ensuring safe rollback.

#### Scenario: Original files preserved
- **WHEN** migration runs
- **THEN** memoharness files remain unchanged
- **AND** new xpi-memo files are created separately

#### Scenario: Rollback instructions
- **WHEN** migration completes
- **THEN** system provides rollback instructions
- **AND** explains how to revert to memoharness

#### Scenario: Concurrent operation safety
- **WHEN** migration runs while memoharness is installed
- **THEN** both systems can coexist without conflicts
- **AND** no data corruption occurs

### Requirement: Migration validation

The system SHALL validate migrated data to ensure correctness and completeness.

#### Scenario: Data integrity check
- **WHEN** migration completes
- **THEN** system verifies all audit entries were imported
- **AND** reports any discrepancies

#### Scenario: Bank accessibility test
- **WHEN** migration imports mnemosyne banks
- **THEN** system tests recall against each bank
- **AND** confirms accessibility

#### Scenario: Configuration validation
- **WHEN** config is migrated
- **THEN** system validates all required fields are present
- **AND** warns about invalid values

### Requirement: Migration progress reporting

The system SHALL provide real-time progress updates during long-running migrations.

#### Scenario: Progress percentage
- **WHEN** migrating large audit logs
- **THEN** system reports progress as percentage
- **AND** estimates time remaining

#### Scenario: Phase reporting
- **WHEN** migration progresses through phases
- **THEN** each phase is announced (config, audit, banks, candidates)
- **AND** phase completion is reported

#### Scenario: Item count tracking
- **WHEN** importing audit entries
- **THEN** system reports "Imported N of M entries"
- **AND** updates in real-time

### Requirement: Selective migration

The system SHALL allow users to migrate only specific components (config, audit, banks, candidates) rather than all-or-nothing.

#### Scenario: Config-only migration
- **WHEN** user requests config migration only
- **THEN** only config is migrated
- **AND** data remains in memoharness format

#### Scenario: Audit-only import
- **WHEN** user requests audit import only
- **THEN** audit.json is imported to L0 log
- **AND** config and banks remain unchanged

#### Scenario: Bank-only linkage
- **WHEN** user requests bank linkage only
- **THEN** xpi-memo points to existing banks
- **AND** no config or audit migration occurs

### Requirement: Migration idempotency

The system SHALL handle repeated migration runs safely, detecting and skipping already-migrated content.

#### Scenario: Repeated migration detected
- **WHEN** migration runs on already-migrated data
- **THEN** system detects previous migration
- **AND** prompts user for action (skip, overwrite, merge)

#### Scenario: Incremental migration
- **WHEN** new audit entries exist since last migration
- **THEN** only new entries are imported
- **AND** existing imported entries are preserved

### Requirement: Migration documentation generation

The system SHALL generate a migration report documenting what was migrated and any issues encountered.

#### Scenario: Report includes summary
- **WHEN** migration completes
- **THEN** report includes items migrated, skipped, failed
- **AND** includes timestamps and durations

#### Scenario: Report includes recommendations
- **WHEN** migration encounters issues
- **THEN** report includes actionable recommendations
- **AND** links to documentation

#### Scenario: Report saved to disk
- **WHEN** migration completes
- **THEN** report is saved to <dataDir>/migration-report-<timestamp>.md
- **AND** path is displayed to user
