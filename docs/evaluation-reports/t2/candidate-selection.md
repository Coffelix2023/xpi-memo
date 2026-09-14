# T2 候选排序与运行评测入选决定

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 2.4。上游依据：`candidate-matrix.md`（任务 2.1/2.2/2.3）。

**作用**：把静态矩阵收敛成一个可执行的决定——谁进入运行评测、以什么档位进入、谁被淘汰、淘汰理由是否成立、以及「不安装」这个约束怎么被记录下来而不被违反。

**边界**：本文件不安装、不运行任何候选。运行评测属于任务 5.1，需要先有隔离环境（见 §5）。

---

## 1. 排序

排序用的四层判据，**按顺序**，前一层不过就不进入下一层：

| 顺序 | 判据 | 权重 |
| --- | --- | --- |
| 1 | 四条硬门槛（HG-1 本地/可关云、HG-2 可回滚、HG-3 零热路径 LLM、HG-4 精确删除） | 否决项 |
| 2 | 中文能力（本地语义 > 可换模型 > 仅 BM25） | 高——基线缺口就在中文 |
| 3 | 自我进化覆盖（用户画像 / 工作流 / 项目知识 / 技能） | 中 |
| 4 | 集成成本（是否引入常驻进程、依赖重量、是否有 Pi 适配面） | 低——成本可接受就不该主导结论 |

| 排名 | 候选 | 硬门槛 | 中文 | 自我进化 | 集成成本 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | **agentmemory** | 4/4 通过 | BM25 + jieba 可测中文词法；语义需云端 | 2.5/4（4 层合并 + 衰退 + lessons；「技能」是自带文件，非蒸馏） | 高：常驻 iii-engine + 4 端口 | **进入运行评测** |
| **2** | **memvid** | 4/4 通过 | 仅 BM25（本地模型表不可扩展） | 0/4（无 LLM 抽取） | 低：嵌入式，单文件 | **进入运行评测，限定 BM25 档** |
| 3 | memU | ❌ HG-1 | 云端 provider 中文质量最好 | **4/4（唯一真技能蒸馏）** | 低：有 `memu-pi` 适配器 | **淘汰** |
| 4 | Memori | ❌ HG-4 + HG-2 部分 | 需换模型，未验证 | 3.5/4 | 中：依赖重 + 必须改道模型调用 | **淘汰** |

## 2. 入选的两个候选与评测档位限定

### 2.1 agentmemory（排名 1）

**为什么它排第一**：它是唯一「硬门槛全过 **且** 有可测中文路径 **且** 自带多跳/关系能力（结构图谱 + RRF 融合）」的组合。基线最明确的缺口是中文多跳（0%），而 `memory_smart_search` 的 BM25 → 向量 → RRF → reranker 流水线正好是对照组。

**评测档位**：三档都要测（无 embedding / 本地 embedding / 云端 embedding），因为它三档都能落地：

- 无 embedding：keyless 默认（`README.md:92`）
- 本地 embedding：`EMBEDDING_PROVIDER=local` → `Xenova/all-MiniLM-L6-v2`
- 云端 embedding：Gemini `gemini-embedding-001`（100+ 语言）

**要测的核心问题**：它的 RRF 融合与结构图谱能不能把 `multi_hop_zh` 从 0% 拉起来；如果能，拉起来的是「中文语义」还是「图谱关系」——这个区分直接决定 3.2 的证据图设计要不要做。

**未通过项（不构成淘汰，但必须记账）**：引入常驻 iii-engine 进程与 4 个端口，是 baseline 完全没有的运行形态。评测时必须记录启动时序、常驻内存与端口占用，作为「集成成本」的实测数据，而不是只记召回质量。

### 2.2 memvid（排名 2）

**为什么不是第一**：硬门槛最干净（单文件、零服务、无 LLM、精确 `delete_frame`），但**本地 embedding 模型表不可扩展**——`LocalTextEmbedder::new` 走静态表，未知名静默回退英文默认（`src/text_embed.rs:434`、`:216`，并有单测断言）。这意味着它在本地拿不到中文语义，只能作为「BM25 + 关系重排」的对照组。

**评测档位限定**：**只测无 embedding 档（`lex` BM25）**。理由：`vec` 档的中文语义是已知的不可用，测它只是重复基线已有的英文模型结论，浪费一次运行。若评测中需要云端档，用 `api_embed` 另开一次运行并单独标注外发边界。

**它仍然值得进评测的原因**：`src/graph_search.rs` 是四个候选里唯一一个**非 LLM 的关系检索实现**。如果它能提升多跳，那么 3.2 的证据图就有了「不依赖模型」的落地路径——这条路对「零热路径模型调用」这条硬要求最安全。

**自我进化为 0 是要接受的**：memvid 不做抽取，这不是缺陷而是定位（它把提取留给调用方）。评测时不要拿「没有进化能力」当它的减分项去和 agentmemory 比，那是在比两件不同的东西。

## 3. 淘汰理由（逐条可复核）

### 3.1 memU — 硬门槛 HG-1 不通过

- **事实**：本地模式下 embedding 仍必须提供云端 key。`README.md:100` 明写「Private · Single-device · **Embedding key required**」；`README.md:181-186` 的 provider 默认 `openai`，可选 `jina`/`voyage`/`doubao`/`openrouter`；`src/memu/embedding/backends/` 目录内只有这 5 个 HTTP 实现，**没有任何本地后端**。
- **为什么这是硬失败而不是配置问题**：没有本地路径可配，是设计选择。选它就等于接受「每次召回都把查询和记忆文本发到第三方 embedding 服务」。
- **淘汰是遗憾的，且必须写进结论**：它是四个候选里自我进化覆盖最完整的（4/4，且是唯一真正从历史蒸馏出可复用技能的），还自带 `memu-pi` 适配器（`pyproject.toml:71`）。这个冲突（进化最强 vs 隐私最弱）不能靠含糊的措辞掩盖，要在任务 5.3 的接入建议里正面给出取舍。
- **可借用的部分**：它的「宿主 agent 自己蒸馏、MemoryService 不做模型调用」（`README.md:96`）是**架构上最贴合本变更的一条**——派生提案交给宿主模型在离线生命周期做，正好对应 design Decision 5（进化放在离线生命周期）。这条思路进入 3.3 的字段映射设计。

### 3.2 Memori — 硬门槛 HG-4 不通过，HG-2 部分不通过

- **HG-4 失败**：公开 API 只有 `delete_entity_memories(entity_id)`（`memori/__init__.py:254`），按实体全删，没有单条删除。本变更的兼容性要求是「现有精确删除不能被破坏」，接入一个只能整实体删的层会让 T1 的精确删除语义当场失效。
- **HG-2 部分失败**：派生索引（FAISS 向量索引）与 `memori_*` 表都落在**应用自己的数据库**里（`knowledge-graph.mdx:45-49`、`advanced-augmentation.mdx:142`），回滚意味着动主库，不是删一个独立派生目录。
- **形态冲突（决定性）**：它是 LLM 客户端包装器——`architecture.mdx`「Wraps your existing LLM client transparently. Intercepts calls…」，召回默认发生在每次 LLM 调用上。把 Pi 的模型调用改道经过第三方库，等于把第三方库放进热路径的必经路上，与 design Decision 1（T2 只做派生读取）冲突。
- **可借用的部分**：它的记忆类型表（Facts / Preferences / Skills / Rules / Events / Agent Trace）是一份现成的**用户画像与工作流分类学**，可作为 3.3 里「T2 派生提案字段映射」的参照词表。

## 4. 「设计参照」与「接入」要分开记账

| 候选 | 状态 | 借用的东西 | 明确不借 |
| --- | --- | --- | --- |
| memU | 不接入 | 宿主 agent 蒸馏 + MemoryService 零模型调用的分工；wiki/graph 三线记忆（ADR 0007） | 云端 embedding 依赖；10 个 host adapter 的安装脚本 |
| Memori | 不接入 | 六类记忆分类学；异步增强「零延迟影响」的定位 | LLM 客户端包装形态；实体级删除 |
| memvid | 接入评测 | `.mv2` 单文件 + tombstone + vacuum 的删除模型；`graph_search.rs` 的非 LLM 关系检索 | 静态 embedding 模型表 |
| agentmemory | 接入评测 | 除评测外不预借——先看实测结果 | 常驻 engine 形态（除非评测证明收益显著） |

## 5. 未安装约束记录（任务 2.4 明确要求）

本阶段结束时四个候选**均未安装**。以下约束在 5.1 之前必须保持成立：

| 约束 | 内容 | 当前状态 |
| --- | --- | --- |
| C-1 | 本机不得出现候选的运行时：无 `memvid-sdk`/`memu-cli`/`memori` Python 包，无 `@agentmemory/agentmemory` npm 包，无 `~/.agentmemory/bin/iii` | ✅ 已实测未安装：`memvid-sdk`/`memu-cli`/`memori` 的 `find_spec` 均 absent；`uv tool list`、`npm ls -g`、`pnpm ls -g` 无候选包；`~/.agentmemory`、`~/.memu` 目录不存在；`which memvid memu agentmemory iii` 全部 absent |
| C-2 | 不写入 xpi-memo 的数据目录（`~/.pi/agent/xpi-memo`）或 Mnemosyne 的 bank（`~/.hermes/mnemosyne`）；评测数据一律隔离 | ✅ 本阶段未运行任何候选，未产生新数据 |
| C-3 | 不修改 `src/**` 与 `openspec/specs/**`；本变更只产出评估与计划 | ✅ 仅新增 `docs/` |
| C-4 | 静态审查只读：拉取的是仓库文本（README / LICENSE / 源码 / 规格），未执行候选代码、未下载模型权重 | ✅ 只读 |
| C-5 | 四份许可证均为 Apache-2.0，进入评测不需要额外授权动作；若评测中需要用候选自带数据/样例，需单独确认其数据许可 | ✅ 已确认许可证 |

**5.1 的前置条件**（未满足就不要开跑）：

1. 隔离环境：候选各自装在自己的容器或独立前缀里，不落在系统 Python / 全局 npm。
2. 端口与进程清单：agentmemory 需要 4 个端口与一个常驻 engine，运行前先确认不与 Pi 或 Mnemosyne 冲突，测完立即停。
3. 同一份输入：必须用 `scenarios.zh.json` v1.0.0 与相同的 top-k，报告走 `result-format.md` 定义的字段，标签用 `--label agentmemory-bm25` 这类可区分的名字。
4. 中文判定基准不变：`expectation=hit` 的 9 条场景用来判缺陷，`expectation=observe` 的 3 条多跳场景用来量化增益。
5. 外发边界记账：任何云端 embedding 档位都要记录「发出去了什么、发到哪、发了多少次」，这是 5.2 门槛审查的必查项。

## 6. 与后续任务的关系

- **5.1**：按 §2 的档位限定执行 A/B 评测，输出用 `result-format.md`。
- **5.2**：§3 的两条淘汰理由（云 embedding 依赖、实体级删除）已经是门槛审查的结论，5.2 只需补运行数据，不需要推翻它们。
- **5.3**：必须正面回答 §3.1 记录的那个冲突——「进化能力最强的候选恰好隐私边界最弱」，并给出「若不通过则保持现状」的明确写法。
