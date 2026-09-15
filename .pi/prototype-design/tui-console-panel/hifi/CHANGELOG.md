# CHANGELOG — hifi

> 最新迭代在最上方，倒序排列。每轮产出后由 `prototype_snapshot` 追加一条。

<!-- ENTRIES -->

## 2026-09-15 22:10 · v1
- 变更：Settings tab 从平铺 10 项改为 5 组 20 项、组头可折叠；字段行改三列（标签/当前值/备注）；新增 6 个状态视图与窄终端 40 列降级
- 原因：零文档可读性：现役面板只暴露 XpiMemoConfig 19 个字段中的 9 个且无分组，用户无法从标签判断字段归属与后果
- 文件：`current/index.html`
