# T2 记忆增强评估报告与接入建议（本变更最终交付）

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 5.3。

## TL;DR

**结论：无候选通过完整门槛审查，保持现有系统不变。**

不新增依赖、不改运行时、不改数据格式、T2 默认关闭。基线的中文多跳缺口（0%）与英文 embedding 的负担（同命中率、更高误召回、+169 ms）被**量化确认**，但本阶段没有找到能以可接受边界补上这个缺口的候选；把候选接入运行时这件事留给未来的独立实现变更。

---

## 1. 评估范围与实际做了什么

| 组 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 基线快照、中文场景集、记录格式 | ✅ 完成 |
| 2 | 四候选静态矩阵、硬门槛、自我进化、入选决定 | ✅ 完成 |
| 3 | 三档 embedding 协议、证据图设计、派生提案映射 | ✅ 完成 |
| 4 | 状态可见性、交互边界、T2 回退诊断 | ✅ 完成 |
| 5.1 | 候选真实 A/B 评测 | ❌ **未执行**（见 `ab-evaluation-scope.md`） |
| 5.2 | 治理门槛审查 | ✅ 完成（基于静态 + 基线实测） |
| 5.3 | 本文 | ✅ |

**真实数据来源**（全部可复现，非推断）：

```bash
node scripts/t2-eval.ts --label baseline-none  --embedding-mode none
node scripts/t2-eval.ts --label baseline-local --embedding-mode local
node scripts/t2-eval.ts --label baseline-cloud-probe --embedding-mode cloud --probe-only
node scripts/t2-contract-check.ts
```

## 2. 基线的实测画像

12 场景（四类各 3 条），22 条虚构语料，临时数据目录，未触碰用户真实 bank。

| 指标 | `none`（纯 FTS） | `local`（本地英文向量） |
| --- | --- | --- |
| 命中率（全部） | 66.7% | 66.7% |
| 命中率（`expectation=hit`） | 88.9% | 88.9% |
| MRR | 0.667 | 0.667 |
| 误召回率 | **33.1%** | 40.0% |
| 证据完整率 | 100% | 100% |
| 延迟 p50 | **567 ms** | 736 ms |
| 资源 | RSS +3.9 MB / data dir 1.1 MB | RSS +4.0 MB / data dir 2.1 MB |
| 外发尝试 | 0 | 0 |

分类别命中率（两档一致）：`user_preference` 100% · `project_continuity` 100% · `mixed_tech` 66.7% · `multi_hop_zh` **0%**。

### 2.1 三条可带走的结论

**（1）英文 embedding 在中文场景是纯负担。** 两档命中集合与位次**完全相同**，`local` 只多带进 2–3 条不相关记忆，且每次查询多花 169 ms。不是「embedding 没用」，是「英文 embedding 对中文没用」。

**（2）中文多跳是唯一真正的结构性缺口。** 3/3 场景未命中答案，其中 2 条命中的是 bridge（位次 1）——检索找到了正确的中间证据，缺的是「再走一跳」。换 embedding 两档都是 0%，说明要补的是**关系**，不是相似度。

**（3）两个静默失败必须被观测到。**
- `s-mix-02` 返回空结果，根因在阶段数据可见：`wm_primary raw_count=2, after_filter_count=1, kept_count=0` —— 候选被最终阈值丢掉，episodic 无补位。
- 云端 embedding 失败时 `explain.embedding` 仍报 `{"available": true, "computed": true}`，只有 `voice_scores.vec = 0` 能看出异常；而 `em_fallback` 的 `fallback_used: true` 在健康运行里同样出现。

第 3 条已落地为记录字段 `embeddingContributed` 与 `vector-no-contribution` 记号。

## 3. 四候选的处置

| 候选 | 硬门槛 | 裁决 | 一句话理由 |
| --- | --- | --- | --- |
| **memU** | ❌ G7 | **拒绝** | 本地模式仍必须云端 embedding key，无任何本地后端 |
| **Memori** | ❌ G2 / G5 | **拒绝** | 只能按实体全删；且是调用方改写型 LLM 客户端包装器 |
| **memvid** | 形式通过，G6 无数据 | **证据不足** | 中文价值主张（非 LLM 关系检索）未跑 |
| **agentmemory** | 形式通过，G6 无数据 | **证据不足** | 同上；另需常驻 engine + 4 端口 |

四条被点名必须拒绝的情形全部有落点：直接写入（Memori）、不可回滚（Memori 部分）、热路径云端模型依赖（memU）、无证据派生（无候选命中，由 3.3 的 C1/C4 拒收条件兜住）。

完整裁决见 `governance-review.md`。

## 4. 接入建议

### 4.1 主建议：保持现有系统不变

具体含义（不是一句口号，是五个「不」）：

| 不 | 含义 |
| --- | --- |
| **不新增运行时依赖** | 不安装 memvid / memU / Memori / agentmemory，也不引入它们的传递依赖 |
| **不改运行时代码** | `src/**` 零改动（本变更全程只新增 `docs/` 与 `scripts/`） |
| **不改数据格式** | Mnemosyne bank、L0 事件、`candidates.json`、Markdown 投影格式全部不变 |
| **不默认开启任何 T2 能力** | `t2AdapterEnabled=false`、`statusVisibility=stream`（保持现状） |
| **不改热路径** | 召回路径仍是 `configured → mnemosyne → ripgrep → qmd` |

保留的既有能力一个都不动：L0 会话追踪、T1 治理记忆、Markdown 投影、精确删除、审计、`XPI_MEMO_PAUSED`。

### 4.2 证据图（3.2）与状态提示（4.1）怎么办

它们**不是**候选接入，是本变更自己的设计。建议：

- **证据图**：设计保留、**默认关闭**，且**暂不实现**。理由：它要解决的是多跳缺口，而「图谱能不能提升多跳」恰好是 5.1 没跑的那个实验。在拿到运行数据之前实现它，就是把假设当结论。设计文档 + 90 条断言已就位，实现成本低，可以随时启动。
- **状态可见性与诊断字段**：`embeddingContributed` / `vector-no-contribution` 这类**纯观测**字段建议优先落地——它们修复的是既有的静默失败问题（§2.1 第 3 条），与候选接入无关，收益不依赖任何实验结论。落地时应另开实现变更。

### 4.3 若要继续，下一变更的前置条件

| 编号 | 条件 |
| --- | --- |
| 1 | 新开独立变更，并在其中**显式授权安装候选**（本变更的 proposal 明确不授权） |
| 2 | 隔离环境：候选各装在自己的容器或独立前缀；podman 6.1.1 在本机可用 |
| 3 | 同一输入：`scenarios.zh.json` v1.0.0 + 相同 top-k + `result-format.md` 字段 |
| 4 | 逐场景记录 `t2State` / `baselineBacked`，否则分不清「T2 没帮忙」与「T2 挂了」 |
| 5 | 先只跑 `memvid` 的 BM25 档（嵌入式、无守护进程、`podman rm` 即回滚），拿到多跳数据再决定是否值得碰 agentmemory |

## 5. Rollback 计划（供未来的实现变更引用）

若将来真的接入，回滚路径**在接入前就已经定义好**，不需要临时设计：

| 层次 | 回滚动作 | 依据 |
| --- | --- | --- |
| 配置 | `t2AdapterEnabled=false` 或 `t2GraphEnabled=false` | `evidence-graph.md` §5 关闭条件 |
| 进程 | 停掉 adapter 进程 / 移除容器；agentmemory 额外停 iii-engine 与 4 个端口 | `candidate-selection.md` §5 E6 |
| 派生数据 | 删除派生索引目录（单文件 `.mv2` 或独立 data dir）；**T1/L0/审计/Markdown 无需迁移** | `design.md` Migration Plan 第 4 步 |
| 候选提案 | 按 `proposalId` / `derivedFrom` / `evidence.revision` 定位并作废 | `t2-proposal-mapping.md` §4 |
| 确定性失败 | 七类 `t2Reason` 均已定义，「关掉 T2 后系统回到哪一档」可直接引用 | `t2-diagnostics.md` §3 |

回滚不变式：**任何一条回滚路径都不得改动 T1 bank、L0 日志、审计记录或 Markdown 投影**；并且回滚所需的信息（`revision`、`provenance`、`sourceEventPosition`）在提案入队时就已经落库。

## 6. 遗留缺口（明确记账，不隐藏）

| 缺口 | 影响 | 何时能关 |
| --- | --- | --- |
| 候选真实 A/B 未执行 | 两个「证据不足」候选无法判定 | 下一变更授权安装后 |
| 中文多跳仍 0% | 基线最痛的点未解决 | 拿到候选数据或自研关系层后 |
| 英文 embedding 是负担 | 现状默认配置在中文场景下既慢又更不准 | 可独立决策（换模型或中文场景关向量），不依赖本次评估 |
| 两个静默失败未修 | 用户看到「没有记忆」而非「有候选被丢掉」 | 纯观测字段可独立落地 |
| `graphBonusMax=0.15` 等参数未经实测校准 | 参数是设计值，不是调优值 | 图谱实现后 |

## 7. 交付物索引

| 文件 | 内容 |
| --- | --- |
| `baseline.md` | 基线版本 / 配置 / 召回输出格式 / 指标口径 |
| `baseline-findings.md` | 首轮观测结论 |
| `scenarios.zh.json` + `scenario-review.md` | 中文场景集（22 语料 / 12 场景）与逐条人工核对 |
| `result-format.md` | 记录格式定义（含三档探针） |
| `candidate-matrix.md` | 四候选静态矩阵 + 硬门槛 + 自我进化 |
| `candidate-selection.md` | 入选、淘汰理由、未安装约束 |
| `embedding-modes.md` | 三档执行协议与实测 |
| `evidence-graph.md` + `evidence-graph.example.json` | 证据图设计 + 示例 |
| `t2-proposal-mapping.md` + `t2-proposal.example.json` | 派生提案字段映射 + 示例 |
| `action-visibility.md` + `action-visibility.example.json` | 状态可见性模型 + 交互边界 |
| `t2-diagnostics.md` + `t2-diagnostics.example.json` | T2 回退诊断字段 |
| `ab-evaluation-scope.md` | 5.1 未执行记录与入口条件 |
| `governance-review.md` | 门槛审查裁决 |
| `baseline-{none,local}-run.*`、`baseline-cloud-probe-run.*` | 实测原始记录 |
| `scripts/t2-eval.ts` | 评测 runner（三档 + 降级探针） |
| `scripts/t2-contract-check.ts` | 契约校验器（90 断言） |
