# xpi-memo

[English](./README.md) · [简体中文](./README.zh-CN.md)

结合 [mnemosyne](https://github.com/topics/vector-database) 向量检索与 pi-memory 架构的超级记忆工具：L0 会话轨迹、T1 受治理记忆、派生的心智模型投影、Markdown 导出、可插拔检索。

一个 [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) 扩展。

## 功能

- **T1 受治理记忆** — 路由（全局/项目/会话）、带候选确认的写入治理、策略驱动的召回
- **记忆激活回路** — 显式用户意图（偏好、工作流、项目决策、坑点、会话上下文）从提示中确定性捕获，按 L0 事件位置 + 内容指纹幂等；会话结束时还有一条门控的离线提取路径（默认关闭），TUI 下运行时在输入框上方显示进度提示
- **人类可读的可观测性** — 固定的 7 类分类法（偏好、工作流、仓库事实、约束、决策、坑点、会话上下文），其角色、作用域与信任状态在控制台、状态与导出中一致
- **L0 会话轨迹** — 每会话一份无损追加式 JSONL 日志（10 MB 轮转）；状态如何变化的事件真相（日志与记忆溯源都由它派生，bank 保存的是当前状态）
- **派生的心智模型投影** — 两个由代码拥有、带版本的固定问题（全局工作风格、当前项目运行模型），只从**已确认**的 T1 条目派生答案，仅在会话边界刷新、合成**默认关闭**；注入文本被标记为不可信的派生数据，不会变成新的记忆 kind，源状态一变就不再参与召回
- **Markdown 导出** — 人类可读的 `MEMORY.md`（由 bank 当前状态投影，带 L0 注释）+ 由 L0 折叠出的日志；增量、隐私脱敏、对 Git 友好
- **可插拔检索** — 召回走回退链：mnemosyne（向量 + FTS5）→ ripgrep（全文）→ qmd（语义）；装了任意子集都能工作
- **双轨控制台** — `/xpi-memo` 在 Glimpse 可用时打开原生窗口（启动尺寸 800×600），不可用时落回 TUI 面板；两者从同一份视图模型渲染同样的四个视图（待审 / 最近 / 设置 / 状态），因此任一方都不会漏掉另一方展示的字段。窗口里的设置也能改：点字段，或聚焦后按 `Space`；窗口本身可缩放，布局会跟着铺满

细节：[GUIDE.md](./GUIDE.md)（用法）· [ARCHITECTURE.md](./ARCHITECTURE.md)（L0/T1/投影 分层）· [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) · [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md)（版本）· [MARKDOWN-FORMAT.md](./MARKDOWN-FORMAT.md)（导出格式）

## 安装

```bash
pi install git:github.com/Coffelix2023/xpi-memo
```

更新已安装的版本：

```bash
pi update --extension git:github.com/Coffelix2023/xpi-memo
```

`pi install` 会在包内执行 `npm install`；扩展本身没有构建步骤（Pi 直接加载 `src/index.ts`）。

**可选的检索后端**（任意子集；检索链会自动回退，`/xpi-memo-status` 会报告实际可用的后端）：

```bash
uv tool install mnemosyne-memory   # 向量 + FTS5 检索
brew install ripgrep               # 全文检索（macOS）；Fedora 上用 dnf install ripgrep
# qmd（可选语义检索）: https://github.com/tobi/qmd#installation
```

**可选的展示层：** 只有 `glimpseui` 模块能被解析到时，`/xpi-memo` 才打开 Glimpse 窗口；否则得到 TUI 面板。

```bash
pi install npm:glimpseui
```

## 用法

### 命令

- `/xpi-memo` — 打开控制台：Glimpse 可用时是原生窗口（启动尺寸 800×600，可缩放，布局会铺满），否则是 TUI 面板（两者都是待审 / 最近 / 设置 / 状态）
- `/xpi-memo-status` — 在任意模式下把完整状态打成 JSON：这是唯一的程序化状态读取途径（库、后端可用性、配置、可观测性、`doctor`）。要看状态的**界面**，用 `/xpi-memo`
- `/xpi-memo-init` — 初始化非 Git 项目身份（写入 `.pi/xpi-memo/project.json`；不会在仓库里放 SQLite）
- `/xpi-memo-export [--session <id>] [--force] [--validate]` — 把 L0 事件导出为 Markdown
- `/xpi-memo-export --repo [--reimport]` — 把受治理的项目记忆导出到 `.pi/memory/<kind>.md` / 把发现的条目重新导入为受治理候选

### 控制台按键

| 按键 | 行为 |
| --- | --- |
| `←` / `→` | 上一个 / 下一个标签；到第一个或最后一个标签就停住（不循环） |
| `↑` / `↓` | 在当前列表内移动光标 |
| `Space` | 设置标签：折叠 / 展开分组，或把光标所在字段切到下一个值 |
| `Enter` | 设置标签：保存面板配置（面板不关闭）；待审标签：审阅选中的候选 |
| `Tab` / `Shift+Tab` | 设置标签：跳到下一个 / 上一个字段（跳过组头） |
| `Esc` / `Ctrl-C` | 关闭面板 |

字段行按 `名称 / 说明 / 取值` 三列排布。把光标移到某个字段上，info bar 上方两行会给出该字段的作用、谁在用，以及推荐取值和每个选项的含义。标题嵌在顶边框，按键提示在底边框上方最后一行。

**Glimpse 窗口里**用的是左侧边栏而不是顶部标签栏，所以按键不同：点边栏切视图，`↑` / `↓` 在待审列表内移动，`Tab` / `Shift+Tab` 逐个跳设置字段，`Esc` 关窗。

设置字段自带控件：可枚举字段是下拉框（点它，或聚焦后按 `Space`，弹出系统菜单），自由文本字段是可直接输入的输入框，被 `XPI_MEMO_*` 变量钉住的字段是禁用态。控件一上报改动就落盘，没有单独的保存步骤；语言字段会让窗口原地重绘。`立即整理一次` 会先要确认，且不写配置。待审与最近页的详情跟随面板语言；最近页按事件类型读取各自的字段，而不是显示一整行「—」。

### 工具

- `xpi_memo_remember` — 存储记忆
- `xpi_memo_recall` — 召回记忆
- `xpi_memo_forget` — 删除记忆
- `xpi_memo_sleep` — 整理记忆（需要显式授权）

**自动捕获。** 当你在提示里显式声明一条长期有效的偏好、工作流、项目决策、坑点或有边界的会话上下文时，激活回路会把它走一遍与 `xpi_memo_remember` 相同的治理路径——不需要额外调用工具。全局偏好/工作流直接落库；项目决策、约束与坑点会变成待审候选（见 [GUIDE.md § Activation loop](./GUIDE.md#activation-loop)）。

**自动准入。** 记忆默认直接入库：候选只有命中硬底线（禁止性内容、未解冲突、或记忆处于暂停状态）或被你自己收紧的偏好挡住时才不进 T1。偏好是一组开关——每类记忆一个，外加最低置信度、证据下限、来源范围与候选时效窗口；可以在 `/xpi-memo` 的设置标签里改，也能通过配置文件和 `XPI_MEMO_ADMISSION_*` 环境变量设置。仓库事实校验不再决定准入：校验通过会把证据升级为 `verified-repository-fact`，无论通过与否都留下记录。想整体关掉准入，用 `autoAdmit: false` 或 `XPI_MEMO_AUTO_ADMIT=false`，候选会回到待审队列。用 `/xpi-memo-rescan` 按当前偏好重扫存量候选：仍被偏好挡住的不再堆积，而是进入保留 30 天的归档。

## 配置

默认数据目录：`~/.pi/agent/xpi-memo/`

用户配置文件：`~/.config/xpi-memo/config.json`

环境变量：

- `XPI_MEMO_DATA_DIR`
- `XPI_MEMO_PAUSED`
- `XPI_MEMO_CONFIRM_STORE` = `true|false`（默认 `false`；为 `true` 时 TUI 记忆写入前先确认）
- `XPI_MEMO_LANGUAGE` = `en|zh`（默认 `en`；控制台与确认面板文案）
- `XPI_MEMO_L0_ENABLED`
- `XPI_MEMO_LIMIT` / `XPI_MEMO_GLOBAL_LIMIT` / `XPI_MEMO_PROJECT_LIMIT`
- `XPI_MEMO_AUTO_EXPORT`
- `XPI_MEMO_AUTO_VERIFY` = kill switch（`false`/`0` 关闭仓库事实校验——所有候选转入人工待审）
- `XPI_MEMO_AUTO_ADMIT` = `true|false`（覆盖配置文件的 `autoAdmit`，默认 `true`；设为 `false` 时所有候选留在待审队列并留下有界审计）
- `XPI_MEMO_ADMISSION_ALLOW_*`（每类记忆一个）、`XPI_MEMO_ADMISSION_MIN_CONFIDENCE`、`XPI_MEMO_ADMISSION_EVIDENCE_FLOOR`、`XPI_MEMO_ADMISSION_SOURCE_SCOPE`、`XPI_MEMO_ADMISSION_MAX_AGE_DAYS`、`XPI_MEMO_ARCHIVE_RETENTION_DAYS` = 准入偏好（详见 [GUIDE.md](./GUIDE.md#configuration-table)）
- `XPI_MEMO_EXCLUDE_TOOL_RESULTS`
- `XPI_MEMO_PRIVACY`
- `XPI_MEMO_SEARCH_BACKEND` = `auto|mnemosyne|ripgrep|qmd`
- `XPI_MEMO_RECALL_POLICY` = `active|assist|high-value-auto`
- `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` = `true|false`（默认 `false`）
- `XPI_MEMO_OFFLINE_EXTRACTION_MODEL` = `session-model`（默认）或 `provider/model-id`（也可只写 `model-id`；无法解析时回退到会话模型；控制台中可编辑）
- `XPI_MEMO_EMBEDDING_MODE` = `off|local|api`（默认 `off`；控制 xpi-memo 拉起的 mnemosyne 子进程是否做向量化——`off` 省掉约四分之三的写入成本）
- `XPI_MEMO_EMBEDDING_MODEL` / `XPI_MEMO_EMBEDDING_API_URL`（留空即沿用 mnemosyne 自己的默认；API key 只放环境变量 `MNEMOSYNE_EMBEDDING_API_KEY` / `OPENAI_API_KEY`，不写进 xpi-memo 配置）
- `XPI_MEMO_RETRIEVAL_MODE`
- `XPI_MEMO_SLEEP_MODE` = `dedicated|session-model|mechanical|disabled`（默认 `disabled`；fail-closed）
- `XPI_MEMO_MENTAL_MODEL_DEFINITIONS` = 逗号分隔的内置心智模型 id（默认两个都开；留空则整层关闭）
- `XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED` = `true|false`（默认 `false`；显式开启才会生成投影，详见 [GUIDE.md § Mental models](./GUIDE.md#mental-models-derived-standing-answers)）
- `XPI_MEMO_PROFILE_INJECTION` = `true|false`（默认 `true`；`false` 时不注入派生的偏好画像块）
- `XPI_MEMO_EVENT_PRESENTATION` = `true|false`（默认 `true`；`false` 时静默页脚/状态生命周期事件）
- `XPI_MEMO_PASSIVE_FEEDBACK` = `true|false`（默认 `true`；`false` 时停止被动使用反馈写入）

完整的配置表（含默认值与影响）见 [GUIDE.md](./GUIDE.md)。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm -w run lint
pnpm test
npx tsx scripts/bench.ts   # 热路径微基准
```

## 致谢

xpi-memo 是一份原创实现。以下项目启发了它的架构与交互模式；它们都不是运行时依赖，其名称也不会出现在 xpi-memo 的用户可见命令、数据标签或状态表面上：

| 项目 | 角色 | 借鉴内容 |
| --- | --- | --- |
| [mnemopi](https://github.com/can1357/oh-my-pi/tree/main/packages/mnemopi)（Oh My Pi 的一部分，MIT） | 灵感 | 自动召回/留存生命周期、查询意图加权、时效与多样性排序 |
| [pi-memory](https://github.com/jayzeng/pi-memory)（MIT） | 灵感 | 低摩擦捕获、Markdown 可读视图、压缩交接、稳定快照 |
| [pi-interview-tool](https://github.com/earendil-works/pi-interview-tool) | 仅设计语汇 | 富 UI 层的卡片/推荐/澄清模式；从不是运行时依赖 |
| [glimpseui](https://github.com/earendil-works/glimpseui) | 可选展示层 | 模块可解析时打开原生 800×600 控制台窗口；TUI 面板仍是回退面 |

所有用户可见的命令（`/xpi-memo`、`/xpi-memo-status` …）、工具（`xpi_memo_*`）、数据标签（偏好、工作流、仓库事实、约束、决策、坑点、会话上下文）与状态表面都使用 `xpi-memo` 品牌。上游名称只出现在本致谢与内部代码注释里——不是运行时 API 名称。

任何复制过来的宽松许可证代码，其许可证细节见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 许可证

MIT
