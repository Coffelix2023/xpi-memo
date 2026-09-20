# CHANGELOG — hifi

> 最新迭代在最上方，倒序排列。每轮产出后由 `prototype_snapshot` 追加一条。

<!-- ENTRIES -->

## 2026-09-20 04:24 · v1
- 变更：v1:800×600 像素 Glimpse 面板首版 —— header 56 + sidebar 180 + content 620 + footer 44；待审改 240px 列表 + 316px 详情分栏、最近改六列 grid + 状态胶囊、设置改 5 组手风琴（列表独立滚动 + 详情固定 72px）、状态改 4 KPI 卡 + 20 格占用条 + 7 柱 sparkline + 可滚动 JSON；配色只用 THEMES.md oklch，双模可切
- 原因：把 /xpi-memo 面板从 78×20 字符网格改造成 800×600 像素 Glimpse 窗口原型：像素媒介没有字符约束，折叠与 body 行数不再是硬限制，信息架构可以按桌面惯例重排
- 文件：`current/index.html`
