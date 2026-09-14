# 5.2 治理门槛审查

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 5.2。

**审查范围**：静态矩阵（2.x）+ 基线实测（1.x / 3.1），**不含候选运行数据**（见 `ab-evaluation-scope.md`）。

**审查结论**：**没有任何候选通过完整门槛审查。** 两个候选因门槛硬失败被直接拒绝；另两个门槛形式上通过，但在「无运行数据」的前提下不能判为通过，只能判为**证据不足、维持现状**。

---

## 1. 门槛条款

来自本变更的 `t2-memory-evaluation`（Candidate MUST pass governance gates）与 `design.md` 的 Decision 1/3/5：

| 编号 | 条款 | 判定依据 |
| --- | --- | --- |
| G1 | 不增加热路径模型调用 | 召回路径上不得出现 LLM/chat 调用 |
| G2 | 保持精确删除 | 能按单条 id 删除，不破坏现有 `memory-forget-exact-id` 语义 |
| G3 | 保持回滚能力 | 派生数据与 T1/L0 分离；删掉即回到接入前，无需迁移主库 |
| G4 | 保留完整证据链 | 派生结果必须带来源引用（`t2-handoff` + L0 位次/session） |
| G5 | 不成为直接写入者 | 只能读取 L0/T1 并生成派生提案，不得直接写 T1 |
| G6 | 改善中文召回 | 需运行数据支撑 |
| G7 | 不引入不可关闭的云端依赖 | 默认本地或可完全关闭外发 |

**判定规则**：任何一条**硬失败**即拒绝；全部通过但缺运行数据 → **证据不足，不得判为通过**。

## 2. 逐候选裁决

### 2.1 memU — 拒绝（G7 硬失败）

| 条款 | 判定 | 依据 |
| --- | --- | --- |
| G7 云端依赖 | ❌ **硬失败** | 本地模式仍必须云端 embedding key（`README.md:100`「Embedding key required」）；`src/memu/embedding/backends/` 只有 `doubao`/`jina`/`openai`/`openrouter`/`voyage` 五个 HTTP 实现，**无任何本地后端** |
| G3 回滚 | ✅ | 派生数据在独立 SQLite / Postgres |
| G5 不直接写入 | ✅ | `MemoryService` 不做 LLM 调用，写入经 `commit_results`（`README.md:96`） |
| G2 精确删除 | ⚠️ | 只有 filter 级 `clear_recall_files(where=...)`，无单条 id 删除 |
| G4 证据链 | ✅ | 记忆/技能 Markdown 全文入库，可引用 |
| G1 热路径 | ✅ | 蒸馏由宿主 agent 完成，服务侧不调模型 |

**裁决：拒绝。** 理由：召回路径强制外发查询与记忆正文到第三方 embedding 服务，与本项目「本地优先、可完全关闭外发」的边界不兼容。

**保留的参考价值**（不进运行时）：宿主 agent 自行蒸馏 + 服务侧零模型调用的分工，与 `design.md` Decision 5（进化放在离线生命周期）同向，可作 3.3 设计的旁证。

### 2.2 Memori — 拒绝（G2 硬失败 + G3 部分失败 + G5 冲突）

| 条款 | 判定 | 依据 |
| --- | --- | --- |
| G2 精确删除 | ❌ **硬失败** | 公开 API 只有 `delete_entity_memories(entity_id)`（`memori/__init__.py:254`），按实体全删 |
| G3 回滚 | ⚠️ 部分失败 | FAISS 索引与 `memori_*` 表落在**应用自己的库**里（`knowledge-graph.mdx:45-49`、`advanced-augmentation.mdx:142`），回滚要动主库 |
| G5 不直接写入 | ❌ **形态冲突** | 它是 LLM 客户端包装器（`architecture.mdx`：intercepts 每一次 outbound 请求），要求把 Pi 的模型调用改道经它 |
| G7 云端依赖 | ✅ | BYODB + 本地 fastembed（`all-MiniLM-L6-v2`，可经 `MEMORI_EMBEDDINGS_MODEL` 替换） |
| G1 热路径 | ✅ | `recall.py` 只有本地 embedding，无 chat 调用 |
| G4 证据链 | ✅ | 六类记忆 + 语义三元组图谱 |

**裁决：拒绝。** 理由：① 只能整实体删除，接入即破坏现有精确删除语义；② 形态是调用方改写型包装器，与「可被读取的派生检索层」边界（Decision 1）直接冲突。

**保留的参考价值**：其六类记忆分类学（Facts / Preferences / Skills / Rules / Events / Agent Trace）可作 3.3 字段映射的参照词表。

### 2.3 memvid — 证据不足（形式通过，不得判为通过）

| 条款 | 判定 | 依据 |
| --- | --- | --- |
| G1 热路径 | ✅ | `src/memvid/ask.rs` 无 HTTP 客户端引用，只装配上下文 |
| G2 精确删除 | ✅ | `delete_frame(frame_id)` + tombstone + `vacuum()`（`src/memvid/mutation.rs:3244` / `:3013`） |
| G3 回滚 | ✅ | 派生物是单个 `.mv2` 文件，删除即回滚 |
| G4 证据链 | ✅ | frame payload 即原文，可回指 |
| G5 不直接写入 | ✅ | 嵌入式库，不主动写 T1 |
| G7 云端依赖 | ✅ | `api_embed` 是独立 cargo feature，默认关 |
| **G6 改善中文召回** | ❓ **无数据** | 本地 ONNX 模型表闭死（未知名静默回退英文默认，`src/text_embed.rs:434`/`:216`），只能测 BM25 档；**未跑** |

**裁决：证据不足。** 理由：门槛形式全过，但唯一的价值主张（用非 LLM 的 `graph_search.rs` 提升中文多跳）没有运行数据支撑。按判定规则，**不得判为通过**。

### 2.4 agentmemory — 证据不足（形式通过，不得判为通过）

| 条款 | 判定 | 依据 |
| --- | --- | --- |
| G1 热路径 | ✅ | LLM 压缩默认关（`README.md:90`，需 `AGENTMEMORY_AUTO_COMPRESS=true`） |
| G2 精确删除 | ✅ | `memory_governance_delete` 工具 + auto-forget（`README.md:1095`/`:997`） |
| G3 回滚 | ✅ | 派生物是独立 data dir 的 `state_store.db` |
| G4 证据链 | ✅ | observations / memories 存 KV，可回指 |
| G5 不直接写入 | ⚠️ | 它自己就是写入者（有自己的捕获钩子），作为 T2 派生层使用需限制为只读消费 |
| G7 云端依赖 | ✅ | keyless 默认无向量；远程 provider 由 key 自动探测，可保持关闭 |
| **G6 改善中文召回** | ❓ **无数据** | 本地 embedding 是英文 `all-MiniLM-L6-v2`；BM25 需可选 jieba；**未跑** |

**裁决：证据不足。** 另有未量化的成本：常驻 iii-engine v0.11.2 + 4 个端口（`README.md:80-82`/`:94`），在 Pi 扩展进程模型下是否可接受无从判断。

## 3. 汇总表

| 候选 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | 裁决 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| memU | ✅ | ⚠️ | ✅ | ✅ | ✅ | — | ❌ | **拒绝**（G7 硬失败） |
| Memori | ✅ | ❌ | ⚠️ | ✅ | ❌ | — | ✅ | **拒绝**（G2 硬失败 + G5 冲突） |
| memvid | ✅ | ✅ | ✅ | ✅ | ✅ | ❓ | ✅ | **证据不足** |
| agentmemory | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❓ | ✅ | **证据不足** |
| **基线（现状）** | ✅ | ✅ | ✅ | ✅ | ✅ | 基准 | ✅ | 保持 |

「直接写入 / 无证据派生 / 不可回滚 / 热路径模型依赖」四类被点名必须拒绝的情形，本次审查的落点：

| 被点名情形 | 命中的候选 | 处置 |
| --- | --- | --- |
| 直接写入 | Memori（调用方包装器，G5） | 拒绝 |
| 无证据派生 | 无候选命中（T2 侧由 3.3 的 C1/C4 拒收条件兜住） | — |
| 不可回滚 | 无候选完全命中；Memori 部分命中（G3） | 拒绝（叠加 G2/G5） |
| 热路径模型依赖 | 无候选在召回路径上依赖 LLM；但 memU 依赖热路径**云端 embedding**（G7） | 拒绝 |

## 4. 审查自家设计的部分

门槛不只审候选，也审本变更产出的 T2 设计本身。已用可执行断言核过：

| 条款 | 断言 | 状态 |
| --- | --- | --- |
| 不成为直接写入者 | `t2-proposal-mapping.md` C1–C6：T2 只能触发「入队」，确认/拒绝只能是用户动作 | ✅ 断言 N4 覆盖 |
| 保留完整证据链 | `sourceRefs` 含 T1 + L0 引用，L0 payload 字段与实现一致 | ✅ 断言 P1/P2 覆盖 |
| 可回滚 | `evidence.revision` 必填；C4 缺 revision 即拒收 | ✅ 断言 N3 覆盖 |
| 不增加热路径模型调用 | 图谱只做有界重排，`GRAPH_BONUS_MAX=0.15`，不引入 LLM 抽取 | ✅ 断言 P1 覆盖 |
| 失败不传播 | `t2State != "ok"` 时 `baselineBacked` 必须为 true | ✅ 断言 D2 覆盖 |
| 不打断用户 | 只有候选确认可打开提示框 | ✅ 断言 V4 覆盖 |

`node scripts/t2-contract-check.ts` → 90 断言全部通过。

## 5. 结论

**没有任何候选通过完整门槛审查**，因此本变更的结论落在 proposal 预置的分支上：**保持现有系统不变**（见 `adapter-recommendation.md`）。

需要强调的一点：memvid 与 agentmemory 的「证据不足」**不等于**「接近通过」。它们的中文价值主张恰好落在基线最痛的地方（`multi_hop_zh` 0%），而这一点没有数据。在拿到数据之前把它们写成「通过」或「候选」，都是在用一个更弱的证据替换一个更强的结论。
