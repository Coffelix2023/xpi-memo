# plan-note-04 · xpi-memo 记忆体优化实施计划(二审修正版)

- **日期**:2026-09-04
- **来源**:`docs/feedback/26-09-04/`(feedback-0904-1/2 实测报告 + 两份评审意见)+ `plan-update-0904-1.md`
- **决策方式**:design-deck 六张 slide 全部按推荐项锁定,随后**对照当前代码逐项二审**,砍掉过度设计
- **状态**:待实施

## 0. 与 plan-update-0904-1 的关系

plan-update-0904-1 获评审批准(带三个修改条件)。本计划**继承其目标与边界**,但二审发现其最重的架构设计(outbox + t1-write-coordinator)已失去必要性:

> 直写路径已用「L0 先写、失败即中止」(index.ts `t1_memory_write` dual-write,注释 "Dual-write: L0 first (source of truth); abort the operation if it fails.")闭合证据链,并经 feedback-0904-2 实测通过。confirm 路径照抄同一模式即可,**不需要引入第六个状态面**。评审对「六状态面一致性」的担忧是给 outbox 方案算的账——方案取消,账随之取消。

## 1. 上轮评审项状态表(评审条件 #3)

| 评审项 | 状态 | 证据 |
|---|---|---|
| 注入可见化(双路注入) | ✅ 已完成 | `audit.ts:40 injectedCount`;feedback-0904-2 实测 `injectedCount: 2` |
| `RECALL_ZERO_STREAK` | ✅ 已完成 | `src/doctor.ts:6 RECALL_ZERO_STREAK_THRESHOLD = 10` |
| 证据链闭合(候选确认路径) | ⚠️ **半成** | 直写路径已闭合;`candidate-lifecycle.ts:170 confirm()` **不发 `t1_memory_write`** → 本计划阶段 1 |

## 2. 二审结论:已有 vs 缺失

| 契约项 | 代码现状 | 处置 |
|---|---|---|
| mechanical sleep | `mechanical` 模式存在但仅调 mnemosyne `sleep` CLI(sleep-execution.ts 尾部 `run(["sleep"])`) | 保留,改为本地维护(见阶段 3) |
| 存量 backfill | 全仓 0 处 `backfill` | 保留,并入 export 前置扫描,不新建命令 |
| AUTO_EXPORT | 已接线 `session_shutdown`(index.ts:2393,Task 9.3),默认 `false` | 默认翻 `true` + 写入后 debounce 触发 |
| xpi_memo_init | 仅 slash command(index.ts:2114);`initializeLocalProject()` 已存在(local-identity.ts) | 新增工具 = 薄封装 + 错误加 `recovery` 字段 |
| Track B | shutdown 触发、预算账本(chars/executions/proposals)、诊断、govern 管道**全部已实装**(offline-extraction.ts + extraction-budget.ts) | 只补 compact 触发 + 实机验证;`tokensUsed` 砍掉(字符预算已是诚实的成本代理) |
| 全局清理 | `detectOrphanBanks` 已实装并暴露于 status(status.ts:30, task 6.4) | 不新增 `legacy_structure`/`foreign_config` 永久检测(一次性问题不配常驻代码,YAGNI);清理为一次性手工动作 |
| 非 TUI 自动确认 | `chooseCandidateAction` 非 TUI 仍 `return "later"`(index.ts:543)——plan 决策 3 **已批准未实装**,deck 遗漏 | 补入契约(阶段 2) |

### 被砍掉的过度设计

1. outbox + `t1-write-coordinator`(两个新文件 + 全套崩溃窗口测试)。
2. `tokensUsed` 度量(字符级预算账本已满足「一等成本治理」)。
3. doctor 的 `legacy_structure`/`foreign_config` 常驻检测项。
4. 独立 backfill 命令。

修正后工作量约为 plan-update-0904-1 原估计的 40%。

## 3. 实施契约(design-deck 六决策 + 二审修正)

1. **mechanical sleep 三职责版**(评审条件 #1 修正):本地确定性维护 = Markdown export + 确定性去重(同 bank 同 kind 精确重复标 `supersededBy`;近重复只报告,写 audit + status,不动数据)。不调外部 CLI,不需要 `XPI_MEMO_SLEEP_MODEL`。recovery 职责删除(无 outbox,无可恢复状态)。语义合并继续留给 configured sleep。
2. **证据链补全 + 存量回填**(评审条件 #2):confirm 路径补发 `t1_memory_write`(与直写路径同款 dual-write 模式);export 前置 bounded 扫描,对「已存储但无 L0 事件」的 gist 补发 `t1_memory_write{backfilled: true}`,幂等键 = gist fingerprint。验收:存量 8 条已确认记忆回填后出现在 MEMORY.md。
3. **人读层同步**:`XPI_MEMO_AUTO_EXPORT` 默认 `true`;`t1_memory_write` 成功后 debounce(500ms)触发增量导出;shutdown 全量导出保留兜底。默认值哲学写入 ARCHITECTURE.md:**本地确定性操作默认开启;消耗外部资源/不可逆操作默认关闭**(Track B、语义 sleep 仍默认关)。
4. **xpi_memo_init 工具**(第 5 个工具):agent 可调用,写 `.pi/xpi-memo/project.json`(0600);routing 错误响应结构化 `recovery: { agent, tui, cli }` 三通道,闭环非 TUI「被拒 → 自救」死路。
5. **Track B 验证**:`session_before_compact` 增加 bounded 提取触发(共用 session ledger,不重复消费同一 L0 区间);之后开 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` 跑真实会话,验收止损线三条(证据链闭合 / ≥1 条自动捕获候选 / MEMORY.md 非空)。
6. **全局目录分级清理**:`~/.pi/agent/` 尸体直删(`@mnemosyne-oss` 空壳、`tmp/extensions` 缓存);嵌套 `banks/` ×2 经 dump 校验无独有数据后删;孤儿 project bank 与疑似旧 mnemosyne 键位的 `config.yaml` 归档至 `archive/<date>/`,30 天冷静期;不自动删除任何历史数据。

## 4. 执行序列

| 阶段 | 内容 | 预估改动 | 验收 |
|---|---|---|---|
| 0 | 全局清理(见契约 6) | 纯 shell,零代码 | `~/.pi/agent/` 无空壳/缓存;数据均在 archive |
| 1 | **P0**:confirm 补发 `t1_memory_write` + export 前置 backfill + AUTO_EXPORT 默认 true + 写入后 debounce 导出 | ~150 行 + 测试 | MEMORY.md 含存量 8 条 + 新确认即时可见 |
| 2 | 非 TUI `explicit-user-statement` 自动确认;`llm-extracted` 仍排队;paused/bank 缺失/策略拒绝/不确认 | ~30 行 | 非 TUI remember 高置信直接 stored |
| 3 | mechanical sleep 本地维护化 + 确定性去重 | ~100 行 + 测试 | 无 sleep model 可执行;精确重复标 supersededBy |
| 4 | `xpi_memo_init` 工具 + routing 错误 `recovery` 三通道 | ~80 行 | agent 收到拒绝后可自主 init 并重试成功 |
| 5 | Track B compact 触发 + 实机验证 | ~40 行 + 实测 | 止损线三条全过;否则启动 ai-memory 外挂评估(纪律) |
| 6 | 文档:评审项状态表(本文 §1)同步 + 默认值哲学入 ARCHITECTURE.md | 纯文档 | — |

### 每阶段纪律

- 独立分支 + 小粒度 Conventional Commits;不直推 main;PR 后停在人工确认。
- 门禁三条全绿才进下一阶段:`pnpm typecheck` / `pnpm -w run lint` / `pnpm test`,再 `lens_diagnostics(mode="all")` 无阻塞。
- 每步可回滚;清理阶段一律归档优先于删除。

## 5. 明确不做

- 不默认开启 Track B 自动捕获;不引入新运行时依赖或构建步骤。
- 不做 `supersededBy` 语义相似度合并、遗忘频率模型、完整 consolidation。
- 不改非 Git 目录 `/xpi-memo-init` 机制本身(只补 agent 自救通道)。
- 不引入 outbox/协调器等新状态面;不伪造跨 SQLite/CLI/L0 事务。
