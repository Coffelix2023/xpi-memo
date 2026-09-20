## MODIFIED Requirements

### Requirement: The window MUST honor the documented 800×600 geometry

像素窗口 MUST 以其启动尺寸 800×600 打开，该数字 MUST 由 `TUI-DESIGN.md` 与实现中的窗口宽度/高度常量共同定义。窗口 MUST 可被用户缩放，且内容 MUST 铺满窗口：只有 header、footer 与侧栏保持定尺，其余空间归正文区。窗口 MUST NOT 自行请求改变尺寸，也 MUST NOT 因内容变高而增长。

#### Scenario: Opening the window

- **WHEN** the pixel window opens
- **THEN** its launch dimensions MUST be exactly 800×600 pixels
- **AND THEN** no view MUST overflow the window bounds

#### Scenario: The window is resized

- **WHEN** a user resizes the window
- **THEN** the content MUST fill the available area instead of leaving the added space empty
- **AND THEN** a region whose content no longer fits MUST scroll internally rather than overflow

#### Scenario: Content exceeds the available height

- **WHEN** a view's content is taller than the region it is given
- **THEN** that region MUST scroll internally
- **AND THEN** the window MUST NOT grow, and MUST NOT push controls outside the window

### Requirement: Window text MUST follow the configured language and be switchable in-window

窗口自身的 chrome、视图名、字段标签与备注 MUST 跟随生效配置中的语言；MUST 同样覆盖由代码固定、但取自已存数据的文案——候选的理由与证据说明、审计事件的名称与状态词。用户 MUST 能在窗口内切换语言而不需要离开窗口或编辑配置。为达成语言一致 MUST NOT 改写已存数据。

#### Scenario: Configured language

- **WHEN** the effective configuration selects a language
- **THEN** the window's view names, field labels, and notes MUST render in that language
- **AND THEN** the switch MUST take effect without editing window source

#### Scenario: Switching language in the window

- **WHEN** a user switches language inside the window
- **THEN** all visible text MUST re-render in the newly selected language
- **AND THEN** the selection MUST persist for the next open

#### Scenario: A string is derived from stored data

- **WHEN** a stored record carries a fixed sentence or code, such as a candidate's reason or an audit action
- **THEN** the window MUST render that record's text through the panel's dictionary for the selected language
- **AND THEN** the stored value MUST NOT be rewritten to achieve it

#### Scenario: A string has no translation

- **WHEN** a window string has no entry for the selected language
- **THEN** the window MUST still render a readable fallback for that string
- **AND THEN** it MUST NOT render an empty element or crash

## ADDED Requirements

### Requirement: Settings fields MUST be editable in the window, with the panel's guards

窗口的 Settings 视图 MUST 提供与终端面板相同的操作入口，使用户能在不手工编辑配置文件的前提下修改字段。可枚举字段 MUST 提供一个可键盘操作的取值选择器，自由文本字段 MUST 提供一个可输入的文本框；被环境变量固定的字段 MUST 显示当前值并 MUST 阻止在窗口内修改它。窗口 MUST NOT 要求一个独立于字段的额外保存步骤。

#### Scenario: Changing an enumerated field

- **WHEN** a user activates an enumerated field's control and selects another value
- **THEN** the new value MUST be written through the same configuration path the terminal panel uses
- **AND THEN** the window MUST display the new value without being reopened

#### Scenario: A field is pinned by the environment

- **WHEN** a field's effective value comes from an environment variable
- **THEN** the field MUST display that value
- **AND THEN** the window MUST NOT let the user change it

#### Scenario: A row triggers an action rather than storing a value

- **WHEN** a settings row performs an action instead of writing a configuration key
- **THEN** the window MUST ask for confirmation before performing it
- **AND THEN** the action MUST NOT be written to the configuration
