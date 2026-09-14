# T2 评估结果记录格式

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 1.3。

**作用**：固定「一次评测要记什么、怎么算、写在哪个字段」，让 baseline 与后续候选的两次运行**可以直接对表**。

**边界**：本文件只定义格式，不定义通过门槛（门槛在任务 5.2）。格式不引入新的运行时依赖，全部由 `scripts/t2-eval.ts` 写出。

对应 spec 场景（`t2-memory-evaluation` → Candidate is compared with the baseline）要求的五项必须都有落点：召回质量、误召回、证据完整性、延迟、降级行为。

---

## 1. 两层产物

| 产物 | 路径 | 用途 |
| --- | --- | --- |
| 原始记录 | `docs/evaluation-reports/t2/<label>-run.json` | 机器可读，含每次 recall 的原始返回、attempts 和逐场景指标；A/B 比对以它为准 |
| 可读报告 | `docs/evaluation-reports/t2/<label>-run.md` | 由同一份 JSON 渲染，供人和评审阅读；**不手改** |

`<label>` 是运行标签：baseline 用 `baseline`，候选用候选名（例如 `--label memvid`）。两条命令：

```bash
node scripts/t2-eval.ts --label baseline-local --embedding-mode local   # 本地 embedding 档（基线默认）
node scripts/t2-eval.ts --label baseline-none  --embedding-mode none    # 无 embedding 档
node scripts/t2-eval.ts --label memvid-bm25    --embedding-mode none    # 候选用候选名 + 档位
```

同一 dataset + 同一 top-k + 同一 machine 是可比的前提；模型档位（无 embedding / 本地 / 云端）变化时另开 label。

## 2. 运行级字段（顶层）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `runId` | string | `<label>-<ISO 时间戳>`，唯一标识一次运行 |
| `startedAt` / `finishedAt` | ISO string | 运行起止 |
| `dataset` | object | `{datasetId, version, locale, path}`，锁住输入 |
| `environment` | object | `{platform, node, embeddingModel, embeddingMode, embeddingProfile, label, backendProbes[]}`，锁住环境与 embedding 档位 |
| `privacy` | object | `{embeddingMode, outboundEndpoint, outboundAttempts, contentLeftMachine, note}`：外发边界记账，见 §5.3 |
| `corpus` | object | `{memoryCount, storedCount, projectBank, storeFailures[]}`，语料写入结果 |
| `resources` | object | `{rssBeforeBytes, rssAfterBytes, rssDeltaBytes, dataDirBytes}` |
| `scenarios` | array | 逐场景记录，见 §3 |
| `degradationProbes` | array | 受控降级探针，见 §5 |
| `summary` | object | 聚合指标，见 §4 |

## 3. 逐场景记录（`scenarios[]`）

| 字段 | 类型 | 计算口径 |
| --- | --- | --- |
| `scenario` | object | 场景集原始定义（query / groundTruth / bridge / expectation / answer），**原样回抄**，保证报告可脱离 dataset 单读 |
| `metrics.hit` | boolean | `groundTruth` 中任一 id 出现在 top-k |
| `metrics.hitRank` | int \| null | 第一个 `groundTruth` 命中的位次（1 起） |
| `metrics.bridgeHitRank` | int \| null | 第一个 `bridge` 命中的位次；bridge 是到达答案的中间证据 |
| `metrics.returned` | int | 去重截断后实际返回条数 |
| `metrics.precision` | 0-1 | `(groundTruth ∪ bridge) 命中数 / returned` |
| `metrics.falseRecallCount` / `falseRecallRate` | int / 0-1 | 误召回 = 返回结果中**既非 groundTruth 也非 bridge** 的条目数 / 占比 |
| `metrics.mrr` | 0-1 | `1 / hitRank`，未命中记 0 |
| `metrics.evidenceCompleteRate` | 0-1 \| null | 返回条目的 `source` 可解出 `kind` **且** `prov` 的比例；**返回为空时记 `null`**，不参与聚合 |
| `metrics.latencyMs` | int | 该场景**全部 bank 调用**的墙钟时间之和（project scope 会查两个 bank） |
| `degradation` | object | 见 §5 |
| `results[]` | array | 归一化后的 top-k：`{bank, datasetId, datasetRank, content, score, hasKind, hasProvenance}` |

`datasetId` 由 `source` 里的 `prov=t2eval/<version>#<id>` 解出，因此**证据来源就是身份标识**：一条结果只要能对上标准答案，就同时证明它带着可追溯的来源。

## 4. 聚合指标（`summary`）

| 字段 | 口径 |
| --- | --- |
| `hitRate` | 全部场景命中比例 |
| `expectedHitRate` | 仅 `expectation=hit` 场景的命中比例；`observe` 场景（多跳等已知难点）不拉低该值，但仍进 `hitRate` |
| `mrr` | 逐场景 MRR 的算术平均 |
| `falseRecallRate` | 逐场景误召回率的算术平均 |
| `evidenceCompleteRate` | 非空场景的 `evidenceCompleteRate` 算术平均，全空记 `null` |
| `latencyMs` | `{p50, p95, min, max}`，最近秩法（nearest-rank）取分位 |
| `byCategory` | 按 `category` 分组的 `{scenarios, hitRate, falseRecallRate, evidenceCompleteRate}` |
| `scenarios` / `totalDurationMs` | 场景数 / 运行总耗时 |

`expectation` 的语义：`hit` = 基线必须命中，未命中就是缺陷；`observe` = 记录事实，不判缺陷（中文多跳正是本次要量化差距的地方）。

## 5. 降级结果格式

三类降级都要能落到结构化字段，而不是只留一句人话。

### 5.1 场景内降级（`scenarios[].degradation`）

| 字段 | 类型 | 来源 |
| --- | --- | --- |
| `activeBackend` | string \| null | 实际执行召回的后端；null 表示没有任何后端可用 |
| `attempts[]` | `{backend, ok, error?}` | 回退链逐项探测结果（mnemosyne → ripgrep → qmd），`error` 为有界错误码 |
| `embeddingAvailable` | boolean | `explain.embedding.available`；**不可作为失败信号**，云端 provider 挂掉时仍为 `true` |
| `embeddingContributed` | boolean | 是否真有返回行吃到向量贡献（`voice_scores.vec > 0`）。这是向量实际生效的唯一可靠观测 |
| `fallback` | boolean | 向量不可用，或 `wm_primary` 阶段 `fallback_used=true`，或**声称可用但无任何向量贡献**（`vector-no-contribution`） |
| `fallbackStages[]` | string[] | 触发降级的阶段名。注意 `em_fallback` 在**健康运行**里也会出现（episodic 层为空时必现），不构成降级证据；降级记号是 `wm_primary` 与 `vector-no-contribution` |
| `warning` | string? | 后端失败时的有界原因，例如 `recall-failed` / `all search backends failed` |

### 5.2 受控降级探针（`degradationProbes[]`）

每次运行固定执行两个探针，验证降级路径**可记录**，不改变 baseline 行为：

| 字段 | 说明 |
| --- | --- |
| `label` | `backend-missing`（PATH 中无任何后端）/ `backend-error`（后端进程启动失败） |
| `backendName` | 成功执行的 backend，失败时 `null` |
| `observed` | 实测结果，格式 `recall-succeeded` 或 `backend-failed:<有界原因>`；原因只保留首部错误码，**脱敏绝对路径与 home 目录** |
| `resultCount` | 返回条数，降级时应当为 `0` |
| `expectedWarning` | 引用 `src/search/selector.ts` 的固定文案，标注为「预期」而非实测，避免把源码常量冒充观测 |

同时，每个场景的 `attempts` 覆盖「后端可用性」这一档降级；`warning` 覆盖「后端中途失败」这一档。

### 5.3 云端 embedding 档探针（`mode: "embedding-probe"`）

云端档**不跑全套场景**：没有真实 provider 时只能用假向量，得到的召回质量是假数字。改用有界探针记录「可记录」本身，记录形状（`node scripts/t2-eval.ts --label baseline-cloud-probe --embedding-mode cloud --probe-only`）：

| 字段 | 说明 |
| --- | --- |
| `mode` | 固定 `"embedding-probe"`，与全套运行的记录区分开 |
| `probe.store` | `{observed, latencyMs, outboundAttempts}`：embedding 失败是否阻断写入 |
| `probe.recall` | `{ok, latencyMs, resultCount, vecScore, denseScore, ftsScore, embeddingAvailable, fallbackStages}`：是否降级到 FTS |
| `privacy` | 与全套运行同构；`outboundAttempts` 是 sink 实际收到的请求数 |

关键约束：探针的 endpoint 指向**本机 sink**（只计数并返回 503，不转发），因此 `contentLeftMachine` 恒为 `false`。**不得**把它指向真实 provider——这一点写在 `embedding-modes.md` 的执行协议里。

## 6. 脱敏与有界
- 报告与原始记录**不落记忆正文之外的任何用户数据**；正文来自场景集本身（虚构语料），标注 40 字符预览。
- 错误原因统一走 `boundedReason()`：取最后一行非空、把 home 与临时目录替换为 `~` / `<tmp>`、压平空白、截断 120 字符。
- 数字全部有界：所有比例 ∈ [0,1]，位次为整数或 null，字节数为整数。

## 7. 生成与复现

```bash
node scripts/t2-eval.ts --label baseline-local --embedding-mode local   # 20s 左右
pnpm typecheck && pnpm -w run lint && pnpm test
```

runner 的隔离方式：`MNEMOSYNE_DATA_DIR` 指向临时目录，语料从 `scenarios.zh.json` 重建，`MNEMOSYNE_LLM_ENABLED=false`，运行结束删除临时目录（`--keep` 可保留排障）。**不读写用户真实 bank，不修改 `src/**`。**

场景集在跑之前先做 fail-closed 校验（id 唯一、正文/证据/来源非空、groundTruth 必须存在于语料且落在对应 bank、confidence 越界即拒绝）；校验失败直接 exit 1，不产生任何指标。
