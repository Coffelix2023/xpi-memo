## 1. 抽出 Glimpse 模块解析（行为不变）

- [x] 1.1 在 `src/status-panel.ts` 把 `resolveGlimpsePrompt` 拆成 `resolveGlimpseModule`（返回整个 `glimpseui` 模块或 `null`）与一个薄包装 `resolveGlimpsePrompt`（取 `mod.prompt`）。解析逻辑保持原样：先 `createRequire(import.meta.url).resolve("glimpseui")`，再回退两条已知路径。验证：`pnpm exec vitest run src/status-panel.test.ts` 全绿且**断言未改动**，证明行为等价
  验证: 10 条既有断言零改动全绿；`resolveGlimpseModule` 就位，`GlimpseModule` / `GlimpseWindow` / `GlimpseOpenFn` 三个类型按真实 `glimpse.mjs`（`GlimpseWindow extends EventEmitter`，`open()` 同步返回窗口）定型 · 2026-09-20 15:09

- [x] 1.2 为 `resolveGlimpseModule` 补单测：两条已知路径都不可用时返回 `null` 而不抛；模块存在但缺 `prompt` 时 `resolveGlimpsePrompt` 返回 `null`。验证：新增断言覆盖「全不可用」与「有模块无 prompt」两个分支，且两条分支都不断言具体路径字符串
  验证: `src/status-panel-resolve.test.ts` 3 条全绿。独立成文件是因为它要替换 `node:module` 与 `node:fs`，模块级 mock 会渗进其他 status-panel 测试。零路径字面量。「全不可用」在开发机上仍返回 null 这一事实本身证明 mock 生效——本机 `~/.pi/agent/npm/node_modules/glimpseui` 确实存在 · 2026-09-20 15:09

## 2. 主题偏好存储

- [x] 2.1 新建 `src/glimpse/prefs.ts`：读写 `<dataDir>/ui-prefs.json`，字段为 `{ theme: "dark" | "light" }`，暗色为默认。验证：单测覆盖「文件不存在 → 返回默认暗色」「写入后读回一致」「文件内容损坏 → 返回默认且不抛」三条
  验证: 8 条全绿，含损坏 JSON、非法 theme 值（`solarized`）、`{}`、`null` 四种回退 · 2026-09-20 15:10

- [x] 2.2 写入走原子路径（临时文件 + `renameSync`），对齐 `audit.json` / `candidates.json` 的既有模式。验证：单测断言写入后目标文件内容是完整 JSON，且目录内不残留临时文件
  验证: `readdirSync` 断言目录内只剩 `ui-prefs.json`；覆盖「首次写入」与「覆盖写入」两条路径，两条都不留 `.tmp`；并覆盖多级父目录自动创建 · 2026-09-20 15:10

## 3. 令牌、样式与文档骨架

- [x] 3.1 新建 `src/glimpse/tokens.ts`：`THEMES.md` 的亮/暗两套 oklch 变量，输出为两段 CSS 文本。验证：单测断言亮/暗两套的变量名集合完全一致（`light.keys.sort()` 等于 `dark.keys.sort()`），且不含任何字面 hex
  验证: 52 个令牌，亮/暗键集完全一致。**范围规则改为机械可验**：取 `:root` 与 `.dark` **共有**的变量。`--tracking-normal` / `--spacing` 只出现在 `:root`（Tailwind 专用），不在两主题契约内，已排除 · 2026-09-20 15:13

- [x] 3.2 加 `tokens.ts` 与 `THEMES.md` 的一致性测试：读取仓库根的 `THEMES.md`，解析其中的 CSS 代码块，断言变量名与取值同 `tokens.ts` 完全一致。验证：`pnpm exec vitest run` 通过；手工把 `tokens.ts` 里任一变量值改掉一位，测试必须失败（改回后恢复绿）
  验证: 7 条全绿。**变异检查已实测**：把 light `--background` 末位 `6` 改成 `7`，`matches THEMES.md light values exactly` 立刻转红；撤销后恢复绿。该测试当场抓到一处真实遗漏（`--shadow-sm` 我手抄时漏了，测试报 `shadow-sm` 缺失）· 2026-09-20 15:13

- [x] 3.3 新建 `src/glimpse/styles/base.ts`、`components.ts`、`views.ts`，从原型 `v1/index.html` 的 1027 行 CSS 按职责拆分：base 放 reset/窗口几何/排版/chrome，components 放按钮/徽标/胶囊/行/表格，views 放四个视图各自的样式。验证：`grep -nE '#[0-9a-fA-F]{3,8}\b' src/glimpse/` 零命中；三个文件各不超 300 行
  验证: **拆成 7 个文件**（非计划的 3 个）——单个 `views.ts` 会是约 480 行，超出仓库 200–300 行规范，故四个视图各成一文件。base 118 / chrome 178 / components 153 / views/{status 137, settings 152, recent 71, pending 134}，全部 ≤ 300 行。字面 hex 零命中。抽取用脚本机械切片（避免手抄错误），并做集合比对证明**丢失的 98 条声明恰好等于 tokens 块 + 原型工具栏**，零意外丢失。**丢弃原型工具栏**（`.toolbar` / `.toolbar-group` / `.tb-btn`，原型注释明写「不属于 Glimpse 窗口内容」，且 `state-toggle` 等按钮是手动演示空/加载/错误态的脚手架）；**`.kpi-*` 与 `.snapshot` 归位**到 status 视图（原型把它们错放在 components / footer 段）· 2026-09-20 15:19

- [x] 3.4 新建 `src/glimpse/text.ts`：窗口 chrome 的双语字典（视图名、KPI 标签、按钮、空/加载/错误态、info bar 段名，约 49 键）。设置字段的标签与备注**不**进本表，改由 `console.ts` 的 `panelText()` 提供。验证：单测断言 zh 与 en 键集合完全一致、无单向键、无空字符串值
  验证: 11 条全绿。**实际 39 键而非 49**：视图名（`tab.*`）与 info bar 段名（`info.*`）`PANEL_TEXT` 里已经有了，复制一份就会漂移，故改由 `glimpseText()` 兜底到 `panelText()`；本表只放窗口自有键（chrome、四个视图标题、表头、动作按钮）。
  **连带改动（计划外）**：3.4 要复用 `tab.*`/`info.*` 就得 import `panelText`，而 5.2 会让 `console.ts` import 窗口 → 成环。故把 `PANEL_TEXT` + `panelText` + `PanelLanguage` 抽成独立的 `src/panel-text.ts`（console.ts 从 1773 行降到 1327 行），`console.ts` 原处 re-export 保持既有 import 不变。**证明行为等价**：`console.test.ts` 的 76 条断言零改动全绿。另：`biome.jsonc` 的 `noSecrets` 覆盖名单原本点名 `src/console.ts`（注释直说是「面板字典的中文话术被误判」），字典搬走后已同步加入 `src/panel-text.ts` 与 `src/glimpse/text.ts` · 2026-09-20 15:24

- [x] 3.5 新建 `src/glimpse/client.ts`：页内 JS 字符串，只做边栏路由、主题切换、语言切换、键盘焦点、偏好回传（`window.glimpse.send`）、关闭（`window.glimpse.close`）。验证：单测断言生成脚本含四个视图的路由分支与两类开关的接线；并在真实开窗中手工确认四个导航项都能切页、Esc 能关窗
  验证: 12 条全绿，含 `new Function()` 语法检查（语法错＝窗口能显示但全不工作）。**客户端零文案**：所有文字由 Node 渲染，故语言切换发消息给 Node 整体重渲，并把当前视图一起带上（`view: activeView()`）以免重渲后跳回第一页。**不用 localStorage**：webview 的持久化没有文档承诺，偏好改走消息存到 Node。**不复制原型的 bug**：原型里 Esc 既清字段焦点又关窗，这里 Esc 只关窗。行为级验证（四个导航项切页、Esc 关窗）归 8.2 真机开窗 · 2026-09-20 15:28

- [x] 3.6 新建 `src/glimpse/document.ts`：组装完整文档——首帧脚本（先于 body，读注入的偏好，避免默认主题闪一帧）、两套令牌、三段样式、视图容器、`client.ts`。验证：单测断言文档含 `:root` 与 `.dark` 两套令牌、无 `http://` / `https://` 引用、首帧脚本出现在第一个视图容器之前
  验证: 15 条全绿。**首帧脚本已省去**：原型需要它是因为主题存在 localStorage；这里主题在文档被构建之前就由 Node 定好、直接烘进 `<html class>`，**结构上不存在闪帧**，没有需要抑制的默认帧。改为断言那条真正被保护的性质——主题决定早于第一个视图容器，且页内无任何主题引导脚本 · 2026-09-20 15:32

- [x] 3.7 加文档自包含性测试：断言生成文档不引用任何外部资源（无 `<link rel=stylesheet>` 指向外部、无远程 `<script src>`、无 `@import url(...)`）。验证：单测通过；该断言即 `glimpse-console-panel` spec 中「零外部网络请求」场景的证据
  验证: 4 条全绿——无外部 URL、无 `@import`、无 `<link`、无 `<script src>`、无远程 `url()`；文档只有 1 个 `<style>` 块且七段样式全部内联；全文档零字面 hex。该组断言即 spec「零外部网络请求」与「颜色必须来自主题令牌」两个场景的可执行证据 · 2026-09-20 15:32

## 4. 逐视图移植

每个视图完成后：把该视图的语义短码逐个与 HTML `id` 核对，并与原型 `v1/index.html` 的对应截图目视比对。

- [x] 4.1 新建 `src/glimpse/views/pending.ts`：待审视图——240px 候选列表（类型 + 相对时间 + 冲突徽标）+ 316px 详情（6 个字段）+ 三按钮动作组（存入 / 拒绝 / 稍后）+ 空态。动作经 `ConsoleActions.reviewCandidate`。验证：单测断言 `P1-1-L1`、`P1-1-A1`、`P1-1-A2`、`P1-1-B1`~`B3`、`P1-1-T1` 共 7 个短码全部出现在生成的 HTML `id` 上；空候选时渲染空态而非空区域
  验证: 7 短码全中；3 候选 → 3 行 + 3 详情块，默认选中第 1 个、越界索引被夹紧；六个详情字段齐全；只有报冲突的那条带 `pill-warn`；空候选时 `pane-split` 加 `hidden` 而非移除。**动作契约有真实 gap**：原型是三个直选按钮，`ConsoleActions` 只有一个会再问一遍的 `reviewCandidate`。已加可选 `reviewDecision(candidate, decision)`，并把 `index.ts` 里 store/reject/later 三个分支抽成 `applyCandidateDecision`——两条入口共用一个实现。缺该动作时回落到 `reviewCandidate`（代价是问两次） · 2026-09-20 19:42

- [x] 4.2 新建 `src/glimpse/views/recent.ts`：最近视图——6 列 CSS grid 表格 + 状态胶囊 + 空态，数据取 `status.recentEntries`。验证：单测断言 `P2-1-X1`、`P2-1-T1` 两个短码落在 `id` 上；五种状态（stored / hit / pending / rejected / degraded）各自渲染出语义色类；无条目时渲染空态
  验证: 2 短码全中；表头 + 分隔线 + 每条一行；四类语义色类全命中；空条目时表格整体 `hidden`。**未知状态不丢行**——符号退化为中性点、胶囊退化为 muted（未来新增枚举值不该让整行消失） · 2026-09-20 19:41

- [x] 4.3 新建 `src/glimpse/views/settings.ts`：设置视图——5 组手风琴（列表区独立滚动）+ 底部固定详情面板，字段来自 `ConsoleViewModel.rows`，标签与备注经 `panelText(key, language)`。验证：单测断言 `P3-1-L1`、`P3-1-B1`~`B5`、`P3-1-A1`、`P3-1-S1`~`S20` 共 27 个短码落在 `id` 上；默认仅一组展开；环境变量固定的字段呈现为不可改
  **实际按 6 组 / 37 字段实现**（用户已确认）：原型（与计划、字典）是按 20 字段 / 5 组画的，现役配置已是 37 / 6——差的 17 个字段来自 `admission-preferences` 与 embedding 两个后续变更。已批准 spec 要求「窗口不得省略对方暴露的字段」，所以跟随现役配置，字典扩到 77 短码。布局从 `SETTINGS_GROUPS` + `rows` 生成，以后新增配置字段自动出现在窗口里
  验证: 6 组头 + 37 字段行 + L1 + A1 + 两个状态区域全部命中；默认仅第 1 组展开；env 固定的字段带 `is-locked` 并显示变量名；一次性动作行带 `is-action` · 2026-09-20 19:41

- [x] 4.4 新建 `src/glimpse/views/status.ts` + `src/glimpse/charts.ts`：状态视图——4 张 KPI 卡 + 占用条 + sparkline + 可滚动 JSON 区。`charts.ts` 由 `recentEntries[].timestamp` 分 7 个日桶（桶数固定为 7），占用条为「今日条数 ÷ 窗口内单日峰值」，峰值为 0 时显示 0%。验证：单测断言 `P4-1-A1`、`P4-1-C1`~`C4`、`P4-1-U1`、`P4-1-U2`、`P4-1-A2` 共 8 个短码落在 `id` 上；`charts.ts` 单测覆盖「无条目 → 7 个零桶 + 0%」「单日峰值 → 100%」「跨日边界正确分桶」
  验证: 8 短码全中；4 卡 + 20 格占用条 + 7 柱 sparkline；桶数固定为 7（零条目也照出 7 柱）；`charts.test.ts` 15 条覆盖零桶/100%/按本地午夜分桶/窗口外条目不夹紧/未来时间戳不入桶/坏时间戳不丢弃其余。**召回行实测取自 live 状态**——原型把「嵌入 不可用」写死成字符串，这里 `embeddingAvailable=true` 时渲染「可用」且不出现「不可用」
  **一处测试自身的缺陷被修掉**：我最初用 UTC 时间戳断言分桶，而分桶按本地午夜——这在 UTC 的 CI 上会通过、在 UTC+8 本机失败。改用本地时间构造夹具 · 2026-09-20 19:42

- [x] 4.5 汇总核对：断言四页短码合计 **77** 个（非计划的 57——见 4.3 的字段集变化）、在生成文档中零缺失、零重复。短码清单作为**测试内的字面量夹具**，不读 `.pi/prototype-design/` 下的原型产物——那是设计工件，不应成为 `src/` 测试的依赖。验证：新增单测遍历短码，断言每个都在生成的 HTML 里以 `id` 出现、且 `id` 无重复；该断言即「语义 `id` 契约」的机器判据
  验证: `short-codes.test.ts` 7 条全绿，**双向断言**——每个短码恰好出现一次（75→77，含两个状态区域），且文档里没有不属于任何短码的 `id`。反向断言当场抓到两个我自造的 id（`settings-error` / `settings-loading`），已归入字典 `P3-1-T1` / `P3-1-T2`。期望总数写成字面量而非从被测代码推导——否则两边一起错时测试照样通过
  **短码是稳定标识而非视觉序号**：新增的 admission 组拿到 `P3-1-B6`（它视觉上排第 4），17 个新字段拿到 `S21`~`S37`。重编号会让所有已被引用过的码改指别的元素 · 2026-09-20 19:40

## 5. 接线 `/xpi-memo`（Glimpse 优先 + 降级）

- [x] 5.1 新建 `src/glimpse/window.ts`：用 `open(html, { width: 800, height: 600, title })` 打开窗口，`win.on("message")` 处理三类消息（切语言 → `ConsoleActions.save({language})`、切主题 → `prefs` 写入、审候选 → `ConsoleActions.reviewCandidate`），等待 `closed` 后返回。验证：单测用注入的假 `open` 断言窗口尺寸参数恰为 800×600；四页消息分发各命中对应动作
  验证: `window.test.ts` 13 条全绿——尺寸恰为 800×600、四类消息各命中对应动作、主题不进配置（`save` 未被调用）、语言变更经 `save({language})` 且用 `setHTML` 原地重渲（不关窗）、`close` 消息关窗、**畸形消息被丢弃**（跨 webview 边界按不可信输入校验：非对象、负数索引、未知 decision、未知主题/语言全部不落到动作）
  **用 `open()` 不是 `prompt()`**：后者在第一次 `window.glimpse.send()` 就解析并关窗，第一次切主题就会把窗口关掉 · 2026-09-20 20:43

- [x] 5.2 `openConsole` 加 Glimpse 优先分支：`resolveGlimpseModule()` 返回可用模块时走窗口，否则走现有 `ctx.ui.custom` 路径。验证：单测分别注入「模块可用」与「模块为 null」，断言前者不调用 `ctx.ui.custom`、后者不调用 `open`
  验证: `window.test.ts` 分别断言「模块为 null → `ctx.ui.custom` 被调用」与「`open` 抛错 → 返回 false 且不外泄」。**解析器做成可注入**（`ConsoleOpenOptions.resolveModule`）：本机装了 `glimpseui`，不可注入时任何走到默认解析器的测试都会真开窗挂死——`console.test.ts` 2 条、`index.test.ts` 1 条都中过招，后者已加文件级 `vi.mock` 强制走降级轨 · 2026-09-20 20:44

- [x] 5.3 降级完整性测试（`tui-console-panel` spec 的「终端面板必须是完整表面」场景）：在模块解析强制为 `null` 时，断言终端面板仍渲染全部四个视图，且设置字段行数与 `ConsoleViewModel.rows` 等长。验证：新增单测覆盖该场景并通过
  验证: 断言降级轨下 `ctx.ui.custom` 被调用一次、面板渲染出全部四个视图名，且两表面取自同一份 `settingsItems(config, env)`（37 行）。`views.test.ts` 已钉住窗口「每条 row 渲染一行」，这里钉住行数等于现役配置 · 2026-09-20 20:44

- [x] 5.4 窗口调用抛错时回退到终端面板，且不把异常抛给调用方。验证：单测注入一个 `open` 即抛的假模块，断言最终渲染出终端面板且调用方未收到异常
  验证: 两条——`open` 即抛 → `openGlimpsePanel` 返回 `false` 不抛；消息处理中的动作抛错 → 窗口消息循环不被拆掉（`close` 未被调用），且面板仍能正常关闭 · 2026-09-20 20:43

## 6. 迁移 `/xpi-memo-status`

- [x] 6.1 `openStatusPanel` 改为打开共享窗口并落在状态视图；`renderStatusPanelLines()` 与其几何常量（`PANEL_WIDTH` / `PANEL_HEIGHT` / `CHROME_ROWS`）保持不动。验证：单测断言有 Glimpse 时打开窗口且初始视图为状态页；无 Glimpse 时仍走原有 TUI 渲染路径，且既有几何断言未改动
  **形态经用户确认**：`/xpi-memo-status` 命令体也构造 runtime，好让窗口四页全满（原先只有状态 JSON，拿不到 config 与候选列表）。窗口调用落在命令体（`initialView: "status"`），`openStatusPanel` 退回纯 TUI 降级并去掉 `glimpsePromptOverride` 参数
  验证: 降级测试只剩 2 参数且几何断言（`anchor: center`、`width: 78`、`margin.bottom: 4`、`maxHeight: 70%`）零改动；窗口侧由 `window.test.ts` 覆盖。**顺带消除一处重复**：`/xpi-memo` 与 `/xpi-memo-status` 现在共用一个 `consoleActionsFor(ctx, runtime, dependencies)` 工厂，否则 store/reject 分支会在两个命令里各有一份
  **`openConsole` 签名变化**：最后两个参数并成 `ConsoleOpenOptions`（`{ actions, resolveModule? }`），既保持 6 个参数不触发 `useMaxParams`，也让测试可强制降级轨 · 2026-09-20 20:46
  **⚠ 本任务随后被取代（2026-09-20 21:0x，用户决定）**：上面「`/xpi-memo-status` 命令体也建 runtime，窗口四页全满」这一形态**已作废**。用户判断该命令使用概率极低，复核后发现它承载两件事且寿命不同——① 打开退役面板（已被 `/xpi-memo` 的状态页取代）② 非 TUI 打印状态 JSON（**仍唯一**：无 `xpi_memo_status` 工具，且 `/xpi-memo` 在非 TUI 模式明确委托给它）。最终裁定：**命令留下只做 JSON，TUI 那半整个删掉**。
  实际结局：`src/status-panel.ts`（210 行）与 `src/status-panel.test.ts`（190 行）整体删除，`status-panel-resolve.test.ts` 移到 `src/glimpse/module.test.ts`（被测对象早已在 `glimpse/module.ts`）；命令体不再构造 runtime；`README.md` / `README.zh-CN.md` 里「TUI 可滚动面板」的描述改为「任意模式下打印 JSON」。净删约 400 行，门禁全绿（1025 passed / 8 skipped）· 2026-09-20 21:10

- [x] 6.2 删除 `buildGlimpseHtml` 及其专属测试。验证：`grep -rn "buildGlimpseHtml" src/` 零命中；`grep -nE '#[0-9a-fA-F]{3,8}\b' src/status-panel.ts` 零命中（该文件不再含任何字面色值）
  验证: `buildGlimpseHtml` 与 `escapeHtml` 均已删除，`src/status-panel.ts` 从 394 行降到 212 行且**零字面色值**——`#0d1117` / `#58a6ff` / `#161b22` / `#30363d` 这组 GitHub-dark 硬编码全部消失（窗口的配色现在只走 `THEMES.md`）。仅剩 3 处注释提到这个名字，已改写为「已退役」以免指向不存在的符号；`status-panel.test.ts` 同步删掉 escapeHtml 与 buildGlimpseHtml 两条，以及那条测 Glimpse 路径的用例（该路径已上移到命令体，由 `window.test.ts` 覆盖） · 2026-09-20 20:47

## 7. 文档

- [x] 7.1 改写 `TUI-DESIGN.md` §2.A：删掉内联的 `background` / `textPrimary` / `accent` / `successBadgeBg` / `successBadgeText`，改为指向 `THEMES.md`；保留 `width` / `height` / `title` / `frameless`。验证：`grep -nE '#[0-9a-fA-F]{3,8}\b' TUI-DESIGN.md` 在 §2.A 段落零命中；§2.B 的 TUI 令牌、§3 分层结构、§4 Do's & Don'ts 段落内容未变
  验证: 五个色值已删，改为注释指向 `<项目根>/THEMES.md`（并说明运行期副本在 `src/glimpse/tokens.ts`、由 `tokens.test.ts` 断言与 THEMES.md 一致）；`width` / `height` / `frameless` 保留。**全文零 hex**（不只 §2.A）。`title` 由 `"XpiMemo Status Inspector"` 改为 `"XpiMemo T1 Console"`——与 `window.ts` 的 `WINDOW_TITLE` 及 `WINDOW_WIDTH/HEIGHT` 一致，旧标题正是「窗口只服务状态页」时期的遗留。§2.B / §3 / §4 未动。另记一处既存事实：THEMES.md 无 success / warning 语义色，窗口复用 muted 与 accent，已在文档里写明——要真绿真黄先扩展 THEMES.md · 2026-09-20 20:48

## 8. 端到端验证

- [x] 8.1 三条质量门全绿：`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`。验证：三条命令各自退出码为 0，输出无 error 级问题
  验证: `typecheck` 退出 0；`lint` 退出 0（`Checked 208 files`，仅 1 条 info）；`test` 1026 passed / 8 skipped，94 个文件通过。唯一 info 是 `src/index.ts:666` 的 `useMaxParams`（`runOfflineExtractionForLifecycle` 7 参数）——**用 `git stash` 剥离本次变更后复跑确认它在 HEAD 上同样存在**，与本变更无关。
  清理：三个一次性验证脚本（`__smoke` / `__generate-docs` / `__contract`）跑完即删，门禁在**删除后**复跑，故 208 文件而非 210。 · 2026-09-20 22:20

- [x] 8.2 真实开窗目视核对：四个视图 × 亮/暗 × 中/英，共 16 种组合下窗口尺寸为 800×600、无内容溢出窗口、无滚动条（状态页 JSON 区除外）。验证：逐组合截图核对；窗口 `getBoundingClientRect` 实测 800×600，`app-body` 与内容区高度均为 500
  验证: **真机开窗，不是浏览器 iframe**。16 组合逐一 `glimpseui.open()` 开窗（800×600），页内探针经 `window.glimpse.send` 回传实测值：`.window` 矩形 = 800×600、`documentElement.scrollWidth/Height` = 800×600（无页面级滚动条）、`.app-body` 高度 = 500、越出 `.window` 边界的游离元素 = 0（`.snapshot` 与 `.settings-scroll` 的后代按设计豁免，它们本就该内部滚动）。**16/16 PASS**。
  截图：`open()` 的 x/y 定位 + 运行期 `System Events` 查真实窗口边界 + `screencapture -R` 逐组合截内容区（跳过标题栏 32pt），16 张落在 `/tmp/glimpse-shots/`。目视核对 6 张跨视图/主题/语言：待审（暗·中）、待审（亮·中）、设置（亮·英）、状态（暗·中）、状态（亮·中）、最近（暗·英）——四视图双主题双语渲染正确，无内容裁切或溢出。
  坑记：首版截图截到的是用户别的应用——`screencapture -R` 用的是屏幕坐标，而 Glimpse 窗口位置由 host 决定（含副屏负坐标），必须实时查询真实边界再截。 · 2026-09-20 22:15

- [x] 8.3 契约核对：生成的文档零字面 hex、零外部请求；窗口内切语言后终端面板下次打开说同一种语言；窗口内切主题后重开仍是上次选的主题且无首帧闪现。验证：分别手工执行三项，前两项以生成文档的静态扫描为准，第三项以重开窗口的观感为准
  验证: **① 静态扫描**（16 份文档）：字面 hex 零命中、外部 URL 零命中、`<link>` / `<script src>` / `@import` / `url(` 全部零命中。唯一被 `#[0-9a-f]{3,8}` 命中的 64 处是英文文案里的 HTML 实体 `&#039;`（撇号）——剥掉实体后重扫确认零颜色字面值；中文文档不命中正是因为中文无撇号，不是主题差异。
  **②③ 真机契约**：开真窗点击真实开关，实测从 webview 回来的消息——切主题回 `{type:"theme", value:"light"}`，切语言回 `{type:"language", value:"en", view:"settings"}`（先导航到设置再切，证明当前视图确实随消息带走）。偏好经真实的 `savePanelPreferences` 落盘后重开：首帧探针 `documentElement.className` 已是 `""`（亮色），**不存在暗色首帧**。
  **顺带修掉一个真 bug**：`setHTML` 会把 `location.hash` 重置为空（实测：设 `#/settings` → 换文档后回 `""`），而 client 的 `pageFromHash()` 在空 hash 时回退 `"#/pending"`，于是新文档里 server 端烘好的 `initialView` 被路由覆盖回第一页——切语言重渲时会跳回「待审」，正是 3.5 想防但没防住的那件事。已改为空 hash 时尊重 server 标记的 `.is-active`，并由 `client.test.ts` 一条新断言钉住。 · 2026-09-20 22:18
