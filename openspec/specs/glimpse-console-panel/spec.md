# glimpse-console-panel Specification

## Purpose

定义 `/xpi-memo` 的 Glimpse 像素窗口——当 Glimpse 可用时，用户在一个固定 800×600 的原生浮窗里查看待审、最近、设置与状态四个视图，配色与文案跟随项目主题令牌与生效语言，且窗口不可用时能力不丢失。

## Requirements

### Requirement: The Glimpse window MUST be preferred when available, and the terminal panel MUST remain the fallback

当 Glimpse 运行时可用时，`/xpi-memo` MUST 优先打开像素窗口；当 Glimpse 不可用、未安装或调用失败时，MUST 无缝降级到终端面板。降级 MUST NOT 让任何视图或字段变得不可达，也 MUST NOT 向用户暴露错误堆栈。

#### Scenario: Glimpse is available

- **WHEN** a user runs `/xpi-memo` on a machine where Glimpse resolves successfully
- **THEN** the system MUST open the pixel window instead of the terminal panel
- **AND THEN** the terminal MUST NOT render a terminal panel for the same invocation

#### Scenario: Glimpse is unavailable

- **WHEN** a user runs `/xpi-memo` on a machine where Glimpse cannot be resolved
- **THEN** the system MUST render the terminal panel instead
- **AND THEN** every view and field the pixel window would show MUST remain reachable

#### Scenario: The window fails after being selected

- **WHEN** Glimpse resolves but the window call fails or throws
- **THEN** the system MUST fall back to the terminal panel for that invocation
- **AND THEN** it MUST NOT surface the failure as an unhandled error

### Requirement: The window MUST honor the documented 800×600 geometry

像素窗口 MUST 使用 `TUI-DESIGN.md` 定义的固定 800×600 尺寸，内容 MUST 在该尺寸内组织，而不是请求窗口自适应或增长。

#### Scenario: Opening the window

- **WHEN** the pixel window opens
- **THEN** its dimensions MUST be exactly 800×600 pixels
- **AND THEN** no view MUST overflow the window bounds

#### Scenario: Content exceeds the available height

- **WHEN** a view's content is taller than the region it is given
- **THEN** that region MUST scroll internally
- **AND THEN** the window MUST NOT grow, and MUST NOT push controls outside the window

### Requirement: The window MUST present the same four views as the terminal panel

像素窗口 MUST 提供待审、最近、设置与状态四个视图，且 MUST 呈现与终端面板相同的信息层级：相同的字段、相同的顺序、相同的操作入口。像素媒介允许改变布局与视觉，MUST NOT 改变「哪些内容在前、有哪些操作」。

#### Scenario: Switching views

- **WHEN** a user selects a different view
- **THEN** the window MUST show that view's content
- **AND THEN** the other three views MUST NOT remain visible at the same time

#### Scenario: Comparing the two surfaces

- **WHEN** the same state is shown in the pixel window and in the terminal panel
- **THEN** both MUST offer the same views, the same fields, and the same action entry points
- **AND THEN** neither MUST omit a field the other exposes

### Requirement: The window MUST be navigated by a sidebar that identifies the active view

像素窗口 MUST 用一个常驻侧边栏承载视图切换，并 MUST 让当前视图在视觉上可识别，使用户无需记忆位置即可判断自己在哪个视图。

#### Scenario: Reading the sidebar

- **WHEN** any view is displayed
- **THEN** all four view names MUST be visible in the sidebar
- **AND THEN** the active view MUST be distinguishable from the inactive ones by more than text position alone

#### Scenario: The window is reopened

- **WHEN** a user reopens the window
- **THEN** the window MUST open on a view that exists
- **AND THEN** it MUST NOT open on an empty or unrendered view

### Requirement: Window colors MUST come from the documented theme tokens

像素窗口的每一处颜色 MUST 取自 `THEMES.md` 定义的令牌，MUST NOT 内联字面色值。暗色 MUST 为默认，且亮色 MUST 与暗色使用同一套令牌名。

#### Scenario: Rendering any surface

- **WHEN** any view is rendered
- **THEN** every color MUST resolve to a documented theme token
- **AND THEN** no literal color value MUST appear in the rendered document

#### Scenario: Switching theme in the window

- **WHEN** a user switches between light and dark in the window
- **THEN** every surface MUST re-render with the tokens of the selected theme
- **AND THEN** no surface MUST keep a value from the previous theme

### Requirement: Window text MUST follow the configured language and be switchable in-window

窗口自身的 chrome、视图名、字段标签与备注 MUST 跟随生效配置中的语言，且用户 MUST 能在窗口内切换语言而不需要离开窗口或编辑配置。

#### Scenario: Configured language

- **WHEN** the effective configuration selects a language
- **THEN** the window's view names, field labels, and notes MUST render in that language
- **AND THEN** the switch MUST take effect without editing window source

#### Scenario: Switching language in the window

- **WHEN** a user switches language inside the window
- **THEN** all visible text MUST re-render in the newly selected language
- **AND THEN** the selection MUST persist for the next open

#### Scenario: A string has no translation

- **WHEN** a window string has no entry for the selected language
- **THEN** the window MUST still render a readable fallback for that string
- **AND THEN** it MUST NOT render an empty element or crash

### Requirement: Theme and language preferences MUST persist without a first-frame flash

用户在窗口内选择的主题与语言 MUST 持久化，且窗口 MUST 在首次绘制前就应用已保存的选择，使用户 MUST NOT 看到默认主题或默认语言的一帧闪现。

#### Scenario: Reopening after a change

- **WHEN** a user changed theme or language in a previous open and reopens the window
- **THEN** the window MUST render with the previously selected theme and language
- **AND THEN** it MUST NOT first paint with the defaults

#### Scenario: Preferences are unavailable

- **WHEN** persisted preferences cannot be read
- **THEN** the window MUST fall back to the documented defaults
- **AND THEN** it MUST NOT fail to render

### Requirement: The window MUST consume the same status source as the terminal panel

像素窗口 MUST 与终端面板消费同一份状态数据，MUST NOT 成为状态来源，也 MUST NOT 在渲染过程中写入任何记忆、候选、审计或会话数据。窗口 MUST NOT 持久化 UI 专有的记忆状态。

#### Scenario: Both surfaces inspect the same status

- **WHEN** the same status is rendered in the pixel window and the terminal panel
- **THEN** both MUST show the same labels, scope, trust state, lifecycle, provenance summaries, and bounded counts
- **AND THEN** rendering either surface MUST NOT write memory bodies, candidates, audit records, or session events

#### Scenario: The status source changes

- **WHEN** the underlying status changes between two opens
- **THEN** the window MUST reflect the new status on the next open
- **AND THEN** it MUST NOT serve a value cached from a previous open

### Requirement: The window document MUST be self-contained and MUST escape every dynamic string

窗口文档 MUST 自包含，MUST NOT 发起任何外部网络请求，且 MUST 在拼接进文档之前转义每一个动态字符串。

#### Scenario: Opening the window

- **WHEN** the window document is loaded
- **THEN** it MUST render without fetching any external resource
- **AND THEN** it MUST NOT depend on a build step or a network connection

#### Scenario: A dynamic value contains markup

- **WHEN** any dynamic string contains HTML markup characters
- **THEN** the document MUST render those characters as text
- **AND THEN** they MUST NOT be interpreted as markup or script

### Requirement: The status view's charts MUST be derived from existing status data

状态视图的占用比例与按日趋势 MUST 由状态数据中已有的时间戳现算，MUST NOT 要求新增持久字段，也 MUST NOT 改变 `/xpi-memo-status` 的 JSON 输出契约。

#### Scenario: Daily counts

- **WHEN** the status view renders its trend
- **THEN** the buckets MUST be computed from the timestamps already present in the status data
- **AND THEN** the count of buckets MUST be stable regardless of how many entries exist

#### Scenario: Today's share

- **WHEN** the status view renders its occupancy indicator
- **THEN** the displayed share MUST be derived from the same status data
- **AND THEN** it MUST be bounded to a valid percentage

#### Scenario: No entries in the window

- **WHEN** the status data contains no entries for the trend window
- **THEN** the view MUST render an empty trend rather than failing
- **AND THEN** the occupancy indicator MUST show a defined value

### Requirement: The window MUST cover empty, loading, and error states

四个视图 MUST 各自表达空态、加载态与错误态，而不是在无数据时渲染空白区域或未区分的占位内容。

#### Scenario: A view has no data

- **WHEN** a view's data set is empty
- **THEN** that view MUST show an empty state that names what would appear there
- **AND THEN** it MUST NOT render an empty region indistinguishable from a loading failure

#### Scenario: A long-running operation

- **WHEN** the window performs an operation that takes noticeable time
- **THEN** it MUST show a loading state for that operation
- **AND THEN** it MUST NOT appear frozen

#### Scenario: An operation fails

- **WHEN** an operation the window initiated fails
- **THEN** the window MUST show an error state that names what failed
- **AND THEN** the rest of the window MUST stay usable

### Requirement: The window MUST be operable by keyboard alone with visible focus

像素窗口的所有交互 MUST 可仅用键盘完成，且当前聚焦的控件 MUST 有可见的焦点指示。

#### Scenario: Moving through a list

- **WHEN** a user moves through a list in the window using the keyboard
- **THEN** the focused item MUST change and MUST be visibly indicated
- **AND THEN** the focused item MUST remain inside the visible region

#### Scenario: Closing the window

- **WHEN** a user presses the documented close key
- **THEN** the window MUST close
- **AND THEN** it MUST NOT leave the session in a state requiring recovery
