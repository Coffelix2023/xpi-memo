## Purpose

Makes recall observability report the banks that were actually queried, including when those banks contain no matching rows.

## ADDED Requirements

### Requirement: Empty recall still reports queried banks

A recall against the configured data root SHALL include every bank that the search actually queried in `queriedBanks`, even when the result list is empty. An empty `queriedBanks` array is reserved for the case where no search backend ran.

#### Scenario: Git project with empty banks

- **WHEN** recall runs in a recognized git project
- **AND** the project bank exists or the global bank is queried
- **AND** no rows match
- **THEN** `results` is empty
- **AND** `queriedBanks` contains the banks that were queried

#### Scenario: Non-git directory queries global only

- **WHEN** recall runs outside a recognized git project
- **AND** the global bank is queried
- **AND** no rows match
- **THEN** `queriedBanks` contains the global bank
- **AND** it does not list a project bank

#### Scenario: No backend available

- **WHEN** no search backend is installed or available
- **THEN** `results` is empty
- **AND** `queriedBanks` is empty
- **AND** the response includes a warning that no backend ran

### Requirement: Empty queriedBanks is not evidence of a missed data root

The system SHALL NOT treat `queriedBanks: []` as proof that the configured data root was not consulted when a backend actually ran. Doctor and status output MUST distinguish “backend queried empty banks” from “no backend ran”.

#### Scenario: Status after empty hybrid recall

- **WHEN** mnemosyne recall returns zero rows from the configured data root
- **THEN** status or doctor shows the queried banks and the configured data root
- **AND** it does not describe the event as “no banks queried”
