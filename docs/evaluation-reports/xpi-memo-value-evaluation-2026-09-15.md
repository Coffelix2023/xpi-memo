# xpi-memo 运行期价值评估（2026-09-15）

**评估问题**：模拟用户运行 `pi agent` 时，`xpi-memo` 记忆工具在运行过程中真正起了什么作用。

**方法**：真实数据取证（1248 个真实会话的 L0 / bank / 导出层）+ 6 次真机配对调用（隔离数据目录）。

**边界**：本文不改代码、不动任何真实 bank。所有隔离实验用 `XPI_MEMO_DATA_DIR` 指向临时目录，跑完可删。`XPI_MEMO_PAUSED` 的真机对照除外——它读真实 bank，但只读不写。

---

## 0. TL;DR

| 结论 | 一句话 |
| --- | --- |
| **真正在起作用的是「自动注入」这一条路径** | 1 条全局偏好，在 1248 个会话里被自动注入了 **971 次**，并实测改变了模型回答（前 3 次真机对照可复现）。 |
| **自动捕获（activation loop）在真机上从未生效** | 20 次 candidate 全部来自模型**主动调用** `xpi_memo_remember`；`input:` provenance 在 1248 个会话里出现 **0 次**。根因已定位到一个 ctx 对象引用失配（§3）。 |
| **成本很低，但不是零** | 注入内容约 207 字符 ≈ 70 token/会话；但每次会话启动要起 **2 个 mnemosyne 子进程**（0.37–0.41 s each），约 **0.8 s 强制延迟**。 |
| **治理层的写入门禁存在形状盲区** | `api[*_-]key\s*[:=]` 能拦住，`API key 是 <值>` 拦不住。实测该形状的 `sk-proj-…` 进入了 T1 bank 且以明文出现在 `markdown/daily/`（默认 `privacy:false`）。 |
| **反馈闭环实际为空转** | 两周内显式反馈 0 条（helpful/wrong/irrelevant 全 0），仅有 9 条被动 `used`。`feedbackAdjustment` 的 ±0.1/0.25 权重从未被触发。 |

---

## 1. 方法

### 1.1 真实数据取证（只读）

数据源 `~/.pi/agent/xpi-memo/`，时间窗 2026-09-01 → 2026-09-15（15 天，1248 个会话目录）。

复现命令：

```bash
cd ~/.pi/agent/xpi-memo
ls sessions | wc -l                                    # 1248
cat sessions/*/events*.jsonl | wc -l                   # 124002 条 L0 事件
mnemosyne export /tmp/e.json && node -e '…'            # bank 当前状态
```

### 1.2 真机配对调用（6 次）

| # | 变量 | 结果 |
| --- | --- | --- |
| 1 | 真实 bank，正常 | 回答正确并给出记忆 id `5482e0d92062fd73`；L0 有 `memory_injected` |
| 2 | 真实 bank，`XPI_MEMO_PAUSED=true` | **仍回答正确**——模型改走显式 `xpi_memo_recall` 工具调用 |
| 3 | 空数据目录 | 回答 `无记忆`（阴性对照，证明结论由记忆产生而非模型先验） |
| 4 | 隔离目录，写偏好后立刻重放 | 首次**未落盘**；`--continue` 重放后生成 candidate |
| 5 | 隔离目录，另一个偏好句式 | **完全无事件**：无 candidate、无 reject、无 memory_failed |
| 6 | 隔离目录 + 探针扩展 | 直接证明 hook ctx 身份失配（§3） |

---

## 2. 已确认事实（可复现）

### 2.1 L0 事件构成（1248 会话 / 124,002 事件）

| 事件类型 | 数量 | 读法 |
| --- | --- | --- |
| `tool_call` / `tool_result` | 60,528 / 60,519 | L0 的绝对主体是对话轨迹，不是记忆 |
| `user_message` | 1,919 | |
| **`memory_injected`** | **972** | 自动注入的唯一证据 |
| `candidate_created` / `candidate_confirmed` | 20 / 20 | **全部** `source: tool_call` |
| `t1_memory_write` | 10 | |
| `routing_rejected` | 6 | 含 2 次 `project-identity-required` |
| `memory_failed` | 2 | 均为 `prohibited-content:secret` / `:token` |

### 2.2 注入的收敛度：5 个 id，1 个绝对主力

```
distinct injected ids = 5
  972×  5482e0d92062fd73   用户喜欢用 zsh,偏好 TL;DR 结论优先的中文回复
   83×  512280b79d78855e   xpi-memo 优化契约二次审核（project_decision）
   83×  3f9f519622c52e91   design-deck 锁定优化实施契约（project_decision）
   68×  fdb12d6fea155232
   65×  96568d9bfd3abffc
```

- **971 个会话恰好注入 1 条记忆**，1 个会话注入 2 条。注入粒度是「每次会话一条」。
- 有注入的会话 972 / 1248 = **77.9%**；其余 22% 全落在 2026-09-01 ~ 09-04（该偏好 09-03 才写入）。
- default bank 只有 **2 条** row。第二条（蓝紫色偏好）**从未被注入过**（`recall_count: 2`，最后召回 09-04）。
- `5482e0d92062fd73` 的 `recall_count` 已涨到 **1113**，`importance: 1.0`——mnemosyne 的 recalled-count 机制确实在跟随注入累积。

### 2.3 项目级记忆：设计成立，覆盖极窄

- **31 个项目 bank 共 19 MB**（每个 564 KB–1024 KB，SQLite 固定开销为主）。
- 真正被注入的项目记忆只有 §2.2 里的两条 `project_decision`（各 83 次），来自同一个项目。
- 其余 bank 有真实 row 但几乎未被召回：`project_gene`（git 纪律）、`project_gotcha`（vitest 644 passed）、若干 `project_decision`。
- `MEMORY.md` 共 27 行、7 条记忆：1 gene + 1 decision + 1 gotcha + 3 `Unclassified`（标 `source missing`）+ 2 全局偏好。

### 2.4 导出层：`source missing` 是**正确行为**，不是 bug

3 条 `Unclassified` 是 bank 有 row、但无对应 `t1_memory_write` 的历史残留（含蓝紫色偏好，写于 09-04，早于该 P0 的修复）。设计选择是**保留并标注**而不是丢弃或猜测——这一点按设计工作。

### 2.5 成本

| 项 | 实测 |
| --- | --- |
| 注入内容体积 | 207 字符（recall block 111 + profile block 94）≈ **70 token / 会话** |
| 每次会话启动的召回次数 | **2 次**（EN 模板 + ZH 模板，`src/index.ts` 双路查询融合） |
| `mnemosyne recall` 单次耗时 | **0.37–0.41 s** → 会话启动约 **+0.8 s 强制延迟** |
| ripgrep 降级档 | 8.6 ms 扫完 23 MB |
| `scripts/bench.ts` | append 0.024 ms/event；增量导出 1.0 ms（全量 250 ms）；identity 0.034 ms/call |

降级链本身健康：`none`/`local` 档不阻断写入，云端 embedding 失败时召回降级到 FTS。

### 2.6 EN 模板是空转的

```bash
mnemosyne recall "restore project context decisions constraints preferences unfinished work" 5
# → results: 0
mnemosyne recall "项目 决策 约束 偏好 未完成工作" 5
# → results: 1  (5482e0d92062fd73, score 0.1803)
```

底层 embedding 是 `BAAI/bge-small-en-v1.5`（英文单语）。英文模板对中文语料结构性零命中——这解释了为什么 `plan-note-03` 要加 ZH 双路查询。代价是那 0.8 s 里有约一半花在一个永远返回 0 的查询上。

### 2.7 写入门禁的形状盲区（本轮唯一的风险项）

| 输入 | `classifyProhibitedContent` | `redactCredentials` |
| --- | --- | --- |
| `API key: sk-proj-…` | ✅ `secret` → 拒绝写入 | ✅ `[REDACTED]` |
| `我的 API key 是 sk-proj-abc123def456 记住它` | ❌ `null` → **放行** | ✅ `[REDACTED]` |

实测结果：该形状的 row 确实进了 `project-p-8272b2d1ddac` 的 T1 bank，**且以明文**出现在 `markdown/daily/2026-09-06.md`（`privacy:false` 是默认值，而 `privacy:false` 时导出层不做任何脱敏）。

- 该 row 是**合成测试数据**（`sk-proj-abc123def456`），不是真实密钥。
- `MEMORY.md` 未含该值（`grep -c` = 0）。
- 结论：**拦截器有形状盲区，脱敏器是唯一兜底**；而兜底在默认配置下是关闭的。

---

## 3. 根因：自动捕获为何在真机上 0 命中

**位置**：`src/index.ts`（input hook 与 before_agent_start hook）。

```js
// input hook
lastInputByContext.set(ctx, { eventPosition: … , source: `input:${event.source}`, text: event.text });

// before_agent_start hook
const input = lastInputByContext.get(ctx);      // ← 同一个 ctx 才能命中
if (input?.text === event.prompt)
  await activateExplicitMemoryIntent(event.prompt, { … }, input);
```

`lastInputByContext` 是 `WeakMap`，键是 hook 收到的 `ctx` 对象。

**真机行为（探针实测两次）**：

```
SESSION_START set(ctx)
INPUT        set(ctx)="回复 OK"
BEFORE       get(ctx)=undefined   prompt="回复 OK"   MATCH=false      ← 永远失配
```

`pi` 给 `session_start` / `input` / `before_agent_start` 传的是**各自独立的 ctx 对象**（探针同时打印了 ctx 的键集合，`session_start` 含 `ui/model/sessionManager`，`input`/`before_agent_start` 是另一套）。

**因果链**（前两项为实测，后两项为直接推论）：

1. 真机上 `input` 分支永远进不去 → `activateExplicitMemoryIntent` **不执行**。
2. 唯一进入路径变成模型主动调用 `xpi_memo_remember`，此时 `rememberProvenanceFor` 的 `lastInputByContext.get(ctx)` 也失配，回落到 `toolCallProvenance` → provenance 记为 `tool_call`。
3. 这解释了：20/20 candidate 与 21/21 idempotency 条目全部 `source: tool_call`；`t1_memory_write` 的 10 条源里 **9 条无 source、1 条 `tool_call`**；以及 `input:` provenance 在 1248 个会话中出现 **0 次**。
4. 同一条链解释了第 4/5 次真机实验：不主动调用工具 → 什么都不落盘。

**最有力的旁证**：仓库自己的集成测试 `src/activation-loop.integration.test.ts:256,370` 断言 `source: "input:interactive"`——它用一个**共享 ctx** 依次调两个 hook handler，因此测试通过，而真机上这个状态从未出现过。

**第二个独立缺口（实测）**：把 ctx 失配绕开之后，意图抽取仍然过窄——

```js
extractExplicitMemoryIntent("我更喜欢用中文回答,每次都要默认中文。回答 OK")
// → {"reason":"ambiguous-intent","type":"skip"}     // 偏好 + 流程两个 pattern 同时命中
extractExplicitMemoryIntent("记忆偏好: 用户回复一律使用中文。只回答 OK")
// → {"kind":"global_preference","type":"memory"}    // 单 pattern 才通过
```

即：修好 ctx 之后，自然口吻的偏好陈述仍会被 `ambiguous-intent` 丢掉。

---

## 4. 未决问题

1. **真机 TUI 会话是否与 `-p` 打印模式一致？** 我只能在 `-p` 下做探针（隔离数据目录，不污染）。若 TUI 复用同一 ctx，则 §3 只在 `-p` 下成立。
   **验证成本极低**：在 TUI 里说一句「我偏好 X」再看 L0 有无 `candidate_created`。这是唯一还没关闭的口子。
2. **「记忆改变行为」的量化**：本轮只证明了「模型能读到并复述」。若要证明它改变了**输出形制**（例如偏好表格就给表格），需要同一 prompt 的 N 次重复对照，本轮未做（预算外）。
3. **项目级覆盖为何低**：数据只能说明结果（31 个 bank、注入 2 条），无法区分三个候选原因——非 Git 目录需显式 `xpi_memo_init`、候选需人工确认、意图抽取过窄。三者都指向 §3 的同一上游。
4. **`sk-` 形状盲区是否有真实数据受害**：我只查到了合成测试值。全量 15 天扫描未发现真实密钥形态。

---

## 5. 建议

按「收益/成本」排序。**前两项是同一个 bug 的两半**，一起修才有效。

### P0-1 修 ctx 失配（1 处，约 3 行）

不要按 ctx 对象索引输入态。用一个「最近一次输入」的会话级变量（进程内单会话，`l0ForHooks()` 已经是这个假设），或把两个 hook 的 ctx 统一到 session 生命周期对象。

- 验收：真机 TUI 里说「我偏好 X」，L0 出现 `candidate_created` 且 provenance 为 `input:interactive`；集成测试改为**用两个不同 ctx 对象**驱动，该测试必须先红再绿。
- 影响：修好后自动捕获才存在。这是所有 §3 结论的开关。

### P0-2 放宽意图抽取的 `ambiguous-intent`（`src/memory-intent.ts`）

多 pattern 命中时按优先级裁决，而不是直接 skip（偏好 > 流程 > 约束）。

- 验收：§3 里那条被 skip 的自然语句产出 `global_preference`；现有 20 个 candidate 的来源分布开始出现 `input:`。

### P0-3 补齐 `classifyProhibitedContent` 的形状（`src/content-policy.ts`）

`SECRET_PATTERN` 要求 `[:=]`，抓不到「是 / 为 / is」这类自然语言赋值。加一条前缀 token 形态的判定（`PREFIXED_TOKEN_PATTERN` 已经有现成正则，复用它做分类），或直接把 `redactCredentials` 的前置检查提到写入门禁。

- 验收：`我的 API key 是 sk-proj-…` 在**写入前**被判为 `secret`。
- 影响：修好前，脱敏器是唯一兜底，而默认 `privacy:false` 把它关着。

### P1-1 删掉 EN 模板冗余查询（或让它有命中才保留）

英文单语 embedding 下 `restore project context…` 结构性 0 命中，却占掉约 0.4 s 会话启动延迟。

- 验收：会话启动召回耗时从 ~0.8 s 降到 ~0.4 s；`memory_injected` 内容不变。
- 反例保护：若将来换多语 embedding，把 EN 模板加回来——所以用「命中即保留」或配置项，不要硬删。

### P1-2 定期反馈通道为空转

`feedbackAdjustment` 的 ±0.1 / −0.25 / −0.5 权重在两周内从未触发。要么让用户能低成本说「这条不对」（`xpi_memo_feedback` 已存在，但从未被调用），要么承认它是死代码并删掉。

### MVP（本轮建议的最小落地）

只做 **P0-1 + P0-2**：两处改动、约 10 行、两个测试。它们把「自动捕获」从「设计上存在、真机上不存在」变成「存在且可观测」。

- 验收检查（3 条，全部真机）：
  1. TUI 说一句自然偏好 → L0 有 `candidate_created`，provenance `input:interactive`。
  2. 同句重放两次 → 无重复（`idempotency.json` 命中）。
  3. `pnpm typecheck` + `pnpm -w run lint` + `pnpm test` 全绿。

**明确不做（本轮）**：不做 A/B 行为量化、不改 ranking 权重、不管反馈通道、不动 31 个项目 bank 的清理。

---

## 6. 需要显式标注的不确定性

- §3 的根因是「探针实测 + 数据收敛 + 测试旁证」三重指向的结果。唯一未闭合的是 TUI 是否与 `-p` 行为一致（§4-1）。
- §2.7 的明文残留是**合成测试值**，不代表真实泄漏；风险在形状盲区本身，不在已有的数据上。
- 本报告的所有数字都带复现命令或明确来源文件；推断部分已单独标注，未与实测混写。
