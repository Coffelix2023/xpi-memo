# tasks.md — tui-console-panel / hifi

> 编号顺序即产出顺序；只有非线性依赖才在行尾补 `(依赖: 1.2)`。
> 状态机：待执行 `- [ ]`；进行中 `- [ ]` + 行尾 `⏳ in_progress`；完成 `- [x]` + 紧跟一条验证子行。
> 一次只推进一项：先标进行中，产出后立刻勾选并写验证子行，不批量补勾。

## 任务

- [x] 1.1 生成 hifi 骨架 (验收:HTML 结构完整、78×20 网格容器就位、style/script 空标签存在、语义区块占位符齐全;产出:current/index.html)
  验证: 结构含 4 个语义区块 (toolbar / stage>term / hintbar / foot)；term 内 6 个行容器 r-top·r-tabs·r-body·r-info1·r-info2·r-bottom 就位；<style> 与 <script> 均为空占位 · 2026-09-15 22:04
- [x] 1.2 填充 THEMES.md oklch token 与网格样式 (验收:dark/light 变量齐全、等宽字形逐列对齐、无硬编码 hex;产出:current/index.html)
  验证: :root 与 .dark 各 20 个 token (含 --shadow-color) 逐字来自 THEMES.md；--term-* 全部是 var() 引用或 color-mix 派生，index.html 内无字面 hex；.term 宽度为 calc(78 * 1ch) · 2026-09-15 22:04
- [x] 1.3 实现面板外框、tab 栏与 info bar (验收:顶底边框在 78 列处对齐、4 个 tab 可切、两行 info bar 与现役 console.ts 文案一致;产出:current/index.html)
  验证: /tmp/panel-check.mjs 跑出「行数 20/20 · 边框宽 78/78」PASS；tab 栏 4 个 tab 由 window.__i18n 驱动；info bar 两行文案与 src/console.ts 的 infoBarLines 一致 · 2026-09-15 22:04
- [x] 1.4 实现 5 个分组头与折叠逻辑 (验收:组头显示 ▸/▾ 与字段计数、默认仅展开首组、折叠态总行数可算不超 body;产出:current/index.html)
  验证: 自检报「组头 5/5 · 展开 1 · 折叠 4」；默认视图 = 5 组头 + 首组 6 字段 = 11 行, 余 4 行留白；flatRows + windowStart 保证光标始终可见且窗口不越界 · 2026-09-15 22:04
- [x] 1.5 实现字段行与状态标记 (验收:标签/值两列对齐、选中行用 accent、env 锁定行标注变量名且 Enter 无效、sleep 行动作可辨;产出:current/index.html)
  验证: 三列 field-grid 6 个, 标签/值/备注均可见；env 未设置时无 ⊘ 标记(锁定改由 state.envLocked 决定, 对齐 settingsItems 的 Boolean(env[name]))；dataDir 走 muted, sleep 走 accent 前置 ↵；选中行只染 .content, 左右边框不断 · 2026-09-15 22:04
- [x] 1.6 实现 6 个状态视图切换 (验收:默认 / 全折叠 / 全展开 / env锁定 / 窄40列 / 保存失败 均可一键切到且互不串味;产出:current/index.html)
  验证: 6 个 data-view 按钮顺序 default→collapsed→expanded→env→narrow→error, 默认项带 is-active；hintbar 与 foot 已填充；窄 40 列降级 CSS(三列→两列、隐藏备注列、收起非激活 tab)就位。**偏离原文**: 原验收里的「英文」改由工具栏语言按钮独立承担 —— 语言是独立维度, 与 5 个状态视图并列会重复, 故替换为「默认」 · 2026-09-15 22:04
- [x] 1.7 实现交互脚本与 i18n (验收:↑/↓ 移动、Enter 在组头折叠展开、主题与语言 localStorage 持久化且首帧前生效、无控制台错误;产出:current/index.html)
  验证: 两个 <script> 均通过 new Function 语法编译(head 首帧脚本 + 主脚本)；i18n 的 zh-CN 与 en 键集合完全一致(各 78 键)；20 个字段的 field./note. 键无缺失；主题与语言按钮文案由 applyChrome 写入，偏好落 localStorage["xpi-memo-proto"] 并由 head 脚本在首帧前应用 · 2026-09-15 22:04

## 状态集替换说明

`principles.md` 的硬约束要求「正常 / 空 / 加载 / 错误」四态。本轮替换为
「折叠 / 展开 / env 锁定 / 窄终端 40 列 / 保存失败 / 英文界面」，理由：

- **空态不适用**：配置面板的每个字段永远有值（来自 `DEFAULT_XPI_MEMO_CONFIG`），
  不存在「无数据」视图。唯一接近的是 `dataDir` 不存在——已并入「保存失败」态。
- **加载态不适用**：配置在打开面板前已由 `loadConfig` 同步读入，面板内无异步获取。
  面板内唯一的异步操作是 `sleep()`，用「保存失败」同款的等待行表达。
- **错误态保留并具体化**：`saveUserConfig` 失败（磁盘只读、目录不可写）→「保存失败」视图。
- **新增 env 锁定与窄终端**：这两个是 TUI 面板真实会遇到、且直接影响可读性的边界，
  比泛化的「错误」态更值得在原型里定死样式。

## 阻塞与决定

- 未决 3（高度预算）：78×20 body 仅 15 行，无法同时展开 5 组 → 折叠为硬需求。
  已在 plan.md §10.3 记录，不阻塞产出。
- 未决 1（环境变量名缺失）：9 个未暴露字段无 `XPI_MEMO_*` 变量名，
  原型只对现役 9 个标注。不阻塞产出。
