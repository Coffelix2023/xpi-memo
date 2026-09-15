## Purpose

定义 `/xpi-memo` 弹出面板如何组织与呈现设置字段，让扩展用户在不读文档的情况下判断字段归属、当前值来自哪里，以及自己的改动会落到哪一类行为上。

## ADDED Requirements

### Requirement: Settings fields MUST be grouped by functional domain

`/xpi-memo` 面板的 Settings 视图 MUST 把可配置字段组织进具名的功能域分组，而不是呈现为一个无分组的平铺列表。

#### Scenario: Opening the Settings view

- **WHEN** a user opens `/xpi-memo` and switches to the Settings view
- **THEN** every field row MUST appear under a named group
- **AND THEN** the group name MUST describe the behaviour its fields share, not an internal module name

#### Scenario: A field belongs to exactly one group

- **WHEN** a field would plausibly fit more than one group
- **THEN** the system MUST place it in exactly one group
- **AND THEN** collapsing any other group MUST NOT make that field unreachable

### Requirement: Every effective configuration field MUST be reachable from the panel

面板的 Settings 视图 MUST 让每一个生效的配置字段都能被用户看到当前值，包括那些此前只能通过配置文件修改的字段。

#### Scenario: The field set is complete

- **WHEN** a user expands any group in the Settings view
- **THEN** each configuration field in that group MUST show its label and current value

#### Scenario: One-shot actions are distinguishable from configuration

- **WHEN** a row triggers an action rather than persisting a configuration value
- **THEN** that row MUST be visually distinguishable from configuration fields
- **AND THEN** triggering it MUST NOT be presented as having changed a persisted setting

### Requirement: Groups MUST collapse, and the default view MUST fit the panel body

Settings 视图 MUST 允许用户折叠与展开每个分组，且默认打开状态 MUST NOT 让内容超出面板 body 的可见行数。

#### Scenario: First open

- **WHEN** a user first opens the Settings view
- **THEN** exactly one group MUST start expanded
- **AND THEN** every group header MUST remain visible

#### Scenario: Collapsing a group

- **WHEN** a user collapses an expanded group
- **THEN** only that group's field rows MUST disappear
- **AND THEN** the expansion state of every other group MUST stay unchanged

#### Scenario: Expanded content exceeds the body

- **WHEN** the expanded row count exceeds the panel body's visible row count
- **THEN** the view MUST remain usable and MUST NOT clip the row holding the cursor
- **AND THEN** every expanded row MUST stay reachable

### Requirement: The cursor MUST move over the visible row sequence and keep the window aligned

面板 MUST 让光标在可见行序列上移动，并 MUST 使可见窗口始终包含光标所在行。

#### Scenario: Moving across a group boundary

- **WHEN** a user moves the cursor past a group header
- **THEN** the cursor MUST land on that group header itself
- **AND THEN** continuing to move MUST enter that group's fields or the next group header

#### Scenario: The window follows the cursor

- **WHEN** the cursor moves outside the currently visible window
- **THEN** the visible window MUST move so the cursor is visible again
- **AND THEN** the window MUST NOT extend past either end of the row sequence

#### Scenario: Collapsing removes the row under the cursor

- **WHEN** the cursor's field row disappears because its group was collapsed
- **THEN** the cursor MUST land on a row that still exists
- **AND THEN** the view MUST NOT render an empty cursor position

### Requirement: Each field MUST show where its current value comes from

面板 MUST 让用户看出某个字段的当前值是否已被环境变量固定，并在那种情况下阻止用户在面板内修改它。

#### Scenario: An environment variable pins the field

- **WHEN** a field's current value is decided by an environment variable
- **THEN** the field MUST stay visible and show its current value
- **AND THEN** it MUST present itself as not editable in the panel and name the environment variable that decides it

#### Scenario: No environment variable pins the field

- **WHEN** a field's current value comes from configuration the panel may write
- **THEN** the user MUST be able to change it in the panel

#### Scenario: A field that is never panel-writable

- **WHEN** a field's value is never writable from the panel
- **THEN** the field MUST still display its current value
- **AND THEN** it MUST NOT be presented as a value the user can cycle

### Requirement: The panel MUST keep its existing geometry contract

面板 MUST 保持既有的几何契约：宽度基准、chrome 行数，以及 body 的行数下限。分组不得改变其中任何一项。

#### Scenario: Standard terminal

- **WHEN** the panel renders at the standard terminal width
- **THEN** every row MUST fit the existing 78-column basis
- **AND THEN** the left and right border characters MUST stay continuous on every row

#### Scenario: A short terminal

- **WHEN** the terminal offers very few usable rows
- **THEN** the body MUST still provide at least the existing minimum row count
- **AND THEN** the panel MUST NOT overflow the usable viewport
