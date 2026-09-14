# T2 三档 embedding 执行协议

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 3.1。

**作用**：规定评测在**无 embedding / 本地 embedding / 云端 embedding** 三档下分别怎么跑、边界在哪、失败时记什么，并给出这三档在 baseline 上的实测结果。

**边界**：本文件定义协议与记录方式，不定义通过门槛（5.2），不接入候选（5.1）。

---

## 1. 三档定义

档位标识就是 runner 的 `--embedding-mode` 取值，一个档位一次运行，标签命名 `<目标>-<档位>`。

| 档位 | 标识 | 语义 | 向量推理位置 | 召回路径上的模型调用 |
| --- | --- | --- | --- | --- |
| 无 embedding | `none` | 只用全文/词法检索（FTS/BM25），彻底不生成向量 | 无 | 无 |
| 本地 embedding | `local` | 向量在**本机进程内**推理，模型权重已在本地 | 本机 | 本地 ONNX 推理（无网络） |
| 云端 embedding | `cloud` | 向量由 HTTP provider 生成 | 远端 | HTTP 调用（**外发**） |

在基线（Mnemosyne）上的落地方式：

| 档位 | 注入 env | 实际效果 |
| --- | --- | --- |
| `none` | `MNEMOSYNE_EMBEDDINGS_OFF=true` | `dense_score` 恒为 0，权重落在 `fts`/`keyword`/`importance` 上 |
| `local` | 无（默认） | 本地 fastembed `BAAI/bge-small-en-v1.5` |
| `cloud` | `MNEMOSYNE_EMBEDDINGS_VIA_API=true` + `MNEMOSYNE_EMBEDDING_API_URL` + `MNEMOSYNE_EMBEDDING_API_KEY` | 走 OpenAI 兼容 `/embeddings` HTTP 接口 |

`--embedding-mode` 的实现只注入这三组 env，不改任何 `src/**` 代码（`scripts/t2-eval.ts` 的 `embeddingEnvFor`）。

## 2. 隐私边界（每档一行，必须可记录）

| 档位 | 什么会离开本机 | 记录字段 | 允许的 endpoint |
| --- | --- | --- | --- |
| `none` | 无 | `privacy.contentLeftMachine=false`、`outboundEndpoint=null`、`outboundAttempts=0` | — |
| `local` | 无（模型权重若需下载，一次性的模型拉取不算记忆内容外发，但必须在报告里注明是否已本地缓存） | 同上 | — |
| `cloud` | 查询文本 + 被写入的记忆正文 | `privacy.outboundEndpoint` 记录实际 endpoint，`outboundAttempts` 记录实际尝试次数 | **评测中只允许 `127.0.0.1` 的本机 sink**；真实 provider 只允许在 5.1 且必须先确认用户授权 |

`cloud` 档的硬规则：**评测脚本永远不把 `MNEMOSYNE_EMBEDDING_API_URL` 指向外网地址**。本机 sink（只计数、返回 503、不转发）足以验证「尝试次数与失败行为可记录」，而任何真实外发都需要单独的用户授权，不能由评测脚本默认打开。

这条规则的生命周期不止于评测：它是 5.2 门槛审查里「云端 embedding 泄露敏感内容」风险的对照组——**先证明边界可观测，再谈是否允许跨过去**。

## 3. 延迟记账口径

- 延迟只记**该场景全部 bank 调用的墙钟时间之和**（project scope 会查 project + default 两个 bank）。
- 三档之间 `p50` 的差值主要是向量推理成本：`local` 每查一次做一次 ONNX 推理，`cloud` 多一次往返，`none` 两者都没有。
- 首次 `local` 运行可能包含模型加载的一次性开销，因此本文件只比较**同一次运行的内部一致性**与**多档之间的相对差**，不把绝对值当基准线。

## 4. 失败行为（每档一类，必须可记录）

| 档位 | 受控失败注入 | 记录位置 | 期望行为 |
| --- | --- | --- | --- |
| `none` | 无向量可用这一状态本身 | 每个场景的 `degradation.embeddingAvailable=false`、`embeddingContributed=false`、`fallback=true` | 召回照常返回，只是没有 `dense` 贡献（已实测：12/12 场景） |
| `local` | 模型文件缺失（未下载） | `degradation.embeddingContributed=false` + `vector-no-contribution` 记号；`warning` 有界原因 | 降级到 FTS，不抛异常给用户（**未实测**：需先删除本地模型缓存才能构造，属 5.1 可选项） |
| `cloud` | endpoint 返回 503 | `probe.store.observed` / `probe.recall.*` / `privacy.outboundAttempts`（已实测，见 §5.3） | **写入不被 embedding 失败阻断**；召回降级到 FTS（已实测） |
| 三档通用 | 后端整体不可用 | `scenarios[].degradation.attempts`、`degradationProbes[]` | 记录 attempt 与固定 warning，会话继续 |

## 5. 实测结果（baseline，同一场景集 v1.0.0）

命令：

```bash
node scripts/t2-eval.ts --label baseline-none  --embedding-mode none
node scripts/t2-eval.ts --label baseline-local --embedding-mode local
node scripts/t2-eval.ts --label baseline-cloud-probe --embedding-mode cloud --probe-only
```

### 5.1 `none` vs `local` 全套对比（12 场景）

| 指标 | `none` | `local` | 差 |
| --- | --- | --- | --- |
| 命中率（全部） | 66.7% | 66.7% | **0** |
| 命中率（`expectation=hit`） | 88.9% | 88.9% | **0** |
| MRR | 0.667 | 0.667 | **0** |
| 误召回率 | **33.1%** | 40.0% | local 更差 6.9pp |
| 证据完整率 | 100% | 100% | 0 |
| 延迟 p50 | **567 ms** | 736 ms | local 慢 169 ms |
| 外发尝试 | 0 | 0 | 0 |
| `embeddingContributed` | false（全部场景） | true（12 个场景中 11 个） | 只有 `s-mix-02` 例外：该场景返回空结果，无行可计 |
| `degradation.fallback` | true（embeddingAvailable=false） | false（除空结果场景） | 与档位定义一致 |

**同一个命中集合、同一个位次**，差异只在两处：`s-mix-01` 从 `0/1` 误召回变成 `2/3`，`s-hop-01` 从 `1/2` 变成 `2/3`。

### 5.2 这条数据的含义

在本次中文场景集上，基线自带的英文 embedding 模型（`bge-small-en-v1.5`）：

- **没有多命中一条**；
- **多带进来 2–3 条不相关记忆**（误召回率 +6.9pp）；
- **每次查询多花约 174 ms**。

原因是清楚的：对中文 query，`fts`/`keyword` 才是真正在工作的一路；英文向量模型给出的相似度是噪声，而噪音在融合分里占 0.5 权重，于是既挤掉精度也不提升召回。

**这不是「embedding 没用」的结论，而是「英文 embedding 对中文没用」的结论。** 它把 3.1 之后的设计空间压到了两条：要么换中文/多语模型，要么在中文场景下干脆关掉向量只走 FTS。

### 5.3 `cloud` 档探针结果（不落真实外发）

| 探针 | 结果 | 延迟 | 外发尝试 |
| --- | --- | --- | --- |
| `store` | `stored:<id>` —— **embedding 失败不阻断写入** | 4.7 s | 6 |
| `recall` | `ok=true`，1 条结果，`vec=0` / `dense=0` / `fts=0.375` —— **降级到 FTS** | 2.2 s | 累计 9 次 |

`contentLeftMachine=false`：endpoint 是本机 sink，9 次尝试全部落在 `127.0.0.1`，内容未出机器。

**两个额外发现**（都值得记进 5.3 的接入建议）：

1. 云端 embedding 挂掉时，Mnemosyne **照常写入记忆**（只是没有向量）。也就是说「embedding 服务不可用」不会让记忆丢失，只会让语义召回失效——这是好性质，但**必须能被观测到**，否则就是静默降级。
2. 两条命令触发 9 次外发尝试（含重试）。**重试次数会在真实场景里成倍放大外发量**，这属于隐私边界记账必须统计的项，不能只记「用了云端 embedding」这一句。

### 5.4 一个必须修掉的观测缺口

云端 embedding 失败时，`--explain` 的原始字段是：

```json
explain.embedding = {"available": true, "computed": true}
stages = [{"name":"wm_primary", ... "fallback_used": false}, {"name":"em_fallback", ... "fallback_used": true}]
voice_scores = {"vec": 0.0, "fts": 1.0, "keyword": 1.0, ...}
```

即：**向量完全没起作用，但 `available` 与 `computed` 都报 `true`**，`wm_primary` 也报没有降级。唯一能看出异常的是 `vec = 0`。

更麻烦的是 `em_fallback` 的 `fallback_used: true` 在**健康运行里同样出现**（episodic 层为空时必现），所以它也不能当失败信号。

因此本任务在记录格式里新增了 `embeddingContributed`（是否存在 `vec > 0` 的返回行），并把「声称可用但无任何向量贡献」记成 `vector-no-contribution`。**这是 4.3 设计诊断字段时必须补的一块**：只靠 `embedding.available` 会把云端 embedding 静默失效报成一切正常。

## 6. 对后续任务的约束

- **5.1**：候选必须至少覆盖 `none` 与 `local`（或候选自身的本地模型）两档；`cloud` 档是否跑由用户授权决定，跑则必须在报告里写明外发端点、次数与内容范围。
- **5.2**：`none` 档在中文上的表现（命中率与 `local` 相同、误召回更低、延迟更低）是门槛审查的硬输入——**任何候选若只能靠在中文上无效的英文向量取胜，就没有通过的理由**。
- **3.2**：多跳缺口在 `none` 与 `local` 两档都未改善（`multi_hop_zh` 命中率两档都是 0%），说明要补的是**关系**而不是向量质量，这直接支持证据图只做低权重重排信号的设计。
