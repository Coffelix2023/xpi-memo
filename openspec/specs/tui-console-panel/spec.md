# tui-console-panel Specification

## Purpose

定义 `/xpi-memo` 弹出面板如何组织与呈现设置字段，让扩展用户在不读文档的情况下判断字段归属、每个开关改的是什么、当前值来自哪里，以及面板以哪种语言说话。

## Requirements

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

### Requirement: Every field MUST carry a note explaining what it changes

面板 MUST 为每个可配置字段呈现一句说明其后果的备注，使 `hybrid`、`on`、`disabled` 这类值不需要额外文档即可理解。

#### Scenario: Reading a field row

- **WHEN** a user reads a field row
- **THEN** the row MUST show the field's label, its current value, and a note describing what the field changes
- **AND THEN** the three parts MUST stay visually distinguishable

#### Scenario: The row is narrower than the three parts

- **WHEN** the panel is narrower than the sum of the three parts
- **THEN** the row MUST degrade without breaking column alignment
- **AND THEN** the label and the value MUST stay readable

### Requirement: Panel text MUST follow the configured language

终端面板自身的 chrome、字段标签与字段备注 MUST 跟随生效配置中的语言，而不是固定为某一种语言。像素窗口的页内语言切换是它自己的契约，MUST NOT 改变终端面板对生效配置语言的服从。

#### Scenario: A user switches the configured language

- **WHEN** the effective configuration selects a language
- **THEN** the panel's group names, field labels, and field notes MUST render in that language
- **AND THEN** the switch MUST take effect without editing panel source

#### Scenario: A string has no translation

- **WHEN** a panel string has no entry for the selected language
- **THEN** the panel MUST still render a readable fallback for that string
- **AND THEN** it MUST NOT render an empty row or crash

### Requirement: The panel MUST honor the documented geometry budget

面板 MUST 遵守 `TUI-DESIGN.md` 定义的高度与留白预算，而不是随终端高度无限增长。宽度基准与 chrome 行数保持不变。该预算是终端表面的自有契约，独立于像素窗口的固定 800×600 尺寸——两者 MUST NOT 互相推导。

#### Scenario: Standard terminal

- **WHEN** the panel renders at the standard terminal width
- **THEN** every row MUST fit the existing 78-column basis
- **AND THEN** the left and right border characters MUST stay continuous on every row

#### Scenario: A tall terminal

- **WHEN** the terminal offers more rows than the documented panel height allows
- **THEN** the panel MUST occupy the smaller of the documented panel height and the documented share of the terminal
- **AND THEN** it MUST NOT stretch to fill the terminal

#### Scenario: A short terminal

- **WHEN** the terminal offers very few usable rows
- **THEN** the body MUST still provide at least the existing minimum row count
- **AND THEN** the panel MUST NOT overflow the usable viewport

#### Scenario: Clearing the input area

- **WHEN** the panel is anchored in the viewport
- **THEN** it MUST leave the documented bottom margin clear
- **AND THEN** it MUST NOT cover the conversation input region

### Requirement: Settings MUST expose the admission preferences as tunable fields

面板的 Settings 视图 MUST 呈现准入偏好，使用户能在不手工编辑配置文件的前提下收紧或放宽自动准入。每个偏好 MUST 显示当前生效值，且当该偏好被环境变量固定时 MUST 阻止用户在面板内修改它。

#### Scenario: 查看与修改准入偏好

- **WHEN** 用户展开准入偏好分组
- **THEN** 每个偏好字段 MUST 显示其标签与当前生效值
- **AND THEN** 用户可修改未被环境变量固定的字段
- **AND THEN** 修改结果 MUST 写回配置文件并在后续准入判定中生效

#### Scenario: 准入偏好被环境变量固定

- **WHEN** 某个准入偏好由环境变量固定
- **THEN** 该行 MUST 显示对应环境变量名
- **AND THEN** 用户 MUST NOT 能在面板内修改它
- **AND THEN** 该行显示的 MUST 是实际生效值，而不是配置文件里的值

### Requirement: The terminal panel MUST remain complete when the pixel window is unavailable

终端面板在 Glimpse 像素窗口不可用时 MUST 作为完整表面工作，而不是一个功能子集。四个视图（待审、最近、设置、状态）MUST 在终端面板中全部可达，且 MUST 不依赖像素窗口曾经打开过。

#### Scenario: No Glimpse on the machine

- **WHEN** the terminal panel is the surface the user gets because Glimpse cannot be resolved
- **THEN** every view MUST be reachable from the terminal panel alone
- **AND THEN** no field or action MUST be reachable only through the pixel window

#### Scenario: Switching surfaces between sessions

- **WHEN** a user reviewed candidates in the pixel window in one session and gets the terminal panel in the next
- **THEN** the terminal panel MUST render the current state without depending on anything the pixel window wrote
- **AND THEN** it MUST NOT read a pixel-window-specific preference store to decide its content
