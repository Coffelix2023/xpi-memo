# T2 派生提案 → 候选生命周期字段映射

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 3.3。

**作用**：定义 T2 派生提案进入**现有**候选生命周期时要填哪些字段、映射到哪、以及哪些字段缺失就必须拒收。目标是让 T2 提案走的路和 L0 离线抽取走的路**完全一样**，不新增第三条写入通道。

**边界**：只定义映射与校验，不实现。示例与校验在 `t2-proposal.example.json` 与 `scripts/t2-contract-check.ts`。**T2 永远不能直接写 T1**。

---

## 1. 现状：已有的三个落点

T2 提案不需要新结构，它要填的是已经在代码里存在的三处：

| 落点 | 类型定义位置 | 作用 |
| --- | --- | --- |
| `PromotionRequest` | `src/promotion-policy.ts` | 准入门槛：判定这条提案有没有资格进 T1 |
| `PendingCandidate` | `src/pending-candidate.ts` | 待审队列条目，用户复核的对象 |
| `candidate_created` L0 payload | `src/l0/types.ts` + `src/memory-activation.ts:295` | 追加式审计事件，来源追踪的锚点 |

关键发现：**`promotion-policy` 里已经预留了 T2 通道**——`sourceLayer: "L0" | "T2"`，且 `expectedEvidenceType("T2") === "t2-handoff"`（`src/promotion-policy.ts:38`）。也就是说设计边界早就画好了：**T2 派生的证据类型是 `t2-handoff`，L0 抽取的是 `l0-conclusion`**，两者不能混。

## 2. 字段映射表

### 2.1 T2 提案侧（新增的输入形状）

```json
{
  "proposalId": "p-001",
  "derivedFrom": { "kind": "graph-edge", "edgeId": "edge-1" },
  "evidenceType": "t2-handoff",
  "content": "……",
  "confidence": 0.72,
  "sourceRefs": [
    { "layer": "T1", "ref": "<memory id>" },
    { "layer": "L0", "sessionId": "<session id>", "position": 42 }
  ],
  "rationale": "两跳关系补出的结论",
  "kind": "project_decision"
}
```

### 2.2 映射到 `PromotionRequest`

| `PromotionRequest` 字段 | 取值 | 来源 / 约束 |
| --- | --- | --- |
| `content` | 提案 `content` | 必须过 `classifyProhibitedContent`，否则 `content-not-concise` |
| `context` | 运行时 `RoutingContext` | 由调用方提供，提案不自带 |
| `evidence` | 由提案构造的 `EvidenceRecord` | 见 §2.3 |
| `explicitPromotion` | `true` | **必须由用户显式触发**，T2 不能自己发起提升 |
| `kind` | 提案 `kind` | 必须是 `MEMORY_KINDS` 之一 |
| `reviewedConclusion` | `true` | 表示已经过模型/规则整理成结论 |
| `sourceLayer` | `"T2"` | 固定 |
| `targetLayer` | `"T1"` | 固定；其他值一律 `invalid-target` |
| `targetScope` | 由 `routeMemoryKind(kind, context)` 推出 | 与 kind 的路由必须一致，否则 `invalid-target` |
| `userConfirmed` | `true` | **必须**。T2 提案永远不能自确认 |

### 2.3 映射到 `EvidenceRecord`（`src/evidence.ts`）

| 字段 | 取值 | 约束 |
| --- | --- | --- |
| `type` | `"t2-handoff"` | 硬性：写成别的值会被 `evidence-source-mismatch` 拒 |
| `source` | `derivedFrom.kind` + `derivedFrom.edgeId` / 索引条目 id | 非空，标明派生自哪个结构 |
| `provenance` | 命题来源的可读标识，例如 `t2:graph:edge-1` | 非空；**不是**原始证据的替代品，原始引用在 L0 payload 里 |
| `confidence` | 提案 `confidence`，`0 < c ≤ 1` | 越界即 `invalid-evidence` |
| `timestamp` | ISO 时间戳 | 不可解析即 `invalid-evidence` |
| `revision` | 可选 | 重建派生索引时递增，用于回滚定位 |

### 2.4 映射到 `PendingCandidate`（`src/pending-candidate.ts`）

| `PendingCandidate` 字段 | 取值 |
| --- | --- |
| `id` | `randomUUID()`（与 `proposalId` 分开：候选 id 属于生命周期，提案 id 属于派生层） |
| `content` / `kind` / `evidence` | 与上同源 |
| `evidenceSummary` | `<type> from <source> (<provenance>)`，由 `generatePendingCandidate` 生成 |
| `rationale` | 提案 `rationale` |
| `reason` | **必须**是 `PENDING_CANDIDATE_REASONS` 之一（`project-decision` / `ambiguous-preference` / `broad-gotcha` / `cross-project-relevance` / `high-impact-durable`） |
| `targetBank` / `targetScope` | 由 `routeMemoryKind` 推出 |
| `status` | `"pending"` |
| `conflictState` | `"none"`；冲突改为 `"reported"` 只能经 `reportConflict` |

**必须绕过自动存储**：T2 提案调用 `generatePendingCandidate` 时 `allowAutoStore` 不得为真值，否则 `shouldAutoStore` 可能让它直接落库，跳过用户确认。T2 的提案一律进队列。

### 2.5 映射到 `candidate_created` L0 payload

字段名与 `src/memory-activation.ts:295` 的现有实现保持一致：

| payload 字段 | 取值 | 作用 |
| --- | --- | --- |
| `candidateId` | 候选 id | 候选与事件的连接键（`src/source-trace.ts` 靠它反查） |
| `bank` | `PendingCandidate.targetBank` | 来源追踪 |
| `kind` | `PendingCandidate.kind` | 来源追踪 |
| `scope` | `PendingCandidate.targetScope` | 来源追踪 |
| `reason` | `PendingCandidate.reason` | 为什么没直接存 |
| `evidenceType` | `"t2-handoff"` | **区分 L0 结论与 T2 派生** |
| `fingerprint` | `contentFingerprint(content)` | 幂等键，防重复捕获 |
| `source` | 原始证据的 `source` | 指向具体来源（文件/事件） |
| `sourceEventPosition` | 原始 L0 事件位次 | **证据链的关键一环** |
| `sourceSessionId` | 原始 L0 session id | 证据链的关键一环 |

## 3. 候选状态与终态

`src/candidate-lifecycle.ts` 的状态机不因 T2 而改变：

| 动作 | 结果状态 | 副作用 |
| --- | --- | --- |
| 提案入队 | `stored`（候选留在队列，`status: "pending"`） | 写 `candidate_created` |
| 用户确认 | `stored` | 经 T1 lifecycle commit；写 `candidate_confirmed`；从队列删除 |
| 用户确认但 L0 commit 未闭合 | `unresolved` | **候选留在队列**，不伪造成功 |
| 后端失败 | `rejected` | 记 bounded reason，候选留队列 |
| 用户拒绝 | `rejected` | 写 `candidate_rejected`；从队列删除 |
| 冲突上报 | `conflict` | `conflictState: "reported"`，`confirm` 被拒 |
| 内容违规（入队或确认时） | `rejected` | `prohibited-content:<分类>` |

T2 特有约束：**T2 只能触发「入队」这一步**。确认、拒绝、冲突上报都只能由用户操作触发。

## 4. 回滚引用（必须完整，否则拒收）

回滚要能在不改动 T1 的前提下把系统恢复成「没接过 T2」。所需引用：

| 引用 | 位置 | 用途 |
| --- | --- | --- |
| `proposalId` | 提案 | 派生层自己的条目 id |
| `derivedFrom.edgeId` / 索引条目 id | 提案 | 删除派生条目即可移除提案来源 |
| `fingerprint` | L0 payload | 幂等键；回滚后重放不会产生重复 |
| `evidence.revision` | `EvidenceRecord` | 索引重建代次；旧 revision 的提案可被整体作废 |
| `candidateId` | L0 payload | 在队列与审计里定位这条候选 |
| `operationId` | T1 lifecycle（确认路径） | 仅在用户确认后产生；L0 提交与后端写入通过它关联 |

**拒收条件（任一成立即不进候选）**：

| 编号 | 条件 | 期望结论 |
| --- | --- | --- |
| C1 | 缺 `sourceRefs`（没有任何原始证据引用） | `provenance-required` |
| C2 | 缺 `derivedFrom`（无法定位派生条目） | `invalid-evidence` |
| C3 | `evidenceType ≠ "t2-handoff"` | `evidence-source-mismatch` |
| C4 | 缺 `revision`（无法回滚派生索引） | `invalid-evidence` |
| C5 | 未经用户确认（`userConfirmed=false`） | `explicit-promotion-required` |
| C6 | 内容含禁止内容 | `content-not-concise` |

C1 与 C4 是这一节的核心：**没有证据引用的派生内容，和没有回滚引用的派生内容，一律不许进入候选**。

## 5. 示例与验证

示例数据：`docs/evaluation-reports/t2/t2-proposal.example.json`。包含：

- `P1`：一条合法的 T2 提案 → 断言映射完整、`evidenceType=t2-handoff`、三个回滚引用齐备；
- `P2`：从该提案构造的候选与 L0 payload → 断言字段名与 `src/memory-activation.ts` 的实现一致、`sourceEventPosition`/`sourceSessionId` 非空；
- `N1`–`N4`：四个负例，分别对应 C1 / C3 / C4 / C5 → 断言**被拒**且 reason 与上表一致。

```bash
node scripts/t2-contract-check.ts
```

## 6. 与 5.x 的关系

- **5.2**：C1–C6 直接就是门槛条款。任何候选若只能产出「无来源引用」或「不可回滚」的提案，按本表拒收，不需要再有别的理由。
- **5.3**：接入建议里必须写清 T2 提案走的是**现有**候选队列，用户可见、可拒、可回溯；不新建通道。
- **4.1/4.2**：T2 只触发「入队」，所以状态提示只需要覆盖 `candidate_created` 一类动作，不需要为 T2 单独设计打断式交互。
