## Purpose

Keeps the Pi extension and the mnemosyne CLI on one configurable data root, and treats other default directories as independent surfaces that doctor can detect and report without migrating them.

## ADDED Requirements

### Requirement: Single configured data root

The system SHALL persist T1 banks, audit, candidates, L0 sessions, and Markdown export under one configured data root. Extension-spawned mnemosyne processes MUST use that same root. The default root remains the existing extension data directory unless the user overrides it through config or `XPI_MEMO_DATA_DIR`.

#### Scenario: Extension write and CLI verify the same root

- **WHEN** the extension stores a memory under the configured data root
- **AND** the operator inspects that same root with the mnemosyne CLI
- **THEN** the stored row is visible
- **AND** a bare CLI invocation that still uses a different default root MUST NOT be treated as the extension surface

#### Scenario: Override via environment

- **WHEN** `XPI_MEMO_DATA_DIR` points at a writable directory
- **THEN** extension tools, doctor, and spawned CLI processes all use that directory
- **AND** the previous default root is left untouched

### Requirement: Detect independent surfaces

The system SHALL report the configured root, the mnemosyne CLI default root, and any stale copy directory as independent surfaces when their paths or inodes differ. Doctor MUST NOT create symlinks or shell wrappers to paper over the split.

#### Scenario: Forked empty libraries

- **WHEN** the configured root, the CLI default root, and a stale home-directory copy exist as distinct directories
- **THEN** doctor lists each surface with path and row count
- **AND** doctor states that they are independent until the user manually consolidates them (documented CLI cross-check)

#### Scenario: No silent merge

- **WHEN** two surfaces differ
- **THEN** doctor does not copy, delete, or link files; it reports the surfaces and points to the documented manual CLI cross-check

