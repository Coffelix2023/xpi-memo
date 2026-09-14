# Task 5 Report — 接入闸门与最终建议

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 5.1 / 5.2 / 5.3。

## 目的

前四组做的是「把事实摊开」：基线实测、候选矩阵、三档协议、可见性与诊断。这一组做的是**收敛**——用门槛把这些事实压成一个可以执行的决定，并保证没有一个候选是靠含糊措辞溜进运行时的。

## 实现

### 5.1 未执行（有意，用户裁定）

`tasks.md` 5.1 要求真实 A/B 评测，`proposal.md:14` 明写「不安装候选」。两条直接冲突，本轮由用户裁定：**与 proposal 一致，不安装、不执行，按现状收口**。

记录在 `docs/evaluation-reports/t2/ab-evaluation-scope.md`：冲突原文、裁定、本阶段实际跑过的 3 档 × 12 场景、六项输出维度的基线侧/候选侧对照、E1–E7 入口条件。

**5.1 保持未勾选**，并在 tasks.md 里就地写明原因。把 `- [x]` 打在未执行的验收项上会让 tasks.md 说谎。

### 5.2 `docs/evaluation-reports/t2/governance-review.md`

七条门槛（G1 热路径 / G2 精确删除 / G3 回滚 / G4 证据链 / G5 不直接写入 / G6 中文召回 / G7 云端可关）× 四候选逐一裁决。判定规则：硬失败即拒绝；全过但缺运行数据 → 证据不足，**不得判为通过**。

另附「自家设计」的门槛自查：把 3.2/3.3/4.x 的六条契约映射到已有的 90 条断言上。

### 5.3 `docs/evaluation-reports/t2/adapter-recommendation.md`

最终交付：评估报告 + 接入建议 + rollback 计划 + 遗留缺口。

## 结论

**没有任何候选通过完整门槛审查 → 保持现有系统不变。**

| 候选 | 裁决 | 一句话理由 |
| --- | --- | --- |
| memU | 拒绝（G7 硬失败） | 本地模式仍必须云端 embedding key，无本地后端 |
| Memori | 拒绝（G2 硬失败 + G5 冲突） | 只能按实体全删；且是调用方改写型客户端包装器 |
| memvid | 证据不足 | 中文价值主张（非 LLM 关系检索）没有运行数据 |
| agentmemory | 证据不足 | 同上，另加未量化的常驻 engine 成本 |

「保持现状」写成了五个「不」：不新增依赖、不改运行时代码、不改数据格式、不默认开启 T2、不改热路径。

**证据图（3.2）建议保留设计但暂不实现**——它要解决的多跳缺口，恰好是 5.1 没跑的那个实验；先实现等于把假设当结论。**纯观测字段（`embeddingContributed` 等）建议优先落地**——它们修的是既有静默失败，与候选接入无关。

## 特点与边界

- **拒绝的理由是硬的，不是猜的**：memU 的 `src/memu/embedding/backends/` 目录里没有本地后端；Memori 的公开 API 只有 `delete_entity_memories(entity_id)`。两条都是目录级/API 级事实。
- **「证据不足」没有被写成「接近通过」**：memvid 与 agentmemory 的中文主张落在基线最痛处（多跳 0%），没有数据就是没有数据。
- **回滚计划在接入前就定义好**：五层回滚（配置 / 进程 / 派生数据 / 候选提案 / 确定性失败）全部挂在已有设计上，不需要临时设计。
- **不执行不等于没实测**：所有结论都基于真实跑过的基线数据，缺的只有候选那一半。

## 附带修正：放开 archive 阻塞

`openspec validate evaluate-t2-memory-enhancement` 原先报 6 个 ERROR——本变更的 `specs/**` 里有 3 + 2 个 MODIFIED requirement 没有把主 spec 的原有 scenario 复制进 delta，而 MODIFIED 是整块替换，validator 因此拒绝归档。

已补齐：

| 文件 | 补回的 scenario |
| --- | --- |
| `specs/pluggable-search/spec.md` | Backend failure isolation、Backend-specific configuration、Backend transparent to caller、Result quality variation、Mnemosyne-only operation、Adding ripgrep later、Parallel backend usage（共 7 条） |
| `specs/memory-activation-loop/spec.md` | Agent proposes a memory、Sensitive content is encountered、Derived content is sent to an external runner、Pending candidates exist at session start（共 4 条） |
| `specs/t2-memory-evaluation/spec.md` | 给「Candidate MUST pass governance gates」的正文补上 MUST（消除 RFC 2119 警告） |

补齐时原有 scenario 文字**逐字保留**，只把新增的 T2 scenario 插在前面。

## 验证

- `openspec validate evaluate-t2-memory-enhancement` → **Change is valid**（修前 6 个 ERROR）
- `node scripts/t2-contract-check.ts` → PASSED: 90 断言（exit 0）
- `pnpm typecheck` → 通过（exit 0）
- `pnpm test` → 702 passed | 7 skipped
- `pnpm -w run lint` → 本组新增文件全部通过；仓库整体仍只有既有的 `docs/reports/token-analysis.html`
- `openspec` 进度 → **15/16**，剩 1 项为有意不执行的 5.1

## 变更整体收口

五组任务全部处理完毕，本变更可以归档。归档前需要知道的一件事：**tasks.md 里 5.1 保持未勾选是有意的**，archive 时它是「已知的、被记录的缺口」，不是遗漏。
