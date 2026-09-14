# 轻量证据图（T2 关系层）设计

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 3.2。

**作用**：定义 T2 关系层的**有限边类型**、**来源引用**、**重排权重**和**关闭条件**，并用一个可执行的示例证明：图谱结果**不能替代原始证据**。

**边界**：本文件只定义设计，不实现。示例由 `scripts/t2-contract-check.ts` 校验，示例数据在 `evidence-graph.example.json`。图谱默认关闭，且**永远不是** T1 事实来源。

---

## 1. 为什么需要这一层（数据支撑）

任务 3.1 的实测给出了结论：`none` 与 `local` 两档下 `multi_hop_zh` 命中率**都是 0%**。换 embedding 不解决多跳，因为缺的不是相似度，是**关系**——检索确实找到了 bridge（位次 1），但走不到答案。

所以这一层只回答一个问题：**能不能用有限的关系边，把已经检索到的 bridge 推进到答案。**

代价约束（来自 design Decision 4）：只在证据之间连线，不建实体图、不建代码图、不引入图数据库。关系必须指向原始记忆或 L0 事件，图谱只是**可选的召回/重排信号**。

## 2. 有限边类型（封闭集合）

边类型是封闭枚举，**新增类型必须改这个文档并重新过门槛**，不允许运行时自由扩展。

| 边类型 | 语义 | 方向 | 允许的来源层 | 例子 |
| --- | --- | --- | --- | --- |
| `supports` | A 为 B 提供支撑证据 | 有向 | T1 ← T1、T1 ← L0 | 「删除能力依赖上游精确 ID 读取」supports「遗忘流程必须先写快照」 |
| `contradicts` | A 与 B 冲突 | 有向（对称语义） | T1 ← T1 | 「默认走本地档」contradicts「默认走云端档」 |
| `supersedes` | A 取代 B（B 已过时） | 有向 | T1 ← T1 | 新决策取代旧决策 |
| `temporal-next` | A 在时间上紧接 B | 有向 | L0 ← L0、T1 ← T1 | 同一 session 内相邻事件 |
| `related` | 弱相关，仅用于共现 | 无向 | T1 ↔ T1 | 同属一个子系统的两条事实 |

**明确不做**：`caused-by` / `implies` / `part-of` / 任意实体关系。这些需要 LLM 抽取，会引入热路径模型调用，且无法用有限证据复核。

## 3. 来源引用（每个端点都必须落到原始证据）

图谱的节点**不是**独立实体，而是「指向原始证据的引用」。每个端点必须携带：

```json
{
  "layer": "T1",
  "ref": "<memory id>"
}
```

或

```json
{
  "layer": "L0",
  "sessionId": "<session id>",
  "position": 42
}
```

规则（由 `t2-contract-check.ts` 强制）：

| 编号 | 规则 |
| --- | --- |
| R1 | 端点必须同时有 `layer` 和一个具体的引用（`ref` 或 `sessionId`+`position`），缺一即非法 |
| R2 | `layer` 只能是 `T1` 或 `L0`；`T2` 不能作为端点层，派生内容不能引用派生内容 |
| R3 | 边的 `type` 必须在 §2 的封闭集合内 |
| R4 | 每条边必须有 `evidence`：说明这条关系是**从哪里看出来的**（来源文件/事件），不允许无证据连边 |

## 4. 重排权重（有界、只做加法不做得主）

图谱**只注入一个有界的重排加成**，不参与「是否召回」的判定：

```
finalScore = baseScore + graphBonus
graphBonus = clamp(SUM(edgeWeight of edges from hit to other hits) * 0.10, 0, 0.15)
```

| 参数 | 值 | 理由 |
| --- | --- | --- |
| `edgeWeight` | `supports` 1.0 / `contradicts` 0.5 / `supersedes` 0.3 / `temporal-next` 0.3 / `related` 0.2 | 有明确证据支撑的关系给高权，弱关系给低权 |
| 折扣系数 | `0.10` | 单条关系不足以翻盘 |
| 上限 `graphBonusMax` | `0.15` | 图谱最多贡献 15% 的相对加成 |
| **加成给哪一端** | 有向边只抬**被指向的一端**（`supports`/`supersedes`/`temporal-next` 的 `to`）；`related` 无向，两端都算 | 语义上「被支撑的结论」才应该因证据而更自信；给来源端加分会让 bridge 反而压过答案 |
| 参与范围 | 只有**本轮基线已经召回**的结果之间才计边 | 图谱不得凭空引入候选 |
| `contradicts` 特殊处理 | **不提升分数**，只在结果上标 `conflict: true` | 冲突需要人判断，不能让系统悄悄选一边 |

硬约束：

- **图谱不能单独决定注入**。图谱只能在已有 base 结果之上重排；一条从未被基线召回的候选，不能因为图谱加成而进入 top-k。
- 图谱结果必须走 `result-format.md` 的结果格式，保留 `source` 与 `provenance`。
- `baseScore` 恒为基线分，图谱不改写它，只加 `graphBonus`，两者在记录里分开存。

## 5. 关闭条件

图谱是**可以随时整个关掉**的，关掉后必须与接入前完全一致。

| 条件 | 触发 | 行为 |
| --- | --- | --- |
| 配置关闭 | `t2GraphEnabled=false`（默认） | 完全不建图、不查询，零额外开销 |
| 建图失败 | 抽取/写入异常 | 记 bounded failure，禁用图谱，recall 继续走基线链 |
| 遍历失败 | 查询时异常/超时 | 该次召回退回 `baseScore`，记 `graphDegraded: true` |
| 图谱过期 | 索引 mtime 早于 T1/L0 最新写入 | 标记 stale，**不参与重排**，等重建 |
| 证据缺失 | 端点引用的记忆已被删除（精确删除后） | 删除该端点关联的边，不是删除证据 |

**关键一条**：任何一条关闭路径都不得改动 T1/L0/审计/Markdown 投影。

## 6. 示例验证：图谱不能替代原始证据

示例数据：`docs/evaluation-reports/t2/evidence-graph.example.json`。它包含 5 条边与 6 条样例结果，配合 4 个负例：

| 用例 | 输入 | 期望 |
| --- | --- | --- |
| P1 合法重排 | `s-hop-02` 场景：bridge `m-hop-04`（base 0.392）与答案 `m-hop-03`（base 0.330）之间有 `supports` 边 | 只有被支撑的 `m-hop-03` 拿到 `+0.10` → `0.430`，**排到 bridge 之前**；两条结果各自仍带原始 memory id |
| P2 图谱不是来源 | 同上 | 答案条目的 `source.provenance` 必须是 `t2eval/1.0.0#m-hop-03`，**不是** `graph:edge-1` |
| N1 只有图谱、没有原文 | 一条结果只带 `graphEdgeId`，没有 `ref`/`provenance` | **丢弃**，并记 `graph-only-result-dropped` |
| N2 端点层非法 | 边的端点是 `layer: "T2"` | 边被拒，记 `invalid-endpoint-layer` |
| N3 边类型不在封闭集合 | `type: "caused-by"` | 边被拒，记 `unknown-edge-type` |
| N4 端点引用不存在于原文集 | 端点 `ref` 指向不在语料里的 id | 边被拒，记 `dangling-endpoint` |

N1 是这一节的论点本身：**一条「图谱说有但原文里找不到」的结果，必须被丢掉，而不是被展示。** 只要这条规则成立，图谱就不可能变成第二个事实权威。

跑验证：

```bash
node scripts/t2-contract-check.ts
```

校验器对 P1/P2 断言通过，对 N1–N4 断言**必须被拒绝**；任一断言失败即非零退出。

## 7. 对后续任务的影响

- **5.2**：`graphBonusMax=0.15` 与「图谱不能单独决定注入」是门槛审查里的固定条款——任何让图谱直接决定召回内容的方案一律拒绝。
- **5.1**：评测时必须单独记录「有图谱 / 无图谱」两次运行，否则无法把提升归因到关系层。
- **4.1/4.3**：图谱降级（`graphDegraded`、stale）需要有对应的状态显示与诊断字段，不能只写在日志里。
