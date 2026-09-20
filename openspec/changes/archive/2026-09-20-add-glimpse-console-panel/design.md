## Context

动机见 `proposal.md`；行为契约见 `specs/glimpse-console-panel/spec.md` 与 `specs/tui-console-panel/spec.md`。这里只记录塑造实现路径的现状与约束。

**入口与接线**（`src/index.ts`）：

- `/xpi-memo`（第 2592 行）→ `openConsole(ctx, status, config, env, pending, actions)`。
- `/xpi-memo-status`（第 2680 行）→ `openStatusPanel(ctx, json)`。

**两个既有契约对象**（`src/console.ts`）：

- `ConsoleViewModel` 已经携带四个视图的全部数据：`env`、`language`、`pending`、`rows`（设置字段行）、`status`、`statusJson`。它是 TUI 面板渲染用的同一份对象。
- `ConsoleActions` 已经携带四个视图的全部动作：`confirm`、`reviewCandidate`、`save`、`sleep`。

**现役 Glimpse 实现**（`src/status-panel.ts`，509 行）：

- `buildGlimpseHtml(json, summary)` 用模板字符串拼出一页 HTML，硬编码 GitHub-dark hex（`#0d1117` / `#c9d1d9` / `#58a6ff` / `#161b22` / `#30363d`），与 `THEMES.md` 的 oklch 体系冲突。
- `resolveGlimpsePrompt()` 用 `createRequire` + 两条已知路径解析 `glimpseui`，只取 `prompt`。
- `openStatusPanel` 走 `promptFn(html, {height: 600, title, width: 800})` 并**忽略返回值**——一次性展示，不是交互面板。
- `renderStatusPanelLines()` 是状态页的 TUI 降级渲染，与几何常量（`PANEL_WIDTH = 78`、`PANEL_HEIGHT = 20`、`CHROME_ROWS = 9`）一并保留。

**Glimpse 运行时能力**（`glimpseui` skill）：

- `prompt(html, opts)` 一次性：第一次 `window.glimpse.send(data)` 即解析并关闭。
- `open(html, opts)` 持久窗口：`win.on('message')` 接收 `window.glimpse.send(data)`，`win.send(js)` 反向求值，`window.glimpse.close()` 由页内关闭。
- `win.on('ready', info)` 提供 `info.appearance.darkMode` / `reduceMotion`。
- **无**文档化的 Node 侧偏好存储 API。

**原型**（`.pi/prototype-design/glimpse-console-panel/hifi/v1/index.html`，2223 行）：11 行首帧脚本 + 1027 行 CSS + 168 行静态 HTML + 1002 行页内 JS。它已验证：800×600 零溢出、四页信息架构、`THEMES.md` 令牌合规、暗/亮与中/英切换、空/加载/错误三态、57 个语义短码全部落在 HTML `id` 上。

**约束**：无构建步骤（Pi 直接加载 `src/index.ts`）；TypeScript strict；单文件单一职责，不超 200–300 行；改动必须过 `pnpm typecheck` / `pnpm -w run lint` / `pnpm exec vitest run src/`。

## Goals / Non-Goals

**Goals:**

- 让 `/xpi-memo` 的像素窗口与终端面板**共用同一份数据与同一批动作**，而不是各自装配。
- 让 `THEMES.md` 成为颜色的唯一来源，且这个约束**可被测试强制执行**，不靠约定。
- 把 2223 行原型拆成符合仓库规模规范的模块，每块单一职责。
- 让降级路径可被测试证明完整，而不是靠人工检查。

**Non-Goals:**

- 不改 TUI 面板的信息架构、几何预算、光标模型或语言行为。
- 不新增 Glimpse 依赖；`glimpseui` 保持可选 peer。
- 不改 `/xpi-memo-status` 的 JSON 输出契约，不改 `MemoryStatus` / `ObservabilitySnapshot` 的字段。
- 不让终端面板跟随窗口的主题（终端主题由 Pi 决定，不是本变更的职责）。
- 不把原型的演示数据带进实现。

## Decisions

### D1. 窗口消费 `ConsoleViewModel` 与 `ConsoleActions`，不新建视图模型

`ConsoleViewModel` 的六个字段恰好覆盖四个视图：`pending` → 待审，`status.recentEntries` → 最近，`rows` + `language` + `env` → 设置，`status` + `statusJson` → 状态。`ConsoleActions` 的四个动作恰好覆盖窗口内全部操作。

**理由**：这是「同一状态来源」与「同字段、同操作」两条 spec 要求的**结构性**满足——只要两边都从这一个对象渲染，就不可能出现字段缺失。同时零新增装配代码。

**替代方案**：为 Glimpse 建独立的 `GlimpseViewModel`。否决——多一条装配路径，就有第二处会漂移，且要重写一遍字段派生逻辑。

### D2. 设置字段的标签与备注复用 `console.ts` 的 `panelText()`，新字典只放窗口 chrome

`PANEL_TEXT` 已含设置字段的双语标签与备注，是那部分文案的唯一来源。

**理由**：字段文案共 160 余键，复制一份必然漂移；复用后「设置视图字段与终端面板一致」由代码结构保证。新字典只需约 49 个键（视图名、KPI 标签、按钮、空/加载/错误态、info bar 段名）。

**替代方案**：窗口自带完整双语表。否决——160 键的重复表，且与 `tui-console-panel` 的「字段备注必须解释后果」要求形成两份可分歧的实现。

### D3. 四个视图由 Node 侧渲染成静态 HTML，页内 JS 只做路由与开关

页内脚本只负责：边栏路由、主题切换、语言切换、键盘焦点、偏好回传、关闭。视图内容全部在构建期生成。

**理由**：原型第 1.10 轮已证明——JS 生成的 `id` 不在 HTML 源码里，字典短码就 grep 不到，57 个短码里有 29 个因此落空。改成静态后 57/57 命中。这个约束在实现里同样成立，且语义 `id` 是窗口与字典之间的可核对契约。

**替代方案**：把原型 HTML 当静态资源随包发布，客户端从内嵌 JSON 渲染。否决——破坏语义 `id` 契约（同上），且仍需把完整 status 载荷序列化进去，没有省下任何东西。

### D4. 语言复用 `config.language`；主题走 UI 作用域的小状态文件

窗口内的语言切换通过既有的 `ConsoleActions.save({language})` 写回配置；主题写入 `<dataDir>/ui-prefs.json`（原子写：临时文件 + rename，与 `audit.json` / `candidates.json` 同一模式），构建期读出并注入。

**理由**：`config.language` 已经是生效配置里的既有字段，且 TUI 面板已经消费它——复用它意味着「跟随生效配置语言」这条要求**绝对成立**、两个表面自动同步、零新增存储。主题是纯外观偏好，配置里没有对应字段。

**替代方案 A**：把 `theme` 加进 `XpiMemoConfig`。否决——`tui-console-panel` 已有「每一个生效配置字段都必须能在面板里看到当前值」的要求，加字段就会**强制**终端面板新增一行设置项，并为一项纯外观偏好引入环境变量与配置 schema 改动。为一个主题开关付这个代价不划算。

**替代方案 B**：页内 `localStorage`。否决——能否跨窗口存活取决于 Glimpse 的 webview 是否使用非临时数据存储，这一点未在文档中承诺；且从 Node 侧无法测试。

**已知副作用**：窗口内切语言会改全局配置，与终端面板的设置项同效。这是有意为之（两个表面必须说同一种语言），在实现中需注释说明。

### D5. 交互窗口用 `open()` + `on('message')`，不用 `prompt()`

面板要在一次会话里连续做多件事（切视图、切主题、审候选、改设置）。`prompt()` 在第一次 `window.glimpse.send()` 就解析并关窗，第一次点开关就会把窗口关掉。

**理由**：`open()` 提供 `on('message')` 的持续通道与 `win.send(js)` 的反向求值，`window.glimpse.close()` 负责收尾。交互模型与终端面板一致（模态：`/xpi-memo` 等待窗口关闭再返回），也与现役 `openStatusPanel` 等待 `prompt` 返回一致。

**替代方案**：`prompt()` 配 `autoClose`。否决——无法支持多步交互。

**连带影响**：`resolveGlimpsePrompt()` 要泛化为「解析整个 `glimpseui` 模块」，由调用方各取 `prompt` 或 `open`。解析逻辑（`createRequire` + 两条已知路径）抽成一个函数，行为不变。

### D6. 模块拆分：`src/glimpse/`

2223 行原型不能落成一个 TS 文件。按职责切：

| 文件 | 职责 | 计划 | 实际 |
| :--- | :--- | :--- | :--- |
| `tokens.ts` | `THEMES.md` 两主题块共有的 oklch 变量 | ~90 | 152 |
| `styles/base.ts` | 刻度变量、reset、路由、窗口外壳 | ~200 | 118 |
| `styles/chrome.ts` | header、sidebar、footer（常驻部分） | — | 178 |
| `styles/components.ts` | 按钮、徽标、胶囊、语义色、空/加载/错误态 | ~250 | 153 |
| `styles/views/{status,settings,recent,pending}.ts` | 四个视图各自的样式 | ~300 | 137 / 152 / 71 / 134 |
| `text.ts` | 窗口自有双语键（39 键），其余兜底到 `panel-text.ts` | ~120 | 135 |
| `charts.ts` | 由 `recentEntries[].timestamp` 算 7 日分桶与今日占比 | ~60 | — |
| `prefs.ts` | 读写 `<dataDir>/ui-prefs.json`（原子写） | ~50 | 88 |
| `views/pending.ts` | 待审视图 HTML | ~140 | — |
| `views/recent.ts` | 最近视图 HTML | ~90 | — |
| `views/settings.ts` | 设置视图 HTML | ~130 | — |
| `views/status.ts` | 状态视图 HTML | ~120 | — |
| `client.ts` | 页内 JS（路由、开关、键盘、回传、关闭） | ~150 | 247 |
| `document.ts` | 组装文档（tokens + styles + 视图容器 + client） | ~70 | 134 |
| `window.ts` | `open()` 调用、消息循环、降级 | ~130 | — |
| `panel-text.ts` | **计划外**：`PANEL_TEXT` + `panelText` 从 `console.ts` 抽出，供两个表面共用 | — | 460 |

（“—” 表示该文件尚未落地。`charts.ts` 与 `views/*.ts` 属任务 4.x，`window.ts` 属任务 5.x。）

**落地后的两处修正**：

1. **样式拆成 7 个文件而非 3 个**：单个 `styles/views.ts` 实际是约 480 行，超出仓库 200–300 行规范，而该规范正是本节拆分的依据，所以四个视图各成一文件。
2. **多出 `panel-text.ts`**：D2 要求设置字段文案复用 `panelText()`，而 D1/任务 5.2 让 `console.ts` 依赖窗口——两条合起来会成环。把文案表抽成无依赖模块同时解决成环、让“一个字符串一个来源”结构性成立，并把 `console.ts` 从 1773 行降到 1327 行。`console.ts` 原处 re-export，既有调用方零改动。

**理由**：仓库规范要求单文件单一职责、超 200–300 行优先拆分、3 个以上不相关导出即拆。上表每块都是一个职责。

**替代方案**：单文件 `glimpse-panel.ts`。否决——约 1900 行，直接违反规模规范，且 CSS 与视图 HTML 混在一处后无法单独审阅。

### D7. `tokens.ts` 与 `THEMES.md` 的一致性由测试强制

`tokens.ts` 是运行期常量（不解析 Markdown 文档——扩展运行时不应依赖仓库文档存在）。同时新增一个单测：读取 `THEMES.md`，解析其中 CSS 代码块，断言亮/暗两套变量名与取值与 `tokens.ts` **完全一致**。

**理由**：这是「颜色必须来自 `THEMES.md`」这条 spec 要求的唯一可执行证据。没有它，`tokens.ts` 就是第二份真相，只是挪了个位置。

**替代方案**：运行期解析 `THEMES.md`。否决——文档不一定随扩展发布，且把一次文件 IO 与解析放进每次开窗路径。

### D8. 图表由现有时间戳现算

7 个日桶由 `recentEntries[].timestamp` 分桶得出，桶数固定为 7，与条目数无关。占用条显示**今日条数 ÷ 窗口内单日峰值**，峰值取 0 时显示 0%。

**理由**：spec 要求不新增持久字段、不改 `/xpi-memo-status` 契约。除以单日峰值不需要引入「每日预算」这类凭空的常量，且天然落在 0–100%。

**替代方案**：除以一个固定日上限。否决——那个上限从哪来没有依据，会变成一个没人知道含义的魔数。

### D9. `status-panel.ts` 的 `buildGlimpseHtml` 退役，TUI 降级渲染保留

`openStatusPanel` 改为打开同一个窗口并落在状态视图；`renderStatusPanelLines()` 与其几何常量不动。

**理由**：`buildGlimpseHtml` 是代码内唯一的 hex 来源。留两个窗口实现就留了两套颜色。状态页的终端渲染仍是 `/xpi-memo-status` 在无 Glimpse 时的降级，必须保留。

### D10. `TUI-DESIGN.md` §2.A 改为引用 `THEMES.md`

删掉 §2.A 内联的 `background` / `textPrimary` / `accent` / `successBadgeBg` / `successBadgeText` 色值，改为指向 `THEMES.md`。`window` 的 `width` / `height` / `title` / `frameless` 保留。§2.B 的 TUI 令牌、§3 的分层结构、§4 的 Do's & Don'ts 不动。

**理由**：`proposal.md` 指出的双 SSOT 就在这里。文档里留着 hex，下一个人仍会照它写新代码——这正是本轮要消除的失效模式。

## Risks / Trade-offs

- **原型到 TS 模块的移植会丢保真度** → 逐视图移植，每个视图完成后与原型截图比对；同时以 57 个语义短码是否全部落在 `id` 上作为机器可查的判据。视图 HTML 的静态性（D3）就是为这个判据服务的。

- **主路径从此依赖一个可选 peer** → 降级不是兜底而是契约：新增测试把模块解析强制为 `null`，断言终端面板仍渲染全部四个视图且字段齐全。`resolveGlimpseModule` 抛错与返回 `null` 走同一分支。

- **`open()` 让窗口在 Pi 的 TUI 之外长期存活，两个输入表面可能竞争** → 窗口是模态的：`/xpi-memo` 等待窗口关闭才返回，与终端面板和现役 `openStatusPanel` 一致。Esc 与 Close 按钮都走 `window.glimpse.close()`。

- **页内切语言会写全局配置，是超出「纯外观」的副作用** → 有意为之，理由见 D4；在实现处加注释说明，并在 spec 里已明确「终端面板对生效配置语言的服从不受窗口切换影响」。

- **`--font-sans`（Inter）在 webview 里可能不存在** → 字体栈必须带回退（`Inter, system-ui, -apple-system, sans-serif`）；等宽栈同理。这不改变令牌合规性（字体不是颜色），但影响真实观感，需在实现后目视核对。

- **CSP / 无网络环境下 webview 行为差异** → 文档自包含、零外部请求（spec 已要求），因此不依赖任何远程资源；`prefers-reduced-motion` 用 CSS 媒体查询而非运行时探测。

- **今日占比在全新安装上接近 0，看起来像坏了** → 空态与 0% 都按 spec 定义为「已定义的值」而非错误；状态视图同时保留 KPI 卡与 JSON 区，图表不是唯一信息通道。

## Migration Plan

分步落地，每步独立可回滚；唯一非增量步骤（删除 `buildGlimpseHtml`）排在共享窗口被验证之后。

1. **抽出模块解析**：`resolveGlimpsePrompt` 泛化为 `resolveGlimpseModule`，调用方各取所需。行为不变，测试不变。
2. **主题偏好存储**：`prefs.ts` + `<dataDir>/ui-prefs.json`，含原子写与读失败回退默认。
3. **无视图骨架**：`tokens.ts` / `styles/*` / `text.ts` / `client.ts` / `document.ts`，先出空壳窗口。加 `tokens` 与 `THEMES.md` 的一致性测试。
4. **逐视图移植**：待审 → 最近 → 设置 → 状态。每页完成即比对截图 + 核对短码，每页单独提交。
5. **接线 `/xpi-memo`**：`openConsole` 加 Glimpse 优先分支，失败回退现有 TUI 路径。加降级完整性测试。
6. **迁移 `/xpi-memo-status`**：改指共享窗口的状态视图，删除 `buildGlimpseHtml` 及其测试。
7. **文档**：`TUI-DESIGN.md` §2.A 改写为引用 `THEMES.md`。

**回滚**：第 1–5 步是纯增量，`git revert` 单步即回到上一状态。第 6 步是唯一删除性改动，且 `renderStatusPanelLines` 与其几何常量不删，因此回滚只恢复一个 HTML 构建函数。第 7 步是文档，独立可回滚。

## Open Questions

1. **终端面板是否也要跟随主题** —— 当前非目标（终端主题由 Pi 决定）。若将来要让两边一致，需要把 `ui-prefs.json` 的读取提到面板入口；不影响本变更的 spec、做法或任务拆分。
2. **偏好文件是否值得升格为配置字段** —— 若将来出现第二个消费主题的表面，D4 的取舍需要重估。届时 `tui-console-panel` 的字段完整性要求会一并生效，属于另一个变更的范围。
3. **窗口是否需要「记住上次视图」** —— spec 只要求「打开在一个存在的视图上」，不要求记忆。若要记忆，复用 `ui-prefs.json` 加一个键即可，不改变现有契约。
