# Track B 真实会话验证与标注（默认 runner 首轮）

- 日期：2026-09-14
- 变更：`openspec/changes/track-b-real-validation`（tasks 4.1–4.3）
- 扩展代码：工作区 `src/`（`-e ./src/index.ts`，未提交；基线提交 `5d1741a`）
- 环境：Pi `0.85.1`，模型 `deepseek/deepseek-flash`
- 上一轮基线：`docs/feedback/track-b-validation-annotation.md`（2026-09-05，无 runner，5/5 会话 `unavailable`）

## 4.1 真实会话运行与审计证据

### 方法

5 个独立真实 Pi 会话，每个会话一句自然表达（**不使用** `Please remember:` 这类显式捕获触发语），每个会话一个隔离数据根：

```bash
TMP=$(mktemp -d /tmp/xpi-memo-trackb-natural.XXXXXX)
XPI_MEMO_DATA_DIR="$TMP/data" XDG_CONFIG_HOME="$TMP/config" \
XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true \
  pi --no-session --no-extensions --no-skills --no-prompt-templates --no-builtin-tools \
     -e ./src/index.ts -p "<自然表达> Reply with exactly OK." </dev/null
```

数据根：`/tmp/xpi-memo-trackb-natural.BfAyb5`（隔离目录，未触碰真实 `~/.pi` 与 `~/.config`）。

### 审计结果（`data/audit.json` 中 5 条 `extraction` 记录）

```json
{"outcome":"executed-with-proposals","status":"completed","trigger":"session_shutdown","proposalsTotal":1,"validProposals":1,"invalidProposals":0,"storedCount":0,"candidateCount":1,"rejectedCount":0,"budgetRejectedCount":0}
{"outcome":"executed-with-proposals","status":"completed","trigger":"session_shutdown","proposalsTotal":2,"validProposals":2,"invalidProposals":0,"storedCount":0,"candidateCount":2,"rejectedCount":0,"budgetRejectedCount":0}
{"outcome":"executed-with-proposals","status":"completed","trigger":"session_shutdown","proposalsTotal":1,"validProposals":1,"invalidProposals":0,"storedCount":0,"candidateCount":1,"rejectedCount":0,"budgetRejectedCount":0}
{"outcome":"executed-without-proposals","status":"completed","trigger":"session_shutdown","proposalsTotal":0,"validProposals":0,"invalidProposals":0,"storedCount":0,"candidateCount":0,"rejectedCount":0,"budgetRejectedCount":0}
{"outcome":"executed-without-proposals","status":"completed","trigger":"session_shutdown","proposalsTotal":0,"validProposals":0,"invalidProposals":0,"storedCount":0,"candidateCount":0,"rejectedCount":0,"budgetRejectedCount":0}
```

结论：审计里出现了**可区分的运行结果状态**，`executed-with-proposals`(3) 与 `executed-without-proposals`(2) 明确分开，且都带 `trigger: session_shutdown`、零正文计数。5/5 会话都进入了真实模型调用，无一落回上一轮的 `unavailable`。

### 回滚对照（真实会话）

同一个自然表达，**不设**开关：

```bash
XPI_MEMO_DATA_DIR=$TMP/data XDG_CONFIG_HOME=$TMP/config \
  pi ... -e ./src/index.ts -p "I want failing tests written before any behavior change. Reply with exactly OK."
```

结果：`audit.json` 的 actions 为 `["recall","recall","candidate"]`，**没有任何 `extraction` 记录**——开关关闭时整条路径不发起模型请求、不写审计、不消耗预算。

### 旁证：显式捕获与提取是两条独立路径

对照会话与部分样本里，主 agent 自己调用了 `xpi_memo_remember`（L0 `tool_call` → `candidate_created`，证据类型 `verified-tool-result`）。这类候选**不是** Track B 产物；标注时用证据类型区分：`l0-conclusion` = 提取产出，`verified-tool-result` = 显式/工具路径产出。提取审计里的 `candidateCount` 与 `l0-conclusion` 候选数逐一对应（1/2/1/0/0）。

## 4.2 人工标注表

### 样本与结果

| # | 期望语义类别 | 会话表达（自然语言） | 提取提案（kind，证据类型） | 判定 |
| --- | --- | --- | --- | --- |
| N1 | `global_preference` | I want failing tests written before any behavior change. | `global_preference` / `l0-conclusion` | ✅ 正确 |
| N2 | `global_workflow` | Never rewrite published git history, and run the full gate before tagging a release. | `global_workflow` / `l0-conclusion`；`project_constraint` / `l0-conclusion` | ⚠️ 1 正确 + 1 类别不符 |
| N3 | `project_decision` | We decided that injected memory visibility is resolved through L0 ids and the bank, not a side channel. | `project_decision` / `l0-conclusion` | ✅ 正确 |
| N4 | `project_constraint` | This extension must interact with the terminal only through ctx.ui. | （无提案） | ❌ 漏捕获 |
| N5 | `project_gotcha` | After a forget call the audit must append a memory_deleted event. | （无提案） | ❌ 漏捕获 |

### 分组计数

| 指标 | 计数 | 比率 |
| --- | ---: | ---: |
| 样本数 | 5 | — |
| 会话级漏捕获（零提案） | 2 | **40%** |
| 提取提案总数 | 4 | — |
| 类别精确的提案 | 3 | 精确率 **75%** |
| 类别不符的提案 | 1 | 25% |
| 会话级完全正确（全部提案类别正确） | 3 | **60%** |
| 解析失败提案 | 0 | 0% |
| 治理拒绝 / 预算拒绝 | 0 / 0 | 0% |
| 直接入库（storedCount） | 0 | 0% |

### 漏捕获与失准的根因分类

| 类别名称 | 命中数 | 现象 |
| --- | ---: | --- |
| `bare-requirement-read-as-instruction` | 2（N4、N5） | 单句「X must Y」式项目要求被读成**本轮待办指令**，而不是持久约束，模型直接回 `{"proposals":[]}` |
| `adjacent-kind-over-split` | 1（N2 第 2 条） | 一句发布纪律被拆成「工作流 + 项目约束」两条，`workflow` 与 `project_constraint` 的边界在该语境下二义 |

补充观察（不属于上述两类，但对结论有影响）：

- **跨路径重复**：N2 同时经由显式工具路径与提取路径各产出 2 条候选，内容重叠，当前没有跨路径去重。
- **漏捕获是真漏**：N4 会话无任何工具调用，N5 只有只读工具调用，因此这 2 条既没被提取也没被显式路径捕获。
- **样本量限制**：n=5、单轮、单一模型（`deepseek-flash`）、单语言混排。40%/75% 是方向性证据，不是稳定指标。

## 4.3 ai-memory 角色决策

### 判定标准（先定标准，再看数据）

| 模式 | 条件（全部满足） |
| --- | --- |
| **分工模式**（ai-memory 不做提取，只做其他层） | 会话级漏捕获 ≤ 20% **且** 类别精确率 ≥ 80% **且** 零伪造/零内容策略违规 **且** 每会话成本可接受 |
| **接管模式**（ai-memory 接替提取执行器） | 漏捕获 > 20% **或** 精确率 < 80% **或** 出现伪造内容 |

标准是先于测量写下的：漏捕获与精确率分别代表"该记的没记住"和"记住的是错的"，任一不达标就说明会话模型不足以承担提取职责。

### 数据对照

| 标准 | 阈值 | 实测 | 结论 |
| --- | --- | --- | --- |
| 会话级漏捕获 | ≤ 20% | **40%**（2/5） | 不达标 |
| 类别精确率 | ≥ 80% | **75%**（3/4） | 不达标 |
| 伪造 / 内容策略违规 | 0 | 0 | 达标 |
| 审计可区分状态 | 必须 | 已具备（3×with-proposals / 2×without-proposals） | 达标 |

### 结论

**接管模式（takeover）**：由 ai-memory 接替离线提取执行器，治理管道保持本仓库现有实现不变。

依据引用的实测数字：漏捕获 **40%（2/5）**、类别精确率 **75%（3/4）**，两项均未达到分工模式的阈值（20% / 80%）。同时"零伪造、零策略违规、审计可区分"达标，说明**瓶颈在提取质量，不在治理与安全边界**——这正是把执行器换成专用组件（ai-memory）、而不动 pipeline 的理由。

### 边界与本变更的关系

- 本变更**不接入、不安装** ai-memory。以上只是角色判定与判定所依据的数据，接入属于后续变更。
- 结论对样本量敏感：n=5、单模型、单轮。若后续用 ≥10 个会话、跨模型复测后漏捕获 ≤ 20% 且精确率 ≥ 80%，应回到**分工模式**重新评估（届时作为 runner 的模型而非 ai-memory 就够用）。
- 无论哪种模式，默认 runner 仍需保留：它既是当前可观测的兜底实现，也是后续专用执行器的接缝（`dependencies.offlineExtractionRunner` 优先，默认实现兜底）。

## 4.4 质量闸门

```text
$ pnpm typecheck
$ tsc --noEmit
exit 0

$ pnpm -w run lint
$ biome check .
Checked 143 files in 79ms. No fixes applied.
exit 0

$ pnpm test
Test Files  70 passed | 4 skipped (74)
     Tests  684 passed | 7 skipped (691)
exit 0
```

跳过项为既有的 gated 集成测试（`XPI_MEMO_RUN_PI_INTEGRATION=1` 等开关控制）。本次另在开启开关下运行了 `src/shutdown-model-context.integration.test.ts`，1 passed。

## 回滚

- 运行期：`XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false`（或 unset）——本文件 4.1 的回滚对照已实测：无模型请求、无 extraction 审计记录。
- 数据期：本轮所有样本都落在 `/tmp/xpi-memo-trackb-*/` 隔离数据根，未写入真实 `~/.pi/agent/xpi-memo`。
- 代码期：revert 本次提交；`docs/` 与本记录不参与运行时。
