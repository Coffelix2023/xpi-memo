# Task 3 Report — 三档模型协议、证据图与派生提案映射

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 3.1 / 3.2 / 3.3。

## 目的

前两组任务确定了「跟谁比」（基线）和「谁有资格比」（候选）。这一组确定**怎么比**以及**比出来的东西往哪放**：

- 三档 embedding 各自怎么跑、边界在哪、失败记什么（3.1）；
- 关系层用什么边、权重多大、什么时候关掉，以及**为什么它不能变成第二个事实来源**（3.2）；
- T2 派生出来的提案怎么落进**已经存在**的候选生命周期，不改结构、不新开通道（3.3）。

## 实现

### 3.1 `docs/evaluation-reports/t2/embedding-modes.md`

定义了 `none` / `local` / `cloud` 三档的执行协议、隐私边界、延迟口径与失败分类，并把它实现为 runner 的 `--embedding-mode`（只注入环境变量，不动 `src/**`）。

云端档的关键设计：**端点是本机 sink**（独立子进程，只计数并返回 503，不转发任何内容）。只用它验证「外发尝试次数与失败行为可记录」，评测脚本永远不把 endpoint 指向外网。

实测结果（同一场景集，12 场景）：

| | `none` | `local` |
| --- | --- | --- |
| 命中率 | 66.7% | 66.7% |
| MRR | 0.667 | 0.667 |
| 误召回率 | **33.1%** | 40.0% |
| 延迟 p50 | **567 ms** | 736 ms |

**同一个命中集合、同一个位次。** 英文 embedding 在中文场景里没有多命中一条，只多带进 2–3 条不相关记忆、每次查询多花 169 ms。

### 3.2 `docs/evaluation-reports/t2/evidence-graph.md` + `evidence-graph.example.json`

5 种封闭边类型（`supports` / `contradicts` / `supersedes` / `temporal-next` / `related`），端点必须引用原始 T1 memory id 或 L0 (sessionId, position)，`graphBonus` 上限 0.15 且只在已召回结果之间重排，5 条关闭条件。

`scripts/t2-contract-check.ts` 用 14 条断言把它变成可执行的：正向证明「被支撑的一端才拿加成、且原始 provenance 不被图谱 id 取代」，负向证明「只有图谱没有原文的结果必须被丢」。

### 3.3 `docs/evaluation-reports/t2/t2-proposal-mapping.md` + `t2-proposal.example.json`

映射到**已存在的三处**：`PromotionRequest`（`src/promotion-policy.ts`）、`PendingCandidate`（`src/pending-candidate.ts`）、`candidate_created` L0 payload（`src/memory-activation.ts:295`）。

关键发现：`promotion-policy` 里早就预留了 T2 通道——`sourceLayer: "T2"` 对应证据类型 `t2-handoff`（与 L0 抽取的 `l0-conclusion` 分离）。**不需要新结构，只需要按现有字段填。**

同时定义了 6 条拒收条件（C1–C6），其中 C1（无原始证据引用）与 C4（无 revision 回滚引用）是核心。

## 特点与边界

- **不实现运行时**：三份文档 + 两个示例 JSON + 一个校验器，`src/**` 零改动。
- **云端档不跑全套**：没有真实 provider 时只能得到假向量，跑出来的召回质量是假数字。因此云端档只做有界探针，完整 A/B 留给 5.1。
- **本机 sink 必须独立进程**：runner 用 `spawnSync` 调 CLI，会阻塞 Node 事件循环，同进程的 HTTP server 无法应答，第一次实现直接死锁到 120 s 超时。这个坑写进了代码注释。
- **发现并修掉了一个观测缺口**：云端 embedding 挂掉时 `explain.embedding` 仍报 `{"available": true, "computed": true}`，`wm_primary` 也报未降级，只有 `voice_scores.vec = 0` 能看出异常；而 `em_fallback` 的 `fallback_used: true` 在健康运行里同样出现，不能当失败信号。记录格式因此新增 `embeddingContributed` 与 `vector-no-contribution` 记号。**这是 4.3 设计诊断字段时必须补的一块。**
- **校验器有负向对照**：把示例里的边类型改成 `caused-by` 后断言降到 23/25 并 exit 1，恢复后回到 25/25 —— 证明断言不是空转。

## 验证

- `node scripts/t2-contract-check.ts` → **PASSED: 25 断言全部通过**（exit 0）
- 负向对照：变异一条边类型 → **FAILED: 2/25**（exit 1）；恢复 → PASSED
- `node scripts/t2-eval.ts --label baseline-none --embedding-mode none` → 12 场景完整跑通
- `node scripts/t2-eval.ts --label baseline-local --embedding-mode local` → 12 场景完整跑通
- `node scripts/t2-eval.ts --label baseline-cloud-probe --embedding-mode cloud --probe-only` → 探针跑通，`contentLeftMachine=false`，外发尝试 9 次全部落在 `127.0.0.1`
- `pnpm typecheck` → 通过（exit 0）
- `pnpm test` → 702 passed | 7 skipped
- `pnpm -w run lint` → 本组新增文件全部通过；仓库整体仍只有既有的 `docs/reports/token-analysis.html`
- `openspec` 进度 → 10/16 完成

## 附带修正

盘点过程中发现 `baseline-run.*` 已被分档运行取代（同一配置、新 schema），删除以免同一基线出现两份记录；`baseline.md` / `baseline-findings.md` / `result-format.md` 的引用已同步到 `baseline-local-run.*`。
