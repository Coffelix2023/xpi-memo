# pi-runtime-compatibility Specification

## Purpose
确保 xpi-memo 在受支持的 Pi 运行时版本上保持扩展加载、工具执行和终端交互兼容，同时让依赖解析结果可审计、可回滚，避免版本漂移造成隐性运行时差异。

## Requirements

### Requirement: Supported Pi packages resolve to one coherent runtime
The extension SHALL declare and resolve the supported Pi runtime package set at the approved release version, while retaining the Pi-compatible `typebox` version required by that release.

#### Scenario: Clean dependency installation
- **WHEN** dependencies are installed from the committed manifest and lockfile with the repository's frozen-install policy
- **THEN** installation succeeds and the Pi runtime package set resolves coherently at the approved version

#### Scenario: Physical singleton verification
- **WHEN** the installed dependency tree is inspected for `@earendil-works/pi-tui` and `typebox`
- **THEN** each package has exactly one physical installed version and the result is reported as part of upgrade verification

### Requirement: Registered tools remain executable under the supported Pi API
The extension SHALL register its existing tools without changing their user-visible behavior, and tool execution test contexts SHALL satisfy the supported Pi API contract.

#### Scenario: Extension registration
- **WHEN** the extension is loaded by the supported Pi runtime
- **THEN** existing commands, tools, lifecycle handlers, and model calls register without type or runtime errors

#### Scenario: Tool execution context
- **WHEN** an integration test invokes a registered tool through the supported runtime contract
- **THEN** the test provides the runtime's complete tool execution context and the tool returns the same result shape and governance behavior as the baseline

### Requirement: Terminal surfaces preserve interaction behavior across TUI modes
The extension SHALL preserve custom panel, overlay, keyboard, focus restoration, Glimpse fallback, and terminal fallback behavior in both supported regular and fullscreen TUI modes.

#### Scenario: Fullscreen mode
- **WHEN** the extension runs with the Pi runtime's fullscreen TUI mode
- **THEN** custom overlays render within the terminal, accept expected keyboard input, close correctly, and restore the surrounding input surface

#### Scenario: Regular mode
- **WHEN** the extension runs with regular TUI mode
- **THEN** the same custom surfaces remain usable without incorrect placement, clipping, or focus loss

#### Scenario: Fallback surface
- **WHEN** Glimpse is unavailable or disabled
- **THEN** the terminal fallback remains usable and does not require a user-specific development port or an environment-variable-only configuration workaround

### Requirement: Upgrade verification is reproducible and rollbackable
The change SHALL provide reproducible checks for type compatibility, behavior regression, dependency topology, and runtime interaction before the upgraded dependency set is accepted.

#### Scenario: Verification failure
- **WHEN** a required type, test, singleton, installation, or TUI check fails
- **THEN** the upgrade is not accepted and the previous manifest, lockfile, and compatible test state remain available for rollback

#### Scenario: Verification success
- **WHEN** all required checks pass in the repository and a real Pi smoke test covers both TUI modes and fallback behavior
- **THEN** the upgraded dependency set is considered ready for review without changing memory data or unrelated mental-model behavior
