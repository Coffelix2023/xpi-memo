# Task 2 Report — 候选静态评估与入选决定

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 2.1 / 2.2 / 2.3 / 2.4。

## 目的

在装任何东西之前，用源码和官方文档判断 `memvid` / `memU` / `Memori` / `agentmemory` 是否有资格进入运行评测。

这一步的价值不在于排名，而在于**淘汰**。静态阶段能挡掉的错误有两类：一是「本地根本跑不起来，必须联网」，二是「它会成为第二个事实权威，破坏 T1 的删除与审计边界」。这两类问题一旦等到装完才发现，代价是回滚整个接入尝试。

## 实现

静态只读审查，产出两份文档：

### `docs/evaluation-reports/t2/candidate-matrix.md`（任务 2.1 / 2.2 / 2.3）

- **七维矩阵**：许可证、存储、依赖、中文 embedding、原文保留、删除能力、运行时形态。
- **硬门槛表**：HG-1 本地/可关云、HG-2 可回滚派生索引、HG-3 零热路径 LLM、HG-4 精确删除。
- **自我进化表**：用户画像 / 工作流 / 项目知识 / 技能四类覆盖，逐条挂源码或官方文档行号。
- 先钉死了一个容易引起误判的定义：**热路径模型调用**指召回路径上的 LLM/chat 调用；embedding 推理与基线同级，不算违规，但云端 embedding 要单独记外发边界。不先定义这个，四个候选会被误判。

### `docs/evaluation-reports/t2/candidate-selection.md`（任务 2.4）

排序判据、入选档位限定、逐条淘汰理由、设计参照与接入分开记账、五条未安装约束及其实测状态。

## 结论

**入选运行评测**：

1. **agentmemory**（4/4 硬门槛）——唯一「硬门槛全过 + 有可测中文路径 + 自带关系/多跳能力」的组合。三档 embedding 都能落地，是 5.1 的主力对照组。
2. **memvid**（4/4 硬门槛）——限定只测无 embedding 档。它的 `graph_search.rs` 是四个候选里唯一**非 LLM 的关系检索实现**，对「零热路径模型调用」这条要求最安全。

**淘汰**：

- **memU**：HG-1 硬失败。本地模式下 embedding 仍必须云端 key（`README.md:100`），`src/memu/embedding/backends/` 只有 5 个 HTTP provider，无本地后端。这是设计选择，不是配置问题。
- **Memori**：HG-4 硬失败（只有 `delete_entity_memories(entity_id)` 实体级全删）+ 形态冲突（它是 LLM 客户端包装器，必须把 Pi 的模型调用改道经它）。

**四个候选没有一个能在本地提供中文语义 embedding**——都跟随 fastembed/ONNX 生态的英文默认模型。这条事实本身是 5.2 门槛审查的重要输入。

## 特点与边界

- **零安装**：没有安装任何候选，没有执行候选代码，没有下载模型权重。只读拉取仓库文本（README / LICENSE /源码 / 规格 / ADR）。
- **快照可复核**：四个候选都固定在具体 commit（`e6bd9f7b9c38` / `08e1ed4cdf4c` / `10d650150071` / `e04ba88819c3`），结论挂文件行号，不跟随 main 漂移。
- **「未验证」是合法结论**：静态判不了的一律进「待运行评测」清单（换模型后中文是否可用、删除是否级联清理派生索引、常驻 engine 开销、jieba 分词质量、`.mv2` 写放大、多跳真实增益），不猜。
- **淘汰不等于否定**：memU 的「宿主 agent 自己蒸馏、MemoryService 不做模型调用」分工被记为设计参照（与 design Decision 5 同向），Memori 的六类记忆分类学被记为字段映射的参照词表。借思路和接运行时分开记账。
- **冲突要正面写**：进化能力最完整的候选（memU 4/4）恰好是隐私边界最弱的那个。这个冲突记进了 `candidate-selection.md` §3.1，要求 5.3 正面回答，不许用含糊措辞掩盖。

## 验证

- **未安装约束实测**（写入 C-1 行）：`memvid-sdk` / `memu-cli` / `memori` 的 `find_spec` 全部 absent；`uv tool list`、`npm ls -g`、`pnpm ls -g` 无候选包；`~/.agentmemory`、`~/.memu` 目录不存在；`which memvid memu agentmemory iii` 全部 absent。
- `pnpm typecheck` → 通过（exit 0）
- `pnpm test` → 702 passed | 7 skipped（与任务 1 结束后一致，本任务未触及代码）
- `pnpm -w run lint` → 本任务只新增两份 markdown，不参与 biome（仓库对 `.md` 默认 `Checked 0 files`）；仓库整体仍只有那个既有的 `docs/reports/token-analysis.html` 失败
- `openspec` 进度 → 7/16 完成
