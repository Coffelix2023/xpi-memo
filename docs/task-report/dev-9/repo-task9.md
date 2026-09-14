# Task 9：docs-structure-cleanup（docs/ 结构分离与归档索引）

> 本文件是 `openspec/changes/docs-structure-cleanup` 的分组任务报告（AGENTS.md §7）。
> 覆盖全部五个任务组（tasks 1.1–5.4）与全部四个要素（目的 / 作用 / 特点 / 边界）。

## 变更背景（一句话）

`docs/` 里 68 个文件中，权威契约与历史过程记录混在同一层：10 个早期探索稿散落在 `docs/` 根，`plan-note-01/02` 与被取代的结论同级，`docs/GUIDE.md` 与根 `GUIDE.md` 重名，一个属于**另一个产品**的设计稿连插图占了 `docs/` 体积的 57%。本变更把它们按「当前口径 / 历史过程」分离，全部走 `git mv`，**不删除任何文件**，并新增一份目录地图把旧路径映射到新路径。

---

## 任务组 1：Inventory and freeze the moving set

### 目的

在动手之前先把「动什么」变成一份可核对的清单，并把「绝对不动什么」冻结下来。移动 47 个路径是不可逆感很强的一步，先冻结清单才能在每一步之后回答「有没有碰不该碰的东西」。

### 作用

- 1.1 生成完整移动清单（源路径 → 目标路径），并核对分组计数。
- 1.2 记录并冻结「保持原位」清单，后续每个任务组都要复验它仍然存在。

### 特点

- 清单是**程序生成**的，不是手写的；并与 `git status --porcelain` 的 rename 记录逐条交叉核对，不一致数为 0。
- 计数经过闭合校验：46 移动 + 1 改名 + 21 保持原路径 = 68，与 `docs/` 实际文件数一致。
- 实施中发现计划里的一个算术错误（原文写「22 个文件保持原位」，实际是 21；`docs/GUIDE.md` 属于改名而非保持原路径），已同步修正 `proposal.md` 与 `tasks.md` 后再继续——错误数字留在制品里比改它更糟。

### 边界

- 清单只描述路径变更，不判断文档内容是否需要重写；内容一律不动。
- 冻结清单的粒度是「条目」，不是「文件」：`task-report/` 与 `evaluation-reports/` 各含 8 个文件，按目录整体冻结。

### 产出

| 项 | 值 |
| --- | --- |
| 移动清单 | 46 条，分组：feedback 20 / plans 6 / exploration 10 / notes 5 / out-of-scope 5 |
| 改名 | 1 条（`docs/GUIDE.md` → `docs/RECOVERY.md`） |
| 保持原路径 | 21 个文件 |
| 合计 | 68（与 `docs/` 实际文件数一致） |

---

## 任务组 2：Archive the historical groups

### 目的

让历史过程记录离开 `docs/` 根层，集中到一个按「年-月 / 类别」组织的归档区，使读者能从路径判断一份文档是当前口径还是历史材料。

### 作用

- 2.1 建立 `docs/archive/2026-09/{feedback,plans,exploration,notes,out-of-scope}/` 五个空目录。
- 2.2–2.6 按组执行 46 次 `git mv`，并在每组结束时清掉留下的空源目录。

### 特点

- 全部使用 `git mv`：`git status` 显示 46 条 `R`（rename）记录，无「删除 + 新增」配对，文件历史可追。
- 跨产品文档与它引用的 `assets/` **同目录移动**，因此文档里的 4 个 `![...](assets/*.png)` 相对链接在移动后仍然解析（已逐一实测）。
- 每移完一组立即 `rmdir` 空源目录，避免把「空壳目录」遗留成新的噪声——这正是本次要清理的那类问题。

### 边界

- 只移动，不改写：归档文档的正文（包括其中指向旧路径的引用）保持逐字节不变。
- 不归档 `evaluation-reports/`：它是按日期排列的证据档案，2026-09-14 的两轮记录是下一步决策的基线，不是过时材料；把它拆成两处反而增加读者负担。
- 不归档 `task-report/`：`AGENTS.md` 第 7 节把它写成固定路径。
- 不把任何文件移出本仓库、不删除文件。

### 产出

```
docs/archive/2026-09/
├── feedback/     20 文件（26-09-02 / 26-09-04 / 26-09-07 + track-b-validation-annotation.md）
├── plans/         6 文件（plan-note-01..04 + 两份评估）
├── exploration/  10 文件（早期探索稿、阶段交接、中间态评审）
├── notes/         5 文件（调研笔记、codegraph 讨论）
└── out-of-scope/  5 文件（跨产品设计稿 1 + assets 4）
```

移动后 `docs/feedback/`、`docs/plans/`、`docs/notes/` 三个旧目录均已移除。

---

## 任务组 3：Resolve the name collision

### 目的

`docs/GUIDE.md`（Recovery Guide）与仓库根 `GUIDE.md`（User Guide）同名，按名字找文档会拿到错的那份。本组消除这个歧义。

### 作用

- 3.1 `git mv docs/GUIDE.md docs/RECOVERY.md`。
- 3.2 更新 `TROUBLESHOOTING.md` 里那一处仍然生效的引用。

### 特点

- 改名后立即做**内容哈希校验**：`git rev-parse HEAD:docs/GUIDE.md` 与 `git hash-object docs/RECOVERY.md` 都是 `c8c042a221b48055f5f375461f7595c78e90c503`，证明这是纯改名，没有顺手改内容。
- 影响面精确到一处：全仓扫描后，除归档文档、`.pi/fast-fixes/archived/**`、`docs/task-report/**` 与本变更自身的计划文本外，只有 `TROUBLESHOOTING.md` 一处活引用需要更新。

### 边界

- 只改名，不合并进 `TROUBLESHOOTING.md`：两份文档职责不同（前者是「怎么恢复」的操作步骤，后者是「哪里出错」的症状索引），重名是问题，内容重叠不是。
- 不改写历史记录里的旧路径。

### 产出

| 项 | 结果 |
| --- | --- |
| 新路径 | `docs/RECOVERY.md`（内容哈希未变） |
| 旧路径 | 已不存在 |
| 活引用更新 | `TROUBLESHOOTING.md:110` |
| 剩余旧名引用 | 仅存在于历史记录与本变更计划文本中（符合 D4 决定） |

---

## 任务组 4：Index and cleanup

### 目的

路径变了，但历史记录里的旧路径不改写；因此必须有一份索引承担「旧路径 → 新路径」的翻译，否则归档等于把文件藏起来。

### 作用

- 4.1 写入 `docs/README.md`：当前有效条目及其职责、`archive/2026-09/` 五组各是什么、归档材料之间的取代关系、以及完整的 47 行路径映射表。
- 4.2 删除空的 `docs/archived/` 目录。
- 4.3 复验冻结清单与 `docs/` 根层内容。
- 4.4 确认零删除。

### 特点

- 映射表是**从 `git status` 的 rename 记录生成**的，不是手抄，因此不会与磁盘实际状态漂移；生成时用 `-c core.quotePath=false` 保留中文文件名的原样，避免出现转义乱码。
- 索引里有独立一节解释「为什么历史引用不改写」，让后来者不会把它当成遗漏。
- 覆盖性做了双向校验：`archive/` 下 46 个文件全部能在映射表里按旧路径查到（未覆盖数 0）。
- 4.2 删除的是**空目录**，不是文件；`git status` 的删除计数仍为 0。

### 边界

- 索引只描述结构，不复述任何归档结论；它明确写了「当前口径的最终依据是 `openspec/specs/` 与 `ARCHITECTURE.md`，不是 `docs/` 下的过程文档」。
- 不在根 `README.md` 增加指向 `docs/README.md` 的链接：那超出本变更的记录范围，且进入 `docs/` 即可见。若需要，另开变更。
- 不修正 `ARCHITECTURE.md` 的文案漂移（"350+ tests"），属于另一个变更。

### 产出

| 项 | 结果 |
| --- | --- |
| `docs/README.md` | 109 行，含 47 行映射表 |
| `docs/archived/` | 已移除（原为空目录） |
| 零删除 | `git diff --cached --diff-filter=D` 与 `git diff --diff-filter=D` 均为空 |
| `docs/` 根层 | `archive/`、`COMPATIBILITY.md`、`evaluation-reports/`、`GIT-WORKFLOW.md`、`GITHUB-GUARD.md`、`l0-contract.md`、`README.md`、`RECOVERY.md`、`task-report/`、`UPSTREAM-FOLLOWUPS.md` |

---

## 任务组 5：Acceptance

### 目的

证明这次结构整理没有打断任何仍然生效的引用，也没有影响代码与测试。

### 作用

- 5.1 解析全仓活跃 `docs/` 引用并逐一确认目标存在。
- 5.2 重跑三条质量闸门。
- 5.3 产出本报告。
- 5.4 把完整移动清单写进提交信息。

### 特点

- 5.1 的扫描面覆盖仓库根 `*.md`、`src/**`、`openspec/specs/**`、`openspec/changes/**`（排除 `archive/`）与 `.pi/**`，共解析到 19 个引用目标，全部可解析。
- 扫描出的「不可解析」项逐条分类，而不是简单计数——见下表，其中没有一条是真正被打断的活引用。
- 5.2 的三条闸门与变更前基线一致：`tsc` exit 0、`biome` 检查 146 个文件无修改、**702 passed / 7 skipped**，说明纯文档改动没有触碰运行时。

### 边界

- 5.1 不把历史记录里的旧路径算作故障：`.pi/fast-fixes/archived/**`、`docs/task-report/**`、`openspec/changes/archive/**` 保持原文是本变更的明确决定。
- 5.4 只要求把清单写进**提交信息**；推送不在本变更范围内（当前本地领先 `origin/main` 6 个提交，是否推送由用户决定）。

### 5.1 「不可解析」项的逐条分类

| 项 | 实际性质 |
| --- | --- |
| `docs/GUIDE.md` ← `.pi/fast-fixes/archived/**` | 历史记录，按 D4 不改写 |
| `docs/GUIDE.md` ← 本变更的 proposal/design/tasks | 描述改名动作的文本，非活引用 |
| `docs/feedback/**`、`docs/plans/plan-note-04.md` ← `.pi/fast-fixes/archived/**` | 同上 |
| `docs/notes/pi-创作Agent平台架构方案.md` ← 本变更的 proposal/tasks | 描述移动源路径的文本 |
| `docs/MIGRATION.md` ← 根 `GUIDE.md` | 原文说的是「该文件已被移除」，不是链接 |
| `docs/archive/README.md` ← 本变更 design.md | D7 里被**否决**的备选方案 |
| `docs/auth.md` ← `src/search/search.test.ts` | qmd 后端的合成测试数据（`qmd://docs/auth.md`），与本仓 `docs/` 无关 |

### 质量闸门

```text
$ pnpm typecheck
$ tsc --noEmit
exit 0

$ pnpm -w run lint
$ biome check .
Checked 146 files in 81ms. No fixes applied.
exit 0

$ pnpm test
Test Files  72 passed | 4 skipped (76)
     Tests  702 passed | 7 skipped (709)
exit 0
```

## 回滚

单次 `git revert` 即可整体复原：47 条 rename 全部是可逆的路径变更，加上 `TROUBLESHOOTING.md` 的一行引用与新增的 `docs/README.md`；归档文档的正文从未被修改。
