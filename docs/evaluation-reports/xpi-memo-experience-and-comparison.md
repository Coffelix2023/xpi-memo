# xpi-memo 真机体验与同类项目对比报告

- 日期：2026-06-07
- 项目版本：仓库 `main`，commit `73e25d0`
- 本机：macOS，Node `v24.20.0`（Pi 子进程实测报 `v22.23.2`），Pi `0.84.4`
- 证据等级：**实测**（本机命令/输出）、**源码**（本仓库）、**上游资料**（项目官方 GitHub README）

## TL;DR

`xpi-memo` 的核心差异不是“又一个 Markdown 记忆文件”：它把 **L0（无损会话轨迹）**、**T1（受治理长期记忆）**、候选确认、作用域隔离、可回溯证据、可重建 Markdown 视图和可降级搜索组合成一个 Pi 扩展。治理和可审计性是杀手锏。

代价也明确：架构和配置面显著重于 `pi-memory` / `pi-mem`；运行时依赖 Mnemosyne CLI 或搜索后端；当前 Pi `0.84.4` 真机上，使用 `-p` 非交互模式会触发 `stale ctx` 崩溃，隔离注册测试还有一个已过时断言。因此当前体验结论是：**架构成熟、治理领先，但发布级真机兼容性尚未闭环**。

## 一、真机运行记录

### 1. 安装路径

按项目规定执行了临时安装，不修改正式 Pi 配置：

```bash
HOME=/tmp/xpi-memo-rpc-probe-home \
XPI_MEMO_DATA_DIR=/tmp/xpi-memo-rpc-probe-data \
XPI_MEMO_SEARCH_BACKEND=ripgrep \
pi --mode rpc --no-extensions --no-skills --no-prompt-templates \
  --no-themes --no-session --no-builtin-tools \
  -e git:github.com/Coffelix2023/xpi-memo
```

安装动作成功：GitHub 源被克隆到 Pi 临时扩展目录，`npm install` 完成，未报告漏洞。

首次尝试同时加载本地已发现扩展和 GitHub 临时扩展，得到工具冲突：

```text
Tool "xpi_memo_remember" conflicts ...
Tool "xpi_memo_recall" conflicts ...
Tool "xpi_memo_forget" conflicts ...
Tool "xpi_memo_sleep" conflicts ...
```

这属于 Pi 加载方式问题，不是两个实现的功能差异；使用 `--no-extensions` 后消除。

### 2. RPC 注册 smoke

隔离 RPC（Remote Procedure Call，远程过程调用）会话中验证到：

- 4 个记忆工具注册且无重复：`xpi_memo_remember`、`xpi_memo_recall`、`xpi_memo_forget`、`xpi_memo_sleep`。
- 5 个项目命令注册：`xpi-memo`、`xpi-memo-status`、`xpi-memo-trace`、`xpi-memo-export`、`xpi-memo-init`。
- `/xpi-memo-status` 请求能进入扩展；在强制 `ripgrep` 后端的空数据目录中，状态流程产生了 `setStatus` 事件。
- 隔离临时数据目录确实创建了 `audit.json`，没有把 SQLite/WAL/SHM 写入项目目录。

### 3. 非交互命令体验

执行：

```bash
HOME=/tmp/xpi-memo-real-home \
XPI_MEMO_DATA_DIR=/tmp/xpi-memo-real-data \
pi --session-dir /tmp/xpi-memo-real-sessions \
  --approve --no-extensions \
  -e git:github.com/Coffelix2023/xpi-memo \
  -p '/xpi-memo-status'
```

可复现失败：

```text
Error: This extension ctx is stale after session replacement or reload.
...
at Object.fail (.../src/surface.ts:116:13)
at recallForContext (.../src/index.ts:1775:13)
Node.js v22.23.2
```

同一失败在 `--no-session` 和普通持久 session 两种调用中都出现。它意味着当前版本不适合直接把 `pi -p` 当作可靠的自动化 smoke 入口；交互 TUI（Text User Interface，文本用户界面）尚未通过本次人工按键级验证。

### 4. 项目自带集成验证

真实 Mnemosyne CLI 集成：

```text
src/real-cli.integration.test.ts
Test Files 1 passed
Tests 4 passed
```

隔离 Pi 注册集成：扩展加载和注册流程已跑起来，但测试失败在断言遗漏新增字段：

```diff
+ "backendState": "backend-queried-no-hits"
```

这不是扩展注册失败，而是测试期望未跟随当前 status schema（模式，数据结构契约）更新。报告不把它计为“全绿”。

### 5. 真机体验评分（当前版本）

| 维度 | 观察 | 结论 |
|---|---|---|
| 安装 | Git 源临时安装成功；重复加载会冲突 | 依赖 Pi 加载隔离方式 |
| 工具/命令发现 | 4 工具、5 命令可注册 | 清晰、可探测 |
| 存储隔离 | 临时数据根生效，项目目录无数据库副产物 | 强 |
| Mnemosyne 互操作 | 官方集成测试 4/4 通过 | 强 |
| 状态可观测性 | 有状态事件和 backend 状态 | 强，但 `-p` 路径崩溃 |
| 非交互稳定性 | `stale ctx` 可复现 | 阻塞级问题 |
| 交互 TUI | 本次未完成按键级体验验证 | 未知，不能宣称通过 |
| 整体发布准备度 | 核心链路有证据，Pi 生命周期还有缺口 | Beta，不宜宣称稳定版 |

## 二、功能定位

| 项目 | 产品层级 | 默认存储 | 检索 | 自动捕获/注入 | 治理 | 适合场景 |
|---|---|---|---|---|---|---|
| **xpi-memo** | Pi 扩展 + 记忆治理层 | L0 JSONL + Mnemosyne SQLite + 派生 Markdown | Mnemosyne → ripgrep → qmd fallback | 显式意图确定性捕获；可选离线提取；策略化 recall | 7 类 taxonomy、scope、candidate、evidence、audit、forget/sleep 边界 | 需要可审计、跨项目隔离和长期可靠性的 Pi 用户 |
| **mnemosyne** | 通用本地记忆引擎 | 单文件 SQLite；可多 bank | sqlite-vec/FTS5 hybrid；可选 embedding | 引擎/集成层提供 working/episodic/graph 能力 | importance、veracity、bank、时间能力；治理不等同 xpi-memo 候选流程 | 多 Agent、MCP、Python/CLI、跨平台复用 |
| **pi-memory** | Pi Markdown 扩展 | `~/.pi/agent/memory/*.md` | qmd 可选；keyword/semantic/deep | 每轮注入 MEMORY、scratchpad、当天/前一天日志；显式工具写入 | 文件可读可改；可恢复删除；没有 xpi-memo 那样的强 scope/evidence 审批模型 | 想马上可用、直接编辑 Markdown 的单用户 Pi |
| **pi-mem** | 轻量 Pi 日常记忆扩展 | MEMORY、SCRATCHPAD、daily、notes Markdown | 文件关键词搜索 | 每轮注入 curated memory、scratchpad、最近日志 | secret-looking 内容阻断；主要是文件和约定 | 最低摩擦的日记、清单、经验沉淀 |
| **pi-memctx** | Pi 记忆网关/项目知识包 | 本地 Markdown pack | qmd 或 grep；coverage/ranking | prompt 前 gateway 检索和压缩；turn 后自动学习多类型笔记 | 队列 review、secret block、pack scope | 大仓库、runbook、架构发现和减少重复 repo 探索 |
| **mnemopi** | Oh My Pi 的 Mnemosyne TypeScript/Bun 移植 | SQLite | FTS/vector；可选 ONNX embedding | facade 提供 remember/recall/stats/sleep | 主要继承引擎能力；scope 由 wrapper 添加 | Oh My Pi/Bun 生态内直接嵌入 |

## 三、各自杀手锏与致命短板

### 1. xpi-memo

**杀手锏**

- **L0 → T1 双层事实链**：原始会话事件 append-only（只追加）保存，长期记忆只是经过规则和证据约束的派生结果；记忆写失败时不会丢掉来源记录。
- **治理不是提示词约定**：全局 preference/workflow 可直接写；project decision/constraint/gotcha 进入候选确认；`project_gene` 要 verified evidence；禁止内容拒绝；非 Git 项目不会偷偷降级写到 global。
- **可解释作用域和回溯**：global/project/session 分离，Git worktree 共享项目身份，`xpi-memo-trace` 能从候选或记忆追到 L0 位置。
- **降级能力完整**：Mnemosyne、ripgrep、qmd 可组合，后端不可用时不让核心功能整体失效。
- **运维面完整**：status、doctor、audit、候选 digest、Markdown 导出、repo memory reimport、sleep 显式授权。

**致命短板**

- **复杂度和用户心智成本高**：L0/T1、7 类 taxonomy、候选状态、证据类型、bank、identity、recall policy、sleep mode 都要理解；普通用户只想“记住一句话”时显得重。
- **依赖链长**：核心扩展还要和 Mnemosyne CLI、外部命令探测、Pi 生命周期协作；搜索和 embedding 环境差异会影响体验。
- **非交互生命周期缺陷**：本次 Pi `0.84.4` 真机重复复现 stale-context 崩溃；这直接削弱 CI smoke、脚本化使用和无人值守运行的可信度。
- **当前测试契约不同步**：隔离 Pi 测试因 `backendState` 新字段失败，说明 status API 变更的验证闭环还不够紧。

### 2. mnemosyne

**杀手锏**

- **通用性最高**：官方 README 声明覆盖 Pi、Claude Code、Cursor、Codex、OpenWebUI、OpenClaw、MCP（Model Context Protocol，模型上下文协议）和 Python SDK。
- **本地单库和强检索**：SQLite + sqlite-vec + FTS5，文档描述 hybrid scoring 为 vector 50% + FTS5 30% + importance 20%。
- **引擎能力宽**：working/episodic memory、temporal TripleStore、memory banks、CLI、MCP、导入导出、backup/restore、sync。
- **可选本地 embedding、零云依赖定位**：适合将记忆能力作为基础设施供多个 Agent 接入。

**致命短板**

- **不是完整 Pi 产品体验**：它提供引擎和集成点，但 Pi 侧的 scope、候选确认、TUI、L0 证据链需要 wrapper 承担；裸引擎不会自动等于 xpi-memo。
- **资源和配置复杂**：embedding/LLM 全功能 profile 的内存成本高；多 bank、sync、模型、journal mode 等选项扩大运维面。
- **检索能力不等于记忆治理**：向量命中、importance 和 consolidation 不能替代“这条内容是否应该写入、证据是什么、用户是否确认”。
- **文档 benchmark 需谨慎解读**：上游 README 自己注明不同版本、不同 judge（评测裁判模型）和不同指标不能直接横比；不能把宣传数字当成当前 Pi 体验保证。

### 3. pi-memory

**杀手锏**

- **最低迁移成本**：全部是用户可读、可编辑、可提交的 Markdown；不需要数据库或 Mnemosyne。
- **功能/体验平衡好**：长期记忆、daily log、scratchpad、recovery deletion、memory status；qmd 存在时再增加 semantic/deep search。
- **KV cache 稳定设计**：默认 stable snapshot 只在 session start、compact、长期写入等检查点刷新，避免每轮动态注入导致前缀缓存失效。
- **删除可恢复**：`memory_forget` 先写 recovery payload，再变更主记忆。

**致命短板**

- **治理较弱**：Markdown section 和工具参数是主要约束，缺少 xpi-memo 的证据分类、候选确认、scope fail-closed 和 L0 原始链。
- **默认上下文偏宽**：MEMORY、scratchpad、今明两日日志按优先级注入；大型记忆文件或日志管理不佳时会稀释上下文。
- **qmd 是关键增强依赖**：没有 qmd 仍能写读，但 search 和 selective injection 能力受限；首次 embedding 还需要模型准备时间。
- **单文件扩展形态简单但边界少**：适合个人日常，不适合需要多项目身份、审计、候选审批和强隐私策略的组织工作流。

### 4. pi-mem

**杀手锏**

- **最简单的日常工作流**：`MEMORY.md`、`SCRATCHPAD.md`、daily、notes，工具命名和心智模型直观。
- **额外注入文件能力**：可通过 `PI_CONTEXT_FILES` 注入 `SOUL.md`、`AGENTS.md` 等行为文件。
- **自动 dashboard 摘要**：官方 README 描述会显示 Last 24h、成本、子 Agent 数和 scratchpad。

**致命短板**

- **主要依赖 Markdown 约定**：标签、wiki link 和目录结构提升检索质量，但不是严格 schema；错误分类和重复写入治理较弱。
- **项目隔离弱于 xpi-memo**：默认是统一 memory 根目录，项目语义更多依赖用户组织目录/配置。
- **自动写入可能带来噪声**：dashboard/LLM 摘要和退出摘要提高便利性，也引入额外调用、延迟和摘要质量风险。

### 5. pi-memctx

**杀手锏**

- **仓库知识记忆最强**：以 workspace pack、context、decision、observation、runbook、action、session 组织项目知识。
- **“先记忆、后 repo inspection”网关**：官方 README 的核心卖点是 prompt 前检索压缩上下文，减少 Agent 反复扫描仓库。
- **自动学习和关联**：一轮丰富规划/调试/发现可以形成多个互相链接的 Markdown notes。
- **有公开的成本/工具调用 benchmark**：上游报告 gateway 相对 baseline 减少工具调用和可见 token，但结果依赖模型、provider、机器和 memory pack，不能外推为通用保证。

**致命短板**

- **更偏项目知识库，不是通用个人记忆治理**：对“用户偏好、跨项目 workflow”的强类型治理不如 xpi-memo 明确。
- **自动学习的错误代价高**：一旦把错误仓库发现写成 durable runbook，后续注入会放大陈旧信息；它依赖 review、fallback 和用户维护。
- **网关判断增加系统复杂度**：检索、coverage、judge、fallback、pack 选择本身可能产生延迟或误判；“少调用工具”不等于答案一定正确。

### 6. mnemopi

**杀手锏**

- **TypeScript/Bun 原生使用体验**：为 Oh My Pi 生态提供 `Mnemopi` facade，避免 Node Pi 扩展调用 Python CLI。
- **低层能力完整**：working/episodic、MCP tools、可选 ONNX embedding、可注入 LLM。

**致命短板**

- **生态绑定明显**：官方 README 明确 wrapper scope 由 Oh My Pi coding-agent 层添加；脱离该生态，需要自行补齐 Pi 产品体验。
- **没有 xpi-memo 的治理外壳**：直接 facade 适合开发者组合，不提供同等粒度的候选审查、L0 证据、项目身份拒绝和 Markdown 派生审计链。

## 四、按用户目标选型

| 目标 | 首选 | 理由 |
|---|---|---|
| 只想快速记偏好和今日待办 | `pi-memory` / `pi-mem` | Markdown、低依赖、低学习成本 |
| 想减少大型仓库重复探索 | `pi-memctx` | workspace memory gateway + runbook/context pack |
| 想把记忆引擎接到多个 Agent | `mnemosyne` | CLI/SDK/MCP/多平台/多 bank |
| 在 Oh My Pi/Bun 内直接嵌入 | `mnemopi` | TypeScript facade 和宿主集成 |
| 要可审计、可回溯、跨项目隔离和 fail-closed | **`xpi-memo`** | L0/T1、候选治理、evidence、identity、audit |
| 要当前最稳的非交互自动化 | 暂不建议直接押注 `xpi-memo` | 本次 Pi `-p` stale-context 仍是阻塞问题，先修复并补 smoke |

## 五、对 xpi-memo 的产品判断

### 保留并强化

1. **L0/T1 分层**：这是最有辨识度的架构，不应为追求简单而删除。
2. **candidate + evidence + scope fail-closed**：这是相对 Markdown 扩展的真正壁垒。
3. **后端 fallback**：降低 Mnemosyne/qmd 安装门槛，应继续保留。
4. **人类可读导出**：让强治理系统仍然可检查、可迁移、可版本化。

### 优先修复

1. 修复 `src/surface.ts` 与 `src/index.ts:1775` 的 stale `ctx` 生命周期问题，优先覆盖 `pi -p`、`--no-session`、session replacement/reload。
2. 更新隔离 Pi 集成断言，使 status schema 变更和测试同时落地；之后重新跑完整三条仓库质量门：`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`。
3. 为非交互 smoke 增加一个不依赖模型 provider 的最小固定脚本，明确输出：注册、status、remember、recall、export、forget、sleep disabled。
4. 降低首次使用复杂度：首屏只解释“记忆写入需要哪种确认”，把 L0/T1 和 backend 细节放到 status/doctor。

### 暂不增加

- 暂不再加新的记忆层、数据库或自动摘要模型。当前问题是生命周期兼容性和核心路径验证，不是能力不足。
- 暂不做基于 benchmark 数字的性能宣传；不同项目指标不可直接比较，先建立同一 Pi/同一模型/同一 corpus 的复现基线。

## 六、来源

### 本仓库

- `README.md`：产品功能、安装、命令和配置
- `GUIDE.md`：L0/T1、候选生命周期、recall policy、导出和 sleep
- `ARCHITECTURE.md`：分层、数据布局、fallback、证据与测试说明
- `src/index.ts`：Pi command/tool 注册与 recall 生命周期
- `src/surface.ts`：本次 stale-context 堆栈指向的 UI surface
- `src/real-cli.integration.test.ts`：真实 Mnemosyne CLI 集成证据
- `src/isolated-pi.integration.test.ts`：隔离 Pi 注册与 status schema 断言

### 上游一手资料

- Mnemosyne README：<https://github.com/mnemosyne-oss/mnemosyne/blob/main/README.md>
- pi-memory README：<https://github.com/jayzeng/pi-memory/blob/main/README.md>
- pi-mem README：<https://github.com/jo-inc/pi-mem/blob/main/README.md>
- pi-memctx README：<https://github.com/weauratech/pi-memctx/blob/main/README.md>
- mnemopi README：<https://github.com/can1357/oh-my-pi/blob/main/packages/mnemopi/README.md>
- e9n/pi-memory README：<https://github.com/espennilsen/pi/blob/main/extensions/pi-memory/README.md>

上游项目的 benchmark、功能数量和“最流行”等表述均作为其 README 声明引用；本报告没有将其当作独立复现结果。
