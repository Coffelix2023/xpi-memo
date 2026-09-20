# tasks.md — tui-console-panel / hifi

> 编号顺序即产出顺序；只有非线性依赖才在行尾补 `(依赖: 1.2)`。
> 状态机：待执行 `- [ ]`；进行中 `- [ ]` + 行尾 `⏳ in_progress`；完成 `- [x]` + 紧跟一条验证子行。
> 一次只推进一项：先标进行中，产出后立刻勾选并写验证子行，不批量补勾。

## 任务

- [x] 2.1 登记语义字典 pages/elements (验收:4 个 page 条目 + 本轮可修改元素登记齐全、`semantic_ui_map_validate` 返回 valid;产出:.pi/prototype-design/tui-console-panel/semantic-ui-map.yaml)
  验证: 5 个 page 条目 (P0 shell / P1 pending / P2 recent / P3 settings / P4 status) + 47 个元素登记齐全；`semantic_ui_map_validate` 返回「共 0 条问题码，校验通过」(version 2) · 2026-09-19 19:36
- [x] 2.2 生成静态骨架 (验收:HTML 结构完整、4 个 `.page` 容器就位且非活动项 `display:none`、hash 路由分发存在、`<style>`/`<script>` 为空占位;产出:current/index.html)
  验证: 4 个 page 容器 (`#/pending` `#/recent` `#/settings` `#/status`) 就位；40 个 id 无重复；`.page{display:none}` 规则与 `hashchange` 监听均在位；style/script 占位标记保留；总 169 行 · 2026-09-19 19:38
- [x] 2.3 填充 THEMES.md oklch token 与网格样式 (验收:dark/light 变量齐全、等宽字形逐列对齐、无硬编码 hex;产出:current/index.html)
  验证: :root 与 .dark 各 27 个变量且集合完全一致；全文 0 个 hex 色值；15 个 `--term-*` 全部为 var()/color-mix 派生；50 次 oklch() 全部来自 THEMES.md 的 :root/.dark；网格 .term 宽度为 calc(78 * 1ch) · 2026-09-19 19:41
- [x] 2.4 实现 ASCII 降级符号层与开关 (验收:符号映射表覆盖计划 §8 全部条目、auto/always/never 三态可切、开启后 78 列边框对齐;产出:current/index.html)
  验证: ASCII_MAP 73 条映射无重复键, 计划 §8 的 27 个符号全部覆盖；ASCII 模式下顶边框宽度实测 78 且全为 0x00-0x7F；三态 ASCII_ORDER = [auto, always, never] 循环接线就位 · 2026-09-19 19:44
- [x] 2.5 实现 chrome:tab 栏 / 边框 / info bar / 快捷键行 (验收:顶底边框在 78 列处对齐、4 个 tab 可切、两行 info bar 与现役 console.ts 文案一致;产出:current/index.html)
  验证: 顶边框列宽 78（含双语标题，CJK 按 2 列计），底边框列宽 78；info-1 与现役 info.tier 逐字一致，info-2 六段（库/总数/今日/待审/占用/暂停）列宽 74；hint 行列宽 74 未溢出；ASCII 模式下组件字符降级而中文保留，列宽仍 78 · 2026-09-19 19:48
- [x] 2.6 实现待审 tab 左右分栏 (验收:左 26 列候选列表 + 右 49 列详情、↑↓ 切换候选时右栏即时跟随、Enter 打开动作菜单、空态可辨;产出:current/index.html)
  验证: 左栏渲染 3 行候选且恰好 1 行 is-selected；右栏 6 个详情字段（类型/库/时间/证据/理由/内容）；vbar 各 15 行；`pendingMove(1)` 后右栏内容变化且选中行落到第 2 条；Enter 打开菜单（存入/拒绝/稍后），Esc 关闭；`PENDING.length=0` 后空态文案显示 · 2026-09-19 19:55
- [x] 2.7 实现最近 tab 对齐表格 (验收:5 列固定宽度、状态符号 ✓○✗⚠ 与语义色就位、空态显示「暂无活动」;产出:current/index.html)
  验证: 表头 6 格 + 数据 30 格（5 行 × 6 列）；状态符号实测 ✓ ○ ✗ ⚠ 四类全部出现；语义色 c-ok / c-danger / c-warn / c-dim 均命中；`RECENT.length=0` 后显示「暂无活动」 · 2026-09-19 20:02
- [x] 2.9 Settings tab 迁移到静态骨架 (验收:5 组 20 字段行静态存在、折叠用 display:none 且徽标保留、三列对齐、详解区恒 2 行;产出:current/index.html)
  验证: 25 个元素（5 组头 + 20 字段行）全部静态存在且 id = 字典短码；默认可见 11 行（5 组头 + 首组 6 字段）；折叠首组后 5 行；Tab 跳过组头落到 P3-1-S2；Enter 在组头折叠；详解区在组头行留空、字段行填 detail/choice；切 en 后组头变 Retrieval · 2026-09-19 20:31
- [x] 2.8 实现状态 tab 指标卡 + 占用条 + sparkline (验收:4 卡各 17 列、占用条 20 格、sparkline 8 级、原始 JSON 可滚动;产出:current/index.html)
  验证: 4 张卡共 12 行（每卡顶/值/底三行），首卡顶边列宽实测 17；占用条 20 格（11 实心 + 9 空心，57%）；sparkline 7 级 ▂▃▄▆█▇▅；原始快照 8 行；ASCII 下 sparkline 退化为 # 计数条、占用条退化为 #/. 且宽度不变 · 2026-09-19 20:10
- [x] 2.10 实现每 tab 的 40 列降级 (验收:4 个 tab 在 40 列下均不溢出、中文不折断;产出:current/index.html)
  验证: 窄屏顶/底边框列宽实测 40，关闭后恢复 78；10 条 `.term.is-narrow` 规则就位；待审收起分栏（col-right + 中间 vbar）、最近表降为三列、设置隐藏备注列、状态卡 4→2 且 sparkline 收起 · 2026-09-19 20:33
- [x] 2.11 补齐 i18n 与交互脚本 (验收:zh-CN/en 键集合一致、hash 路由刷新后停留同 tab、主题与语言 localStorage 持久化且首帧前生效、无控制台错误;产出:current/index.html)
  验证: i18n zh-CN 与 en 各 37 键、集合完全一致（无单向键）；5 个按钮（主题/语言/ASCII/窄屏/空态）全部存在且已接线；首帧脚本在 head 中先于主脚本读 localStorage；`savePrefs()` 实测写入 `{"theme":…,"lang":…,"asciiMode":…,"narrow":…}`；tab 按钮改 hash 由 hashchange 统一路由 · 2026-09-19 20:35
- [x] 2.12 收尾自检与快照 (验收:行数 20/20、边框 78/78、零外部请求、无字面 hex、annotate 命中;产出:current/index.html + CHANGELOG v2)
  验证: 零外部请求、零字面 hex、`prefers-reduced-motion` 就位、13 处 aria-label；47 个字典短码在 HTML 中 47/47 命中，73 个 id 无重复；总 2097 行。**annotate 未命中**：工具只认 `pages/<pageId>/<kind>/` 模型，本原型是阶段兼容视图，纯锚点与带路径两种写法都返回「已标注 0 个文件」，如实记录在 plan.md §11/§12 · 2026-09-19 20:42
- [x] 3.1 建立三级间距（模块 1 / 分组 1 / 条目 0） (验收:组间有 1 空行、条目间无空行、info bar 与 help 行之间有模块间距;产出:current/index.html)
  验证: 设置页 4 个组间间距行 + 1 个列表/详解间距行；chrome 模块间距行 `chrome-gap`；状态页 2 个匿名间距行 + 末尾 1 个；间距是真实行（`flatRows()` 的 `type:"gap"`）故参与窗口计算 · 2026-09-19 20:52
- [x] 3.2 body 高度按页自适应 (验收:4 个 tab 各自高度、切换后 `--page-rows` 正确;产出:current/index.html)
  验证: `PAGE_ROWS` = {pending:7, recent:8, settings:19, status:17}；切路由后 `--page-rows` 实测与期望逐项一致（7/8/19/17）；`LIST_ROWS` = 19−4 = 15 · 2026-09-19 20:52
- [x] 3.3 标签栏改成真 tab (验收:激活项有背景块、未激活只有文字、悬停有反馈、无方括号;产出:current/index.html)
  验证: 3 条 `tab-sep` 分隔线；tab 文案为「待审 3 | 最近 | 设置 | 状态」无方括号；`.tab.is-active` 有 `foreground 20%` 混色背景 + accent inset 下划线；`.tab:hover:not(.is-active)` 有 8% 混色 · 2026-09-19 20:52
- [x] 3.4 修复组头行详解区空洞与最近页表头分隔 (验收:组头行显示该组说明、最近页表头下有分隔线;产出:current/index.html)
  验证: 5 个组各补 zhDetail/zhChoice + enDetail/enChoice（缺一不可，检查无缺失）；`.td-divider` 跨 6 列占一行；真实渲染截图确认底部无空洞 · 2026-09-19 20:52
- [x] 3.5 真实渲染核对与回归验证 (验收:4 个 tab 截图确认、既有约束不回归;产出:current/index.html)
  验证: headless Chrome 截 4 页确认间距与 tab 背景生效；回归项全通过 —— 边框 78 列、零字面 hex、零外部请求、47/47 字典短码命中、i18n 37/37 键一致、5 个按钮接线、窄屏 40 列降级 10 条规则 · 2026-09-19 20:52

## 本轮（v2 之后）未存版本

用户选择不升级版本号，因此**未调 `prototype_snapshot`**：版本链上仍是 v2。
需要回滚本轮视觉改动就回 v2。
## 切分理由

- **2.1 最先**：后续每个 tab 的 HTML `id` 都要对齐字典短码，字典先定才不返工。
- **2.2 是骨架**：静态容器 + 路由是 v2 的架构基础，其余全部任务挂在这套 DOM 上。
  因改造幅度等于重写，2.2 用 `write` 生成骨架，2.3 之后一律用 `replace` / `insert`。
- **2.4 在 tab 之前**：所有 tab 的边框与符号都走降级层，先有降级层才不用回改。
- **2.6 / 2.8 是 P0**（用户指定），排在 P1 的 2.7 / 2.9 之前。
- **2.10 依赖 2.6–2.9**：窄屏降级要针对已定型的结构写，先有结构才有降级。
- **2.11 最后**：交互脚本要引用全部 tab 的状态与路由。
- 无并行项：单文件产出，同一份 HTML 被逐段填充。

## 状态集说明

`principles.md` 的硬约束要求「正常 / 空 / 加载 / 错误」四态。本轮映射：

| 要求态 | v2 表达 |
| :--- | :--- |
| 正常 | 各 tab 的默认视图（有数据） |
| 空 | 待审无候选 / 最近无记录 —— 各 tab 自带空态文案 |
| 加载 | 面板内唯一的异步操作是 `sleep()`，用等待行表达（沿用 v1） |
| 错误 | `saveUserConfig` 失败 → 保存失败视图（沿用 v1） |

另加三个 TUI 特有边界：**窄终端 40 列**、**ASCII 降级**、**env 锁定**。
这三项比泛化的「错误」态更直接影响可读性，v1 已建立，v2 扩展到全部 tab。

## 阻塞与决定

- **v1 遗留未决 3（高度预算）**：78×20 body 仅 15 行，5 组无法同时展开 → 折叠为硬需求。
  已由 v1 解决，v2 沿用。
- **v2 新增架构决策**：`innerHTML` 重绘 → 静态容器 + hash 路由。理由见 `plan.md` §10。
  该决策在本轮闸门之后发现并补入 plan，已获用户确认。
- **v1 遗留未决 1（环境变量名缺失）**：9 个未暴露字段无 `XPI_MEMO_*` 变量名，
  原型只对现役 9 个标注。不阻塞产出。
