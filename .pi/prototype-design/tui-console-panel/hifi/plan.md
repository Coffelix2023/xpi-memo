# plan.md — tui-console-panel / hifi

> 本阶段唯一需求事实来源。结构继承 wireframe，视觉自由。每轮深挖后覆写本文件。

## 1. 目的 (Why)

重新设计 `/xpi-memo` 命令弹出的 TUI 面板。本轮原型聚焦 **Settings tab 的字段分组重构**，
作为整体面板重设计的第一步。

当前问题：现役 `src/console.ts` 的 Settings tab 只暴露 `XpiMemoConfig` 19 个字段中的 9 个
（外加 1 个 sleep 动作），其余 10 个只能改配置文件。字段平铺成单一列表，没有分组，
用户无法从标签判断字段归属与后果。

## 2. 上游输入

- wireframe 版本：无（本版直接起稿，见 `DELTA.md`）
- 差异登记：见同目录 `DELTA.md`

## 3. 页面清单

单页原型 `current/index.html`，内含 6 个状态视图切换（见任务 1.6）。

| ID | 页面 | 优先级 | 状态覆盖 |
| :--- | :--- | :--- | :--- |
| settings-panel | `/xpi-memo` Settings tab | P0 | 折叠态 / 展开态 / env 锁定 / 窄终端 40 列 / 保存失败 / 英文界面 |

## 4. 交付形态

- [x] 78 列 × 20 行字符网格（TUI-DESIGN.md `PANEL_WIDTH` / `PANEL_HEIGHT`）
- [x] 自包含 HTML（内联 CSS/JS，无构建、无依赖）
- [x] 状态覆盖：折叠 / 展开 / env 锁定 / 窄终端 / 保存失败

## 5. 主题与语言

- 配色来源：`/Users/felix/c6x_local/app-prd/xpi-memo/THEMES.md`（shadcn oklch token，禁止硬编码 hex）
- 主题：默认暗色（`<html class="dark">`），页内可切换
- 语言：默认 `zh-CN`，页内可切换 `zh-CN` / `en`
- **偏离记录**：现役面板文案为英文（`TAB_TITLES` 等硬编码英文），原型默认 `zh-CN`
  并允许切换；落地时应跟随 `config.language`

## 6. 启用技能

- [x] design-token
- [x] typography-scale
- [x] spacing-system
- [x] design-qa-checklist
- [ ] component-spec（本轮不涉及 sidebar / 分栏面板）
- [ ] state-machine（状态集已在本文件枚举，无需穷举机）
- [ ] micro-interaction-spec（TUI 无拖拽 resize、无 hover）
- [ ] dark-mode-design（THEMES.md 已给双模 token，本轮只消费）

## 7. 分组结构 (按功能域)

| 组 | 字段数 | 字段（config key） |
| :--- | :--- | :--- |
| 召回与检索 (Retrieval) | 6 | recallPolicy · retrievalMode · searchBackend · limit · globalLimit · projectLimit |
| 存储与提取 (Storage) | 5 | confirmStore · autoExport · offlineExtractionEnabled · excludeToolResults · dataDir(只读) |
| 记忆管道 (Pipeline) | 3 | paused · l0Enabled · profileInjection |
| 界面与反馈 (Display) | 3 | language · eventPresentation · passiveFeedback |
| 隐私与维护 (Privacy) | 3 | privacy · sleepMode · sleep(动作，非 config) |

合计 20 行 = 19 个 config 字段 + 1 个 sleep 动作。

## 8. 任务编排

> 任务清单与进度在同目录 `tasks.md`。这一节只写**切分理由**。

- **顺序按构建阶段切分**（骨架 → token → 外框 → 分组 → 字段行 → 状态 → 交互），
  因为每个后续任务都依赖前一个的 DOM 结构存在。
- **1.4 与 1.5 强依赖**：分组头先就位，字段行才能挂进分组容器。
- **1.7 交互脚本最后**，因为它引用 1.4 的折叠状态与 1.5 的行索引。
- 无并行项：单文件产出，同一份 HTML 被逐段填充。

## 9. 成功标准

- [ ] 每个字段的标签 + 当前值让人一眼看懂后果，不需要查文档
- [ ] 20 行全部可达，折叠态下列表不超出一屏（body 15 行）
- [ ] env 锁定字段可见、只读、标明环境变量名
- [ ] 暗色为默认，亮/暗与中/英切换可用且首帧不闪烁
- [ ] 无硬编码色值；所有颜色可在 THEMES.md 找到出处
- [ ] `current/index.html` 零外部网络请求
- [ ] 尊重 `prefers-reduced-motion`；焦点可见；正文对比度 ≥ 4.5:1

## 10. 未决问题

1. 未暴露的 10 个字段里，9 个（autoExport / eventPresentation / excludeToolResults /
   l0Enabled / offlineExtractionEnabled / passiveFeedback / privacy / sleepMode / dataDir）
   在现役 `settingsItems` 中没有对应的 `XPI_MEMO_*` 环境变量名。
   原型只对已定义的 9 个标注变量名，其余锁定态留空待落地时确认。
2. `sleepMode` 的 4 个取值（disabled / dedicated / session-model / mechanical）
   中文标签待定；原型暂用「关闭 / 独立进程 / 会话模型 / 机械规则」。
3. 高度预算：78×20 下 body 仅 15 行（`PANEL_CHROME_ROWS = 5`），
   装不下 5 组头 + 20 字段 + 组间空行，**折叠是硬需求而非可选增强**。
4. 分组默认展开策略：原型默认仅展开首组。是否需要记忆用户上次展开的组（写 config 或
   session 内存储）留待落地决定。
