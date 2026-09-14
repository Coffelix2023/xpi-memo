# T2 评估基线：xpi-memo + Mnemosyne

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 1.1。

**作用**：把「当前系统」钉成一个可复现的快照。之后任何候选（`memvid` / `memU` / `Memori` / `agentmemory`）都必须与**这一份**基线比较，否则数字不可比。

**边界**：本文只记录基线的版本、配置、召回输出格式与指标口径，不改运行时、不安装候选、不触碰 T1/L0 数据。

---

## 1. 版本快照

采集时间：2026-09-14（本地 machine：macOS / arm64，M 系列）。

| 组件 | 版本 / 值 | 来源 |
| --- | --- | --- |
| xpi-memo | `1.1.1`（git `ed18786`） | `package.json`、`git rev-parse --short HEAD` |
| Node.js | `v24.20.0` | `node -v` |
| pnpm | `11.24.0` | `package.json#packageManager` |
| Mnemosyne | `3.15.1`（`mnemosyne-memory`） | `~/.local/share/uv/tools/mnemosyne-memory/.../mnemosyne_memory-3.15.1.dist-info` |
| embedding 模型 | `BAAI/bge-small-en-v1.5`，384 维，本地 fastembed（ONNX） | `~/.hermes/mnemosyne/config.yaml#embedding_model` |
| ripgrep | `15.2.0` | `rg --version` |
| qmd | 未安装 | `which qmd` |
| Mnemosyne DB（默认 bank） | `~/.hermes/mnemosyne/data/mnemosyne.db` | `mnemosyne stats` |
| xpi-memo 数据目录 | `~/.pi/agent/xpi-memo`（可被 `XPI_MEMO_DATA_DIR` 覆盖） | `src/config.ts` |

**基线事实（对评估结论有影响）**：默认 embedding 模型是**英文单语**模型（`bge-small-en-v1.5`）。中文语义召回因此在基线里并未被专门优化——这正是本次评估要量化的缺口，而不是一个偶然配置。

## 2. 生效配置

xpi-memo 侧（`DEFAULT_XPI_MEMO_CONFIG`，用户配置未覆盖时生效）：

| 键 | 值 | 对评估的影响 |
| --- | --- | --- |
| `searchBackend` | `auto` | 回退链 `configured → mnemosyne → ripgrep → qmd` |
| `retrievalMode` | `hybrid` | 向量 + FTS 融合 |
| `limit` / `globalLimit` / `projectLimit` | `5` / `5` / `5` | 场景集 `topK` 与之一致 |
| `recallPolicy` | `high-value-auto` | 决定 query 是否真的触发召回 |
| `paused` | `false` | `XPI_MEMO_PAUSED` 未设置 |
| `dataDir` | `~/.pi/agent/xpi-memo` | 评测使用临时目录隔离 |
| `offlineExtractionEnabled` | `false` | T2 派生提案当前不启用 |
| `sleepMode` | `disabled` | 无离线合并调用 |

Mnemosyne 侧（`~/.hermes/mnemosyne/config.yaml`）：

| 键 | 值 | 对评估的影响 |
| --- | --- | --- |
| `embedding_model` | `BAAI/bge-small-en-v1.5` | 中文语义召回的主要瓶颈 |
| `embeddings_off` | `false` | 本地向量可用，`dense_score` 有值 |
| `embedding_dim` | `384` | 向量维度 |
| `default_scope` | `session` | xpi-memo 的 T1 durable 写入显式改成 `global` |
| `fts_weight` | `0.3` | 与 `vec 0.5` / `importance 0.2` 组成最终分权重 |
| `db_path` / `data_dir` | 空 | 由 `MNEMOSYNE_DATA_DIR` 决定，评测据此隔离 |

评测隔离方式：runner 把 `MNEMOSYNE_DATA_DIR` 指向临时目录，`MNEMOSYNE_DEFAULT_SCOPE=global`、`MNEMOSYNE_LLM_ENABLED=false`，**不读写用户的真实 bank**。

## 3. 召回输出格式

### 3.1 Mnemosyne CLI（`recall <q> <top_k> --explain --json`）

基线实际调用的命令（`src/recall.ts`、`src/search/mnemosyne-backend.ts`）：

```
mnemosyne recall <query> <limit> --explain --json
```

关键字段（评估只依赖这些）：

| 层级 | 字段 | 含义 |
| --- | --- | --- |
| 顶层 | `engine` | `linear`（当前值） |
| `results[]` | `id`, `content`, `score`, `timestamp`, `tier`, `importance` | 召回正文与最终分 |
| `results[]` | `source` | `kind=..;ev=..;prov=..;ts=..;src=..`，**证据来源就存在这里** |
| `results[]` | `superseded_by`, `valid_until` | 失效/被取代标记 |
| `results[]` | `voice_scores.{vec,fts,keyword,importance,recency_decay}` | 分项得分，用于诊断中文语义瓶颈 |
| `explain.embedding.available` | bool | 向量是否可用（决定 `retrieval.fallback`） |
| `explain.stages[]` | `wm_primary` / `em_fallback` 的 `fallback_used` | 降级证据 |
| `explain.weights` | `{vec: 0.5, fts: 0.3, importance: 0.2, temporal: 0.0}` | 融合权重 |
| `explain.candidates[]` | `source_path`, `rank`, `kept`, `drop_reason`, `scores` | 召回内部决策链 |

### 3.2 xpi-memo 归一化结果（`RecallResponse`）

`src/recall.ts` 把 CLI 输出归一化，评测报告记的就是这一层：

```
{
  queriedBanks: string[],
  results: [{
    bank, content, id, kind, scope,
    score, confidence?, timestamp?,
    supersededBy?, sessionId?, source?,
    provenance: { bank, layer: "T1", source: "mnemosyne" }
  }],
  retrieval: { embeddingAvailable: boolean, fallback: boolean, mode: "hybrid" }
}
```

与基线相关的归一化规则（评估必须遵守，否则数字不可比）：

- **默认 bank 只放行** `global_preference` / `global_workflow` / 当前 session 的 `session_context`；项目类记忆不会漏到 global 召回。
- **跨 bank 去重**：按 `id`，无 id 时按 `content.trim()`。
- **正文截断** 500 字符（超出加 `…`）。
- 排序按 `score` 降序，再 `slice(0, limit)`。

### 3.3 模型可见输出（`xpi_memo_recall`）

工具返回 JSON 字符串，附加 `searchBackend`、`untrusted: true`、`safety{blocked,omitted,policyVersion,reasons}`，失败时给 `warning`。`details` 侧携带 `backendState`（`backend-not-run` / `backend-queried-no-hits` / `backend-queried-with-hits`）、`queriedBanks`、`resultCount`、`status`。**降级可观测性就从 `backendState` + `warning` + `retrieval.fallback` 三处读。**

## 4. 指标口径

指标定义、字段类型与报告结构见 `docs/evaluation-reports/t2/result-format.md`。本文件只锁口径来源：

| 指标 | 基线来源 |
| --- | --- |
| recall（命中率） | 场景集 `groundTruth` 与返回 `id` 的集合比较 |
| 误召回 | 返回结果中既非 `groundTruth` 也非 `bridge` 的条目 |
| 证据完整性 | `source` 里的 `kind` / `prov` 是否可解出 |
| 延迟 | 单次 recall 墙钟时间 + `BackendMetric.durationMs` |
| 资源占用 | runner RSS 增量 + 隔离 data dir 磁盘占用 |
| 降级 | 回退链 attempts、`retrieval.fallback`、`explain.stages[].fallback_used`、`warning` |

## 5. 未改变证明（`pnpm test`）

任务 1.1 要求「用 `pnpm test` 验证现有行为未被改变」。本变更只新增 `docs/` 与 `scripts/` 下的评估产物，`src/**` 零改动，测试结果与改动前一致：

```
$ pnpm typecheck
$ tsc --noEmit            # 无输出，退出码 0

$ pnpm -w run lint
$ biome check .           # 通过

$ pnpm test
 Test Files  72 passed | 4 skipped (76)
      Tests  702 passed | 7 skipped (709)
   Duration  3.40s
```

跳过项为需要真实 Pi 会话或显式开关的集成测试（`XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION` 等），与本次改动无关。
