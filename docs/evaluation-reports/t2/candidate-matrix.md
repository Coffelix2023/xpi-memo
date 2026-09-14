# T2 候选静态评估矩阵

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 2.1 / 2.2 / 2.3。

**作用**：在安装任何东西之前，先用源码和官方文档判断四个候选是否**有资格**进入运行评测。静态阶段的任务不是打分排名，而是**淘汰**——把「装完才发现它必须联网/必须把正文发给云端/不能精确删除」这类事后返工挡在前面。

**边界**：本文件只做只读静态审查。**没有安装任何候选**，没有执行任何候选的代码，没有下载模型权重。所有结论都标注了来源文件与行号，可逐条复核。

---

## 0. 评估方法

- **快照**：审查固定在上表 commit，不跟随 main 漂移。
- **证据优先级**：① 源码（能证伪 README 的只有源码）；② 仓库内官方文档 / ADR / 格式规格；③ README。
- **「未验证」是合法结论**：静态看不到的行为（例如实际删除是否级联清理派生索引）一律记为「待运行评测验证」，不猜。
- **热路径模型调用**的定义先钉死，否则四个候选会被误判：
  - **LLM / chat 调用出现在召回路径** = 硬门槛不通过（本变更明确禁止）。
  - **embedding 推理出现在召回路径** = 与基线同级（基线每查一次也做一次本地 embedding），**不算**违规；但**云端** embedding 推理属于「外发内容」边界，必须在隐私维度单独记账。

## 1. 候选快照

| 候选 | 仓库 | 审查版本 | 语言 | Stars | 许可证 |
| --- | --- | --- | --- | --- | --- |
| memvid | `memvid/memvid` | `e6bd9f7b9c38`（2026-07-14） | Rust（另有 Python SDK `memvid-sdk`） | 16.5k | Apache-2.0 |
| memU | `NevaMind-AI/memU` | `08e1ed4cdf4c`（2026-09-10） | Python（`memu-cli`） | 14.4k | Apache-2.0 |
| Memori | `MemoriLabs/Memori` | `10d650150071`（2026-09-03） | Python + Rust 核心（另有 `memori-ts`） | 16.7k | Apache-2.0 |
| agentmemory | `rohitg00/agentmemory` | `e04ba88819c3`（2026-08-23） | TypeScript（Node ≥ 20） | 28.4k | Apache-2.0 |

**许可证结论**：四个都是 Apache-2.0，无 copyleft、无「开源版禁商用」附加条款。许可证不是淘汰维度。（memU 在 GitHub API 上显示 `NOASSERTION`，因为它把许可证放在 `LICENSE.txt`；文件内容确认是标准 Apache-2.0。Memori 的 `LICENSE` 同为 Apache-2.0。）

## 2. 任务 2.1 静态矩阵

| 维度 | memvid | memU | Memori | agentmemory |
| --- | --- | --- | --- | --- |
| **许可证** | Apache-2.0 | Apache-2.0 | Apache-2.0 | Apache-2.0 |
| **存储** | 单文件 append-only `.mv2`，嵌入式 | SQLite（sqlmodel/alembic）或 Postgres+pgvector；记忆/技能以 Markdown 分段入表 | **BYODB**：SQLite/Postgres/MySQL/MariaDB/TiDB/Oracle/CockroachDB/OceanBase 自带库 + FAISS | iii-engine StateModule 文件型 SQLite KV（约 40 个 namespace scope）；索引在进程内，快照回写 KV |
| **依赖** | Rust 1.85+ 编译；功能 flag 全部 opt-in（`lex` BM25 / `vec` ONNX+HNSW / `clip` / `whisper` / `api_embed` 云端 / `encryption`）；无必需外部服务 | `httpx` `numpy` `openai` `pydantic` `sqlmodel` `alembic` `pendulum`；Postgres 需 `pgvector` | `aiohttp` `botocore` `faiss-cpu` `grpcio` `protobuf` `numpy` `pyfiglet` `requests`（依赖最重） | **必须常驻 iii-engine v0.11.2 Rust 二进制**（自动装到 `~/.agentmemory/bin`，或 Docker 镜像）；Node 常驻服务占 4 个端口（3111/3112/3113/49134）；npm 依赖含 `@anthropic-ai/claude-agent-sdk` |
| **中文 embedding** | ✗ 本地仅 4 个内置模型（`bge-small-en-v1.5` / `bge-base-en-v1.5` / `nomic-embed-text-v1.5` / `gte-large`），全部英文或英文为主；**未知名静默回退英文默认模型**，无法装载中文 ONNX | ✗ 本地不可用：embedding backend 只有 5 个 HTTP provider（`openai` / `jina` / `voyage` / `doubao` / `openrouter`），无本地后端 | △ 本地 fastembed，默认 `all-MiniLM-L6-v2`（英文），但模型名可由 `MEMORI_EMBEDDINGS_MODEL` 替换 | △ keyless 默认无向量（BM25）；`EMBEDDING_PROVIDER=local` 用 `Xenova/all-MiniLM-L6-v2`（英文）；中文语义需切 Gemini 云 provider；BM25 侧有可选 CJK 分词（`@node-rs/jieba` + `tiny-segmenter`） |
| **原文保留** | ✓ frame payload 即原文，`.mv2` 是追加写 | ✓ 记忆/技能 Markdown 作为 segment 全文入库 | ✓ 原始对话 + 抽取事实都入库 | ✓ observations / memories 以 JSON 存 KV |
| **删除能力** | ✓ 有按精确 id 的 `delete_frame(frame_id)`：写 tombstone + 状态位，另有 `vacuum()` 回收；规格层定义了 delete frame 类型 | △ 只有过滤级批量 `clear_recall_files(where=...)`，未见按精确 id 的删除接口 | ✗ 只有 `delete_entity_memories(entity_id)`——按实体**全删**，没有单条删除 | ✓ `memory_governance_delete` 工具面 + TTL/矛盾/重要度 auto-forget |
| **运行时形态** | 库（嵌入进程内），零服务 | 库 + CLI；有 10 个 host adapter（含 `memu-pi`） | **LLM 客户端包装器**：必须把应用的模型调用改为经它路由 | MCP/REST 服务器 + 必须常驻的 engine 进程 |

### 2.1.1 逐项证据

**memvid**

- 存储为单文件、追加写、删除用 tombstone：`MV2_SPEC.md:215`（existing frames are never modified in place）、`MV2_SPEC.md:77`（`0x03` Frame delete）、`MV2_SPEC.md:101`（`status`: 0=active, 1=tombstoned）。
- 精确删除：`src/memvid/mutation.rs:3244 delete_frame(frame_id)`，内部 `mark_frame_deleted`（`:2722`）写 tombstone WAL；`:3013 vacuum()` 回收。
- 本地 embedding 模型表与「未知名回退」：`README.md:356-362`；`src/text_embed.rs:434` `LocalTextEmbedder::new` → `get_text_model_info(&config.model_name)`；`src/text_embed.rs:216` `unwrap_or_else(|| default_text_model_info())`；同名单测 `src/text_embed.rs:962-964` 断言 `get_text_model_info("unknown-model").name == "bge-small-en-v1.5"`；模型文件名由 `model_info.name` 派生（`src/text_embed.rs` `ensure_model_file`: `format!("{}.onnx", self.model_info.name)`）。
- 云端 embedding 是独立 feature 且非默认：`Cargo.toml`（`api_embed = { optional = true }`）、`README.md:153`、`README.md:427-440`。
- 无热路径 LLM 调用：`src/memvid/ask.rs`（54KB）全文无 HTTP 客户端引用（grep `reqwest|ureq|http_client|Authorization` 均为空），只有一句注释说明把上下文交给外部 LLM（`ask.rs:552`）——它只做上下文装配，不自己调模型。
- 规则化富化（非 LLM 抽取）：`src/analysis/{auto_tag,ner,temporal,temporal_enrich}.rs`、`src/enrich/{engine,rules}.rs`、`src/enrichment_worker.rs`、`src/graph_search.rs`。

**memU**

- 本地模式下 embedding 强制云端 key：`README.md:100`（「Private · Single-device · **Embedding key required**」）；`README.md:181-186` 配置表（provider 默认 `openai`，可选 `jina`/`voyage`/`doubao`/`openrouter`）；`src/memu/embedding/backends/` 目录只有 `doubao.py jina.py openai.py openrouter.py voyage.py` 五个 HTTP 实现，**没有本地后端**。
- 零热路径 LLM 调用：`README.md:96`「The judgment and synthesis stay inside the agent. `MemoryService` makes no LLM or chat calls; it stores, embeds, and retrieves the skill Markdown the agent prepared.」
- 自我进化由宿主 agent 完成：`README.md:83-94`（record → agent 蒸馏 → commit → 索引到 `skill` track → 检索复用）；`README.md:118`（record 是 scheduled bridging task）。
- 存储后端：`README.md:192-196`（`inmemory` / `sqlite` 暴力余弦 / `postgres` + pgvector）；`src/memu/database/` 下 sqlite（inmemory 同栈）与 postgres 两套仓储。
- 删除：`src/memu/database/repositories/recall_file.py:34 clear_recall_files(where=...)`；`src/memu/database/interfaces.py` 的 `Database` 协议只暴露三个 repo 与 `close()`，未见单条删除。
- Pi 适配器：`pyproject.toml:71`（`memu-pi = "memu.hosts.pi.cli:main"`），另有 claude_code/codex/cursor/openclaw/hermes/workbuddy/cola/generic 共 10 个。

**Memori**

- 架构是 LLM 客户端包装器：`docs/memori-byodb/concepts/architecture.mdx`「**LLM Provider Wrappers** — Wraps your existing LLM client transparently. Intercepts calls, captures messages and responses…」；召回默认「On every LLM call, Memori automatically: intercepts the outbound request … injects … forwards」（同页 Data Flow / `how-memory-works.mdx` How Recall Works）。
- 本地 embedding：`how-memory-works.mdx`「native **fastembed** backend with the default **all-MiniLM-L6-v2** embedding model and cosine similarity」；`memori/_config.py:62` 默认 `all-MiniLM-L6-v2`，`:72-75` 可被 `MEMORI_EMBEDDINGS_MODEL` 覆盖 → **模型可换**。
- 召回路径无 LLM：`memori/memory/recall.py:213 _embed_query` → `embed_texts`；全文无 chat/LLM 调用。
- 抽取用 LLM 但异步：`architecture.mdx`「Advanced Augmentation … Runs asynchronously with zero latency impact」。
- 删除只有实体级：`memori/__init__.py:254 delete_entity_memories(entity_id)`，且 `:257` 明示仅 BYODB 模式可用。
- 存储与派生索引：BYODB（`byodb.mdx`「Use CockroachDB, MariaDB, MongoDB, MySQL, OceanBase, Oracle, PostgreSQL, SQLite, or TiDB」）；表 `memori_entity_fact` / `memori_subject` / `memori_predicate` / `memori_object` / `memori_knowledge_graph`（`knowledge-graph.mdx:45-49`）；向量检索交给 FAISS（`advanced-augmentation.mdx:142`）。
- 依赖：`pyproject.toml:22-33`。

**agentmemory**

- 必须常驻 engine：`README.md:80-82`（Node ≥20 + `curl`/`sh`/`tar` 以便自动安装 iii-engine；原生 Windows 需手工装 pinned `iii.exe`）；`README.md:139`（pins iii-engine v0.11.2，不兼容其他版本）；`README.md:94`（四个端口）。
- 存储：`AGENTS.md`（Engine: iii-sdk WebSocket 到 49134；State: 文件型 SQLite via StateModule；「never bypass iii-engine with standalone SQLite or in-process alternatives」）。
- keyless 默认无向量、本地 embedding 为 opt-in：`README.md:92`（keyless → BM25；`EMBEDDING_PROVIDER=local` → 首次下载 `Xenova/all-MiniLM-L6-v2`，之后本地推理）。
- embedding provider 表：`README.md:1037` 区块（Local / Gemini `gemini-embedding-001` 100+ 语言 / OpenAI / Voyage / Cohere / OpenRouter）。
- 中文 BM25：`README.md:1022`（CJK 需可选 `@node-rs/jieba` + `tiny-segmenter`，否则整段成 token 并提示一次）。
- 删除：`README.md:1095` 起工具表含 `memory_governance_delete`；`:997` auto-forgetting（TTL expiry / contradiction detection / importance eviction）。
- LLM 调用默认关：`README.md:90`（「a provider makes LLM features available, but LLM-written observation compression starts only when `AGENTMEMORY_AUTO_COMPRESS=true` is also set」）。
- 依赖：`package.json`（`@anthropic-ai/claude-agent-sdk`、`@anthropic-ai/sdk`、`iii-sdk@0.11.2`、`zod`；optional：`@huggingface/transformers`、`@node-rs/jieba`、`tiny-segmenter`）。

## 3. 中文 embedding 是四者的分水岭

这一维度直接决定候选对本次评估是否还有意义。基线已经给出的结论是：**单跳中文基线接近可用（`expectation=hit` 场景 88.9%），中文多跳 0%**（见 `baseline-findings.md`）。因此候选必须在「中文语义」或「多跳关系」上至少补一块。

| 候选 | 本地中文语义 | 唯一可选替代 | 判定 |
| --- | --- | --- | --- |
| memvid | ✗ 完全不可得 | 云端 `api_embed`（OpenAI）——违反本地优先 | 只剩 BM25 档可测 |
| memU | ✗ 无本地后端 | 云端 provider（国内可取 `doubao`/`jina`，中文质量好） | 只能测「云端 embedding」档 |
| Memori | △ 依赖换模型后是否真支持中文，静态无法确认 | `MEMORI_EMBEDDINGS_MODEL` 指向多语模型 | 待运行评测 |
| agentmemory | △ 同上（`Xenova/all-MiniLM-L6-v2` 英文） | Gemini 云 provider；或 BM25 + jieba | BM25 档可测，语义档需云端 |

**关键判断**：四个候选**没有一个能在本地提供中文语义 embedding**。这不是巧合——它们都跟随 fastembed/ONNX 生态的英文默认。这条事实本身就是 5.2 门槛审查的重要输入：如果最终结论是「T2 只做低权重重排、embedding 仍由 xpi-memo 侧选择」，那么候选的 embedding 能力并不是选它的理由。

## 4. 任务 2.2 硬门槛结论

三条硬门槛（来自 `t2-memory-evaluation` 的 Candidate MUST pass governance gates 场景 + design Decision 1/3/5）：

- **HG-1 本地或可关闭云端模型**：默认不需要云端凭据即可完整跑召回。
- **HG-2 可回滚派生索引**：派生数据与原始 T1/L0 分离，删掉即可回到接入前状态，不需要迁移主库。
- **HG-3 零热路径 LLM 调用**：召回路径上不出现 LLM/chat 调用。
- **HG-4 精确删除**（附加条件，来自本变更对「现有精确删除不能被破坏」的兼容性要求）：能按单条 id 删除，而不是只能整实体/整库删。

| 候选 | HG-1 本地/可关云 | HG-2 可回滚 | HG-3 零热路径 LLM | HG-4 精确删除 | 门槛结论 |
| --- | --- | --- | --- | --- | --- |
| **memvid** | ✅ 通过（云端 `api_embed` 是独立 feature，默认关） | ✅ 通过（派生物 = 单个 `.mv2` 文件，删除即回滚） | ✅ 通过（召回路径无任何 HTTP/LLM 调用） | ✅ 通过（`delete_frame` + tombstone + vacuum） | **4/4 通过** |
| **agentmemory** | ✅ 通过（keyless 默认无向量；本地 embedding opt-in；远程 provider 由 key 自动探测，可保持关闭） | ✅ 通过（派生物 = 独立 data dir 的 `state_store.db`） | ✅ 通过（LLM 压缩默认关且与召回路径无关） | ✅ 通过（`memory_governance_delete`） | **4/4 通过**（但引入常驻 engine 这一新增硬依赖） |
| **memU** | ❌ **不通过**——本地模式仍需云端 embedding key；无本地 embedding 后端 | ✅ 通过（派生物 = `memu.sqlite3` / Postgres 库） | ✅ 通过（MemoryService 明示不做 LLM 调用） | ⚠️ 部分（只有 filter 级 `clear_recall_files`） | **1/4 硬失败 → 淘汰** |
| **Memori** | ✅ 通过（BYODB + 本地 fastembed） | ⚠️ 部分（派生索引 FAISS 与 `memori_*` 表落在**应用自己的库**里，回滚要动应用主库） | ✅ 通过（`recall.py` 只有本地 embedding） | ❌ **不通过**（只有 `delete_entity_memories(entity_id)` 实体级全删） | **1 项硬失败 + 1 项部分 → 淘汰** |

**memU 的失败是纯静态可判定的**：embedding backend 目录里只有 HTTP 实现，本地模式文档直接写明需要 embedding key。这不是「还没配好」，是设计上就没有本地路径。

**Memori 的失败是形态性的**：它不是「可被读取的派生检索层」，而是「必须改写调用方的 LLM 客户端包装器」。把一个 Pi 扩展的模型调用改道经过第三方库，等于把第三方库放进热路径的必经之路上，与 design Decision 1（T2 只做派生读取）直接冲突。

## 5. 任务 2.3 自我进化能力覆盖

评估标准：能否覆盖**用户画像 / 工作流 / 项目知识 / 技能**四类进化，并且有源码或官方文档支撑。

| 候选 | 用户画像 | 工作流 | 项目知识 | 技能 | 证据 |
| --- | --- | --- | --- | --- | --- |
| **memvid** | ✗ | ✗ | ✗ | ✗ | 无 LLM 抽取、无质量模型。只有规则化富化：`src/analysis/{ner,temporal,auto_tag}.rs`、`src/enrich/{engine,rules}.rs`、`src/enrichment_worker.rs`。它把「提取」留给调用方。 |
| **memU** | ✓ | ✓ | ✓ | ✓ | `README.md:83-94` 自动技能抽取（agent 读→判断→写 Markdown skill→`commit_results`→嵌入 name/description 存 `skill` track→后续复用）；`docs/adr/0007-three-independent-memory-lines-wiki-graph.md` 三条独立记忆线；`docs/adr/0004-workspace-memorize-and-memory-file-system.md` 记忆文件系统。**四类全覆盖，且是四个候选里唯一真正的「技能自蒸馏」**。 |
| **Memori** | ✓ | ✓ | △ | ✓ | `how-memory-works.mdx` 六类记忆：Facts / **Preferences** / **Skills** / Rules / Events / **Agent Trace & Execution**；`knowledge-graph.mdx` 语义三元组图谱。项目知识没有独立类型，落在 Facts/Events 里。 |
| **agentmemory** | △ | ✓ | ✓ | △ | `README.md:959-970` 4 层合并（working/episodic/semantic/procedural，照睡眠巩固模型）、`:970` 衰退曲线与矛盾消解、`:997` auto-forgetting；另有 lessons / crystals / insights 等 scope。但它的「17 skills」是**产品自带的 agent 技能文件**（`npx skills add`），不是从用户历史蒸馏出的技能，别混。 |

**四类覆盖排名**：memU（4/4，含真技能蒸馏）> Memori（3.5/4）> agentmemory（2.5/4）> memvid（0/4）。

**但要注意这个排名与硬门槛排名是冲突的**：唯一 4/4 覆盖用户画像与技能的候选（memU）恰恰是硬门槛 1 不通过的那个。这个冲突必须在任务 5.3 的接入建议里正面处理——**要么接受云端 embedding，要么放弃「自动技能蒸馏」这块能力**，不能装作两者都能拿。

## 6. 静态阶段无法确定的事项（留给运行评测）

| 待验证项 | 候选 | 为什么静态判不了 |
| --- | --- | --- |
| 换 embedding 模型后中文是否真的可用 | Memori、agentmemory | 依赖 fastembed/transformers 侧的多语模型可用性，需实跑 |
| 删除是否级联清理派生索引（FAISS / HNSW / 图谱边） | 全部 | 静态只能看到删除入口，看不到索引一致性 |
| 常驻 engine 在 Pi 扩展进程模型下的实际开销 | agentmemory | 需实测内存/端口占用与启动时序 |
| 中文 BM25 分词质量（jieba 档） | agentmemory | 需用 `scenarios.zh.json` 实测 |
| `.mv2` 文件增长与 vacuum 时机 | memvid | 需实测写放大与磁盘占用 |
| 多跳/关系召回的真实增益 | memvid（`graph_search.rs`）、agentmemory（结构图谱） | 正是 5.1 要回答的核心问题 |
