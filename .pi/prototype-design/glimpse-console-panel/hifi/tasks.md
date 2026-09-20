# tasks.md — glimpse-console-panel / hifi

> 编号顺序即产出顺序；只有非线性依赖才在行尾补 `(依赖: 1.2)`。
> 状态机：待执行 `- [ ]`；进行中 `- [ ]` + 行尾 `⏳ in_progress`；完成 `- [x]` + 紧跟一条验证子行。
> 一次只推进一项：先标进行中，产出后立刻勾选并写验证子行，不批量补勾。

## 任务

- [x] 1.1 登记语义字典 pages/elements (验收:5 个 page 条目 + 本轮可修改元素齐全、`semantic_ui_map_validate` 返回 valid;产出:semantic-ui-map.yaml)
  验证: 5 个 page 条目 (P0 shell / P1 pending / P2 recent / P3 settings / P4 status) + 57 个元素；57 个短码全部唯一；`semantic_ui_map_validate` 返回「共 0 条问题码，校验通过」(version 1) · 2026-09-20 03:38
- [x] 1.2 生成骨架 (验收:800×600 容器 + header/sidebar/footer 三段 + 4 个页面容器 + hash 路由、非活动页 `display:none`、`<style>`/`<script>` 空占位;产出:current/index.html)
  验证: 50 个 id 无重复；4 个 page 容器 (`#/pending` `#/recent` `#/settings` `#/status`) + 4 个 nav 项；`.tabpage{display:none}` 与 `hashchange` 监听就位；style/script 占位标记保留；总 164 行 · 2026-09-20 03:41
- [x] 1.3 填充 THEMES.md oklch token 与 shadcn 基础样式 (验收:dark/light 变量齐全且集合一致、8pt 间距刻度、圆角/阴影来自 token、全文无字面 hex;产出:current/index.html)
  验证: :root 与 .dark 各 40 个变量且集合完全一致；全文 0 个 hex 色值；8pt 间距刻度 (--space-1..8) 与窗口几何 (--win-w 800 / --win-h 600 / --h-header 56 / --h-body 500 / --h-footer 44 / --w-sidebar 180 / --w-content 620) 全部就位；btn/badge/pill/card/skeleton 基础组件样式齐备 · 2026-09-20 03:43
- [x] 1.4 实现 header 与 sidebar (验收:标题 + 状态徽标 + 4 个导航项、激活项左 3px accent 竖条 + 淡色背景、主题/语言开关可切;产出:current/index.html)
  验证: 应用名 / 状态徽标「● 运行中」/ 4 个导航项（待审带计数 3）就位；恰好 1 个 nav 处于 is-active；点主题切 dark↔light 且按钮 ◐↔◑ 同步；点语言切 zh-CN↔en 且导航文案变 Pending/Recent/Settings/Status；`savePrefs()` 写入 `{"theme":…,"lang":…}`；首帧脚本在 head 中先于主脚本 · 2026-09-20 03:50
- [x] 1.5 实现待审页 (验收:240px 列表 + 详情分栏、选中切换时详情即时跟随、动作按钮组三态就位、空态可辨;产出:current/index.html)
  验证: 列表标题「候选 (3)」；3 个候选项且恰好 1 个 is-selected；详情 6 个字段行；三按钮「存入 / 拒绝 / 稍后」；`selectCandidate(1)` 后详情内容变化；清空后空态显示「当前没有待审记忆」。**偏离计划**: 详情实际 316px 而非计划估的 380px —— 内容区内宽 572（620 − 48 padding）减去列表 240 与间隔 16 只剩 316 · 2026-09-20 03:56
- [x] 1.6 实现最近页 (验收:6 列 grid 对齐、状态胶囊带语义色、行悬停反馈、空态显示「暂无活动」;产出:current/index.html)
  验证: 表头 6 格 + 1 条分隔线 + 5 行数据；5 个状态胶囊且四类语义色（pill-ok / pill-danger / pill-warn / pill-dim）全部命中；行悬停整行变色规则就位；清空后空态显示「暂无活动 / 记忆事件会按时间出现在这里」 · 2026-09-20 04:03
- [x] 1.7 实现设置页 (验收:5 组手风琴可折叠、字段三列对齐、底部详情面板固定 72px 且组头行不留空;产出:current/index.html)
  验证: 5 个组头 + 20 个字段行；默认 1 组展开、4 组折叠；`toggleGroup("storage")` 后展开组数 1→2，再点回 1；`focusField("paused")` 后详解区显示该字段文案，清焦点回落到展开组说明（组头行不留空）；切 en 后组头变 Retrieval · 2026-09-20 04:12
- [x] 1.8 实现状态页 (验收:4 张 KPI 卡各 137px、占用条 20 格、sparkline 8 级 SVG、柱高按峰值归一化、JSON 区可滚动;产出:current/index.html)
  验证: 4 张 KPI 卡静态存在且文案齐（库 xpi-memo / 记录 166 / 磁盘 420.5 KB / 今日 +14）；占用条 20 格、57%；sparkline 7 柱、柱高按峰值归一化到 20px；JSON 11 行且 `overflow:auto` 可滚动。**架构修正**: 卡片改为静态元素、JS 只填文字，使 25 个设置短码 + 4 个卡片短码全部出现在 HTML 源码中（1.10 实测 57/57 命中） · 2026-09-20 04:24
- [x] 1.9 实现 footer 与全局交互 (验收:info bar 六段 + Close 按钮、主题/语言 localStorage 持久化且首帧前生效、加载/错误态可切、无控制台错误;产出:current/index.html)
  验证: info bar 六段（库/记录/今日/待审/磁盘/暂停）齐全；Close 按钮文案就位；6 个按钮全部存在且接线；i18n zh-CN 与 en 各 49 键、零单向键；`savePrefs()` 写入 `{"theme":…,"lang":…}`；空态清空两列表且可恢复（3/5）；加载态显示骨架并隐藏列表；错误态显示「保存失败…」；键盘 ↓↑ 移动待审焦点、Esc 清设置焦点、点第 4 个导航切到 `#/status`。**修掉一个真 bug**: `.pane-split` / `.table-wrap` 的显式 `display:flex` 压过 UA 的 `[hidden]{display:none}`，导致 hidden 隐藏不掉 —— 已加全局 `[hidden] { display: none !important }` 并删除 4 条冗余的逐元素规则 · 2026-09-20 04:35
- [x] 1.10 收尾自检与快照 (验收:800×600 无溢出、零外部请求、无字面 hex、`semantic_ui_map_validate` valid;产出:current/index.html + CHANGELOG v1)
  验证: 真实渲染实测窗口精确 800×600、四页 body/content 均 500 且零溢出元素；零外部请求、零字面 hex、`prefers-reduced-motion` 就位、12 处 aria-label；字典短码 57/57 命中、75 个 id 无重复；`semantic_ui_map_validate` 返回 valid；总 2223 行。**annotate 未命中**（工具只认多页面模型，同 TUI 项目的限制，已记入 plan.md §9/§10） · 2026-09-20 04:52

## 切分理由

- **1.1 最先**：后续每个页面的 HTML `id` 都要对齐字典短码，字典先定才不返工。
- **1.2 是骨架**：本项目从零起稿（TUI 版是另一套 DOM），所以骨架用 `write`；
  1.3 之后一律 `replace` / `insert` 增量填充，不重写整文件。
- **1.3 在页面之前**：所有页面都消费同一套 token 与基础样式，先有样式层才不用回改。
- **1.4 在四页之前**：sidebar 是导航容器，页面挂在它旁边。
- **1.5–1.8 各自独立**：四个页面之间无依赖，可按顺序逐页产出。
  页内若单次产出超 200 行，再拆成「结构 → 内容 → 交互」子步。
- **1.9 最后**：全局交互要引用四个页面的状态（空态、错误态、语言切换）。
- **1.10 收尾**：自检 + 快照。
- 无并行项：单文件产出，同一份 HTML 被逐段填充。

## 状态集说明

`principles.md` 硬约束要求「正常 / 空 / 加载 / 错误」四态。

| 要求态 | 本轮表达 | 覆盖页面 |
| :--- | :--- | :--- |
| 正常 | 各页默认视图（有数据） | P1–P4 |
| 空 | 待审无候选 / 最近无记录 | P1、P2 |
| 加载 | `sleep()` 的等待态 → 骨架屏 | P3（唯一有异步操作的页） |
| 错误 | `saveUserConfig` 失败 → 错误横幅 | P3 |

**无「窄终端」态**：窗口固定 800×600，没有降级余地（TUI 版的 40 列降级不适用）。

## 阻塞与决定

- **未决 1（`status-panel.ts` 硬编码 hex）**：现役 Glimpse 实现与 THEMES.md 冲突。
  原型只用 THEMES.md，不阻塞产出；落地时要改现役代码。
- **未决 2（现役只实现状态页）**：其余三页的 Glimpse 版尚不存在。
  不阻塞原型，但影响落地工作量估算。
- **未决 4（sidebar resize 约束不适用）**：窗口固定，不实现拖拽 resize。
  已在 `plan.md` §10.4 记录，不阻塞产出。
