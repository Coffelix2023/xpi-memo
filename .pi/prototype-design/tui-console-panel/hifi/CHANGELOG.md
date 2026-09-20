# CHANGELOG — hifi

> 最新迭代在最上方，倒序排列。每轮产出后由 `prototype_snapshot` 追加一条。

<!-- ENTRIES -->

## 2026-09-19 19:52 · v2
- 变更：v2:4 个 tab 全覆盖 —— 待审改左右分栏、最近改对齐表格 + 状态符号、状态改指标卡 + 占用条 + sparkline；body 从 innerHTML 重绘改为静态容器 + hash 路由；新增 ASCII 降级符号层与 auto/always/never 三态；4 个 tab 各自定义 40 列降级
- 原因：v1 只重设计了 Settings tab，其余三个 tab 仍是 SelectList 两行 / 单行拼接 / JSON dump 的初版形态；同时 v1 的 innerHTML 重绘会让语义徽标在每次渲染后丢失，annotate 无法生效
- 文件：`current/index.html`
- 回滚到 v1：cp -R .pi/prototype-design/tui-console-panel/hifi/v1/. .pi/prototype-design/tui-console-panel/hifi/current/

## 2026-09-15 22:10 · v1
- 变更：Settings tab 从平铺 10 项改为 5 组 20 项、组头可折叠；字段行改三列（标签/当前值/备注）；新增 6 个状态视图与窄终端 40 列降级
- 原因：零文档可读性：现役面板只暴露 XpiMemoConfig 19 个字段中的 9 个且无分组，用户无法从标签判断字段归属与后果
- 文件：`current/index.html`
