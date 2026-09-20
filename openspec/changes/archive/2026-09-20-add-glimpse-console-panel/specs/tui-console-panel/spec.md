## ADDED Requirements

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

## MODIFIED Requirements

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

终端面板 MUST 遵守 `TUI-DESIGN.md` 定义的高度与留白预算，而不是随终端高度无限增长。宽度基准与 chrome 行数保持不变。该预算是终端表面的自有契约，独立于像素窗口的固定 800×600 尺寸——两者 MUST NOT 互相推导。

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
