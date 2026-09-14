# 计划：xpi-memo 记忆体优化

- 工作流标识: `xpi-fast-fix-2026-09-04-xpi-memo-memory-optimization`
- 创建时间: `2026-09-04T14:04:30+0800`
- 原始需求摘要: 优化本项目 `xpi-memo`，按照 `docs/plans/plan-note-04.md` 指定开发任务。
- `planStatus: archived`
- `executionStatus: deferred`
- 关联文件: [`README.md`](./README.md)、[`tasks.md`](./tasks.md)、[`tasks.initial.md`](./tasks.initial.md)

## 目标

- 补全候选确认路径的 `t1_memory_write` 证据链。
- 在项目导出前进行有界、幂等的存量回填。
- 默认开启本地 Markdown 导出，并在成功写入后进行 500ms debounce（防抖）导出。
- 非 TUI（文本/远程调用模式）下自动确认高置信 `explicit-user-statement`。
- 将 mechanical sleep 改为本地确定性维护与导出层去重。
- 提供 agent 可调用的 `xpi_memo_init` 工具及结构化 `recovery`（恢复指引）。
- 为 `session_before_compact` 补充 bounded offline extraction（有界离线提取）触发。
- 同步架构文档与评审状态。

## 非目标

- 不引入 outbox（待发送箱）、`t1-write-coordinator` 或其他新状态面。
- 不引入新运行时依赖或构建步骤。
- 不默认开启 Track B 自动捕获。
- 不实现语义相似度合并、遗忘频率模型或完整 consolidation（整合）。
- 不自动删除历史数据；清理优先归档。
- 不修改 `/xpi-memo-init` 机制本身。

## 证据

- `src/index.ts:966` 已存在 L0（低层会话事件）先写、失败中止、再写 T1（长期记忆）的直接写入模式。
- `src/candidate-lifecycle.ts:170` 的 `confirm()` 当前只调用 `adapter.store()`，未写入 `t1_memory_write`。
- `src/repo-export.ts:257` 的 `exportProjectMemory()` 当前只读取 live bank 并渲染 Markdown，没有回填流程。
- `src/config.ts` 的 `DEFAULT_XPI_MEMO_CONFIG.autoExport` 当前为 `false`。
- `src/index.ts:535` 的非 TUI `chooseCandidateAction()` 当前固定返回 `later`。
- `src/index.ts` 已存在 `xpi_memo_init` slash command，但尚未注册同名 agent 工具。
- `src/sleep-execution.ts` 的 mechanical 分支当前仍调用外部 `sleep`。
- `src/index.ts:2372` 的 `session_before_compact` 当前只触发 recall。
- 修改前基线门禁已通过：`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`；580 个测试通过，6 个跳过。
- 当前仓库没有 `MEMORY.md`；用户目录下现有文件仅 3 行，不能证明存在计划所述存量 8 条记忆。

## 根因与假设

根因是直接写入、候选确认、导出和离线提取各自已有部分能力，但没有共享完整的证据链和导出触发策略。

待验证假设：

- live bank 中是否确实存在无 L0 事件的存量记忆。
- fingerprint（内容指纹）是否足以保证回填幂等。
- debounce 的生命周期可在 Pi 主进程退出前安全清理。
- mechanical 去重可在导出层表达，不需要修改 SQLite（数据库）。

## 推荐方案

1. 全局清理先 dry-run（演练）列举精确目标；疑似历史数据归档，确认空壳后才删除。
2. 复用 `executeRemember()` 的 L0-first 模式，在候选确认前补写 `t1_memory_write`。
3. 将 backfill（回填）作为 export 前置有界扫描，不增加独立命令；使用 fingerprint 幂等。
4. 将 `AUTO_EXPORT` 默认值改为 `true`，写入成功后使用模块级按项目 debounce；shutdown 时清理 timer，保留全量导出兜底。
5. 仅对非 TUI 高置信 `explicit-user-statement` 自动确认，其他候选仍排队。
6. mechanical sleep 只做本地 Markdown 导出、精确重复标记和近重复报告；`supersededBy` 仅写入导出结果，不修改 SQLite。
7. 用已有 `initializeLocalProject()` 实现 agent 工具，并提供 agent/TUI/CLI 三通道恢复信息。
8. 复用既有 offline extraction 与 budget（预算）账本，补充 compact 触发。
9. 最后同步文档并执行全量门禁。

## 放弃方案及原因

- outbox 与写入协调器：现有 L0-first 顺序已闭合核心证据链，新状态面会增加一致性和崩溃窗口成本。
- 独立 backfill 命令：导出前置扫描已覆盖实际触发点，新增命令违反最小改动原则。
- `tokensUsed`：已有字符级成本账本足够作为诚实代理。
- doctor 常驻 `legacy_structure` / `foreign_config` 检测：一次性清理问题不应增加永久运行时逻辑。
- 语义相似度自动合并：风险高且不在本次最小修复范围。

## 涉及范围

代码重点：`src/candidate-lifecycle.ts`、`src/index.ts`、`src/repo-export.ts`、`src/config.ts`、`src/sleep-execution.ts`、`src/routing.ts`、`src/offline-extraction.ts` 及对应测试。

文档重点：`ARCHITECTURE.md`。

运行环境重点：`~/.pi/agent/` 下计划列出的历史目录；清理只允许归档优先，禁止未经确认删除。

## 决策

- 采用最小变更，不新增依赖、不新增构建步骤。
- L0 写入失败时中止 T1 写入。
- `AUTO_EXPORT` 默认开启，但 Track B 和语义 sleep 默认关闭。
- mechanical 去重不修改 SQLite。
- 无法证明“存量 8 条”时，不把该数量作为事实；改用新确认记忆可见作为可验证验收。

## 风险与兼容性

- 默认导出会增加本地文件写入；导出失败不得阻塞主流程。
- 回填必须幂等，重复导出不得生成重复 T1 记录或事件。
- 非 TUI 自动确认范围必须严格限制为高置信显式用户陈述。
- mechanical sleep 不执行外部模型或 CLI；近重复只记录 audit/status，不改数据。
- 全局清理遇到无法确认归属的数据时暂停并报告。
- 每个阶段独立验证；验证失败立即停止，不继续后续阶段。

## 验证命令

基础门禁：

```bash
pnpm typecheck
pnpm -w run lint
pnpm test
```

完成前还需：

```text
lens_diagnostics(mode="all")
```

各任务的专用验证命令见 [`tasks.md`](./tasks.md)。

## 验收标准

- 所有任务完成且 `tasks.md` 与 `tasks.initial.md` 的任务 id、顺序一致。
- 候选确认、直接写入和回填路径均具备可追溯 L0 事件。
- 有证据支持时，存量记忆完成回填；无证据支持时，至少验证新确认记忆进入 `MEMORY.md`。
- 自动导出、非 TUI 自动确认、mechanical 维护、agent 初始化和 compact 触发均有测试覆盖。
- 基础三条门禁和 `lens_diagnostics(mode="all")` 均无阻塞错误。
