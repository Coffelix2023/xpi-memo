# T2 不可用时的回退诊断字段

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 4.3。

**作用**：定义 T2（派生增强层）不可用时**记什么字段、每类不可用长什么样**，并验证 baseline recall 在 adapter 缺失或失败时仍然可用。

**边界**：本文件只定义诊断字段与回退契约，不实现 adapter。示例数据在 `t2-diagnostics.example.json`，断言在 `scripts/t2-contract-check.ts`。

---

## 1. 回退契约（先定不变量，再谈字段）

无论 T2 处于什么状态，以下三条**永远成立**：

1. **recall 必须返回 baseline 结果**。T2 字段是**观测字段**，不是准入条件——任何 T2 字段都不能让 recall 变空、变慢到超时、或抛异常给用户。
2. **T2 字段与 baseline 字段在记录里分开存**。混在一起就无法判断「这次召回没有命中是因为基线不行，还是因为 T2 挂了」。
3. **每个 T2 状态都对应一个有界错误码**。不允许只留一句人话，也不允许把上游异常原文写进状态。

这三条对应 `pluggable-search` 的 Scenario: T2 adapter fails ——「bounded failure + 沿用现有 fallback chain」。

## 2. 字段集

### 2.1 复用现有字段（不新造）

| 字段 | 现有位置 | 在本任务里的作用 |
| --- | --- | --- |
| `backendState` | `xpi_memo_recall` details：`backend-not-run` / `backend-queried-no-hits` / `backend-queried-with-hits` | 区分「后端没跑」与「跑了没命中」。**这是最容易被误读的一对**，T2 失败时必须与它联合判断 |
| `searchBackend` | recall 输出 | 实际执行召回的后端（`mnemosyne` / `ripgrep` / `qmd` / `null`） |
| `queriedBanks` | recall 输出 | 实际查询的 bank 列表，为空说明没有任何后端执行 |
| `resultCount` | recall 输出 | 返回条数 |
| `warning` | recall 输出 | 后端失败/回退的有界文案 |
| `retrieval.fallback` | recall 输出 | 向量层是否降级 |
| `attempts[]` | `SearchOutcome.attempts` | 逐后端探测结果，回退链的证据 |
| `audit.action = "fallback"` | `src/audit.ts` | 回退事件的审计入口 |

### 2.2 新增字段（本变更要求）

| 字段 | 取值 | 语义 |
| --- | --- | --- |
| `t2State` | `disabled` / `unavailable` / `error` / `invalid` / `stale` / `degraded` / `ok` | T2 当前状态，封闭集合 |
| `t2Reason` | 有界错误码（见 §3） | 为什么处于该状态；**不是**异常原文 |
| `t2Attempted` | boolean | 是否真的尝试过调用 T2（与 `disabled` 区分） |
| `baselineBacked` | boolean | 本次召回是否由基线链路完成。**任何 T2 非 ok 状态下必须为 `true`** |
| `embeddingContributed` | boolean | 来自任务 3.1：是否真有返回行拿到向量贡献 |
| `graphDegraded` | boolean | 来自任务 3.2：图谱遍历失败或索引过期而为参与重排 |

`t2State` 与 `baselineBacked` 的联合读法：

| `t2State` | `baselineBacked` | 用户看到什么 |
| --- | --- | --- |
| `ok` | `true` | 正常；T2 只贡献低权重重排 |
| `disabled` | `true` | 什么都没发生（默认状态，不是故障） |
| `unavailable` / `error` / `invalid` / `stale` / `degraded` | `true` | 降级提示 + 基线结果照常返回 |

**禁止出现的组合**：`t2State != "ok"` 且 `baselineBacked == false`。这表示 T2 挂了却连基线也没跑——正是要防的那种静默失败。

## 3. 七类不可用状态

| `t2Reason` | 触发 | 上游现象 | 期望的 baseline 行为 |
| --- | --- | --- | --- |
| `t2-disabled-by-config` | `t2AdapterEnabled=false`（默认） | 不调用 | 现有链原样运行，零额外开销 |
| `t2-adapter-missing` | 可执行文件/包不存在 | spawn ENOENT | 回退链继续（`attempts` 记一条 `ok:false`） |
| `t2-adapter-error` | 进程启动即失败/崩溃 | 非零退出 | 同上，`warning` 记有界原因 |
| `t2-adapter-timeout` | 超过预算未返回 | 超时 | 同上；**不得**阻塞会话 |
| `t2-adapter-invalid-result` | 返回无法解析/字段缺失 | 解析失败 | 丢弃该结果，其余结果照常返回 |
| `t2-index-stale` | 派生索引早于 T1/L0 最新写入 | 索引过期 | 索引不参与重排，`graphDegraded=true` |
| `t2-graph-degraded` | 图谱遍历异常 | 遍历失败 | 退回 `baseScore`，`graphDegraded=true` |

这七类与任务 3.2 的关闭条件一一对应（§5 的五条关闭条件在此展开成可记录的 reason 码）。

## 4. 验证

### 4.1 现状就是「adapter 缺失」

本变更**没有安装任何 T2 adapter**，所以当前每次召回都天然是 `t2-adapter-missing` 场景。已完成的实测（`baseline-none-run.json` / `baseline-local-run.json`）：

- 12 个场景全部完成，基线命中率 66.7%，无异常、无阻塞；
- `degradationProbes` 记录了两种后端不可用的形状：`backend-missing`（`spawnSync mnemosyne ENOENT`）与 `backend-error`（`FileExistsError`），两者都产出有界原因 + 空结果 + 固定 warning。

也就是说：**「baseline recall 在 adapter 缺失时仍可用」这件事已经被真实跑过**，不是推断。

### 4.2 七类状态的断言

示例 `t2-diagnostics.example.json` 逐类列出：`t2State`、`t2Reason`、`t2Attempted`、`baselineBacked`、以及该状态下必须出现的诊断字段集合。

```bash
node scripts/t2-contract-check.ts
```

断言的 4 条硬规则：

| 编号 | 断言 |
| --- | --- |
| D1 | 每类的 `t2State` 属于封闭集合，`t2Reason` 非空且有界 |
| D2 | 每类的 `baselineBacked` 必须为 `true`，且 `t2State != "ok"` 时不得出现「T2 挂了但基线没跑」的组合 |
| D3 | 每类声明的字段集合必须覆盖 §2.1+§2.2 的必查字段 |
| D4 | 字段名必须在白名单内（不得夹带正文类字段） |

D2 是这一节的核心：**它把「T2 失败不得让召回变空」从一句承诺变成一条会失败的断言。**

负向对照（实测）：任取一类把 `baselineBacked` 改成 `false` → `FAILED: 1/90`，exit 1；恢复 → 90/90 通过。同类地，给一条边界用例打开提示框、或在状态里加一个 `content` 字段，都会分别触发 V4 / V2 失败。断言不是空转。

## 5. 对后续任务的影响

- **5.1**：A/B 评测必须逐场景记录 `t2State` / `baselineBacked`，否则无法把「T2 没帮忙」与「T2 挂了」分开。
- **5.2**：D2 是门槛条款——任何让 T2 失败传播成召回失败的方案一律拒绝。
- **5.3**：接入建议里的 rollback 章节要引用 §3 的七类 reason，说明「关掉 T2 后系统回到哪一档」。
- **4.1**：`degraded` 状态提示与本文共用同一套 reason 码（见 `action-visibility.md` §2）。
