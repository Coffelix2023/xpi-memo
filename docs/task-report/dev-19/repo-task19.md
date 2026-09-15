# Task Report: evolve-memory-runtime task 6.x

## 完成范围

本次完成 Section 6(Verification and rollback)全部 4 个任务,进度从 17/21 推进到 **21/21**。

### 目的

前 17 个任务把能力做出来了,但"做出来"和"能安全上线"是两件事。本节解决三个问题:

1. 新增的五个表面(event stream、footer 状态、status 摘录、profile 注入、passive feedback)在真实 Pi 进程里是否真的可用;
2. 三条质量门(类型/规范/测试)是否有回归;
3. 上线后如果用户觉得吵或不信任,能不能**独立关掉而不影响原有 L0/T1 能力**——这是本节真正的交付物。

### 作用与特点

- **先证明,再声明**:每条结论都对应一条可复现命令的实际输出,不写"应该没问题"。
- **开关是设计的一部分,不是补丁**:三个新表面各自独立成 flag,互不牵连。禁用 profile 注入不会动 recall,禁用事件呈现不会停 L0 写入,禁用被动反馈不会停显式反馈。
- **默认全开、关闭零成本**:默认值与变更前行为完全一致,回滚不需要动数据、不需要迁移、不需要重装。
- **失败必须显形**:冒烟断言的是"失败被命名"(trace 缺参数给 usage、sleep 未配置给 `sleep-mode-not-configured`、recall 给 `backendState`),而不是"没报错就算过"。

### 边界

- 开关只控制**呈现与派生注入**,不控制记忆治理。关掉任何表面,L0 采集、T1 写入、候选队列、证据链、作用域隔离、删除、导出全部照旧。
- `profileInjection=false` 只让 `<user-preference-profile>` 块不注入;profile 投影本身仍可被 status/诊断读取。
- flag 不是安全边界:它们减少噪音与影响面,不替代 privacy / content-policy。
- 真实 Pi 进程的扩展 API 只暴露工具元数据(`getAllTools(): ToolInfo[]`),没有调用他扩展 `execute()` 的入口 —— 工具面冒烟因此由 `live-rpc` / `real-cli` 沙箱承担,见下文"边界说明"。

## 各任务实现要点

| 任务 | 实现 |
|------|------|
| 6.1 focused tests | 11 个相关测试文件共 179 条:event-stream / profile / feedback / status / audit / footer / eval-metrics / cross-session-eval / activation-loop / doctor / index。全部通过 |
| 6.2 三条 gate | `pnpm typecheck` ✓、`pnpm -w run lint`(biome,0 输出)✓、`pnpm test` **751 passed**(较 5.x 的 745 增 6 条:config 3 + cross-session 3) |
| 6.3 isolated Pi smoke | 四个 env-gated 真实进程/CLI 测试共 8 条全绿(见验证证据) |
| 6.4 feature flags + rollback | 新增 `profileInjection` / `eventPresentation` / `passiveFeedback`(env:`XPI_MEMO_PROFILE_INJECTION` / `XPI_MEMO_EVENT_PRESENTATION` / `XPI_MEMO_PASSIVE_FEEDBACK`,默认 `true`),接入 `src/index.ts` 四处门控点;`README.md` + `GUIDE.md` 记录开关与回滚表;3 条行为测试证明关闭后 L0/T1 仍可用 |

### 6.4 门控点

| 表面 | 门控位置 | 关闭后的行为 |
|------|----------|--------------|
| `profileInjection` | `recallForContext` 的 `renderProfileInjection` 调用 | 表达式返回 `null`,上下文块消失,recall 注入不变 |
| `eventPresentation` | `session_start` 的 footer 订阅 + `statusForContext` 的 `events` 字段 | 不订阅事件总线;`status.events` 为空数组 |
| `passiveFeedback` | `executeRecall` 与 `recallForContext` 两处 `canRecordPassiveFeedback` 写审计 | 不写 `feedbackMode: "passive"` 行;显式反馈与纠正不受影响 |

配置层同时补齐 `UserConfig`、`WRITABLE_KEYS`、`ENV_KEYS` 与 `SaveUserConfigOptions`,避免"用户手写 config 键在下一次保存时被静默丢弃"。

## 验证证据

### 6.1 focused(179 tests / 11 files)

```
✓ src/event-stream.test.ts (10)   ✓ src/profile.test.ts (12)    ✓ src/feedback.test.ts (4)
✓ src/status.test.ts (12)         ✓ src/audit.test.ts (17)      ✓ src/footer.test.ts (2)
✓ src/eval-metrics.test.ts (4)    ✓ src/cross-session-eval.integration.test.ts (9)
✓ src/activation-loop.integration.test.ts (10)  ✓ src/doctor.test.ts (22)  ✓ src/index.test.ts (77)
Tests  179 passed (179)
```

### 6.2 gates

```
$ pnpm typecheck      → tsc --noEmit 无输出
$ pnpm -w run lint    → Checked 162 files … No fixes applied(0 issue)
$ pnpm test           → Test Files 77 passed | 4 skipped (81) / Tests 751 passed | 8 skipped (759)
```

### 6.3 冒烟(4 files / 8 tests)

```
$ XPI_MEMO_RUN_PI_INTEGRATION=1 XPI_MEMO_PROBE_OUTPUT=… \
  XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1 pnpm exec vitest run \
  src/isolated-pi.integration.test.ts src/shutdown-model-context.integration.test.ts \
  src/live-rpc.integration.test.ts src/real-cli.integration.test.ts

✓ isolated Pi registration > loads only XpiMemo and registers each command and tool exactly once
✓ isolated Pi lifecycle smoke > serves status, trace and export without hiding failure states
✓ session_shutdown model context > keeps ctx.modelRegistry and ctx.model reachable after an await
✓ task 7.7 live RPC probe > registers once, isolates two git projects, and keeps sleep capability-checked
✓ real Mnemosyne CLI integration > executes all four tools against the real CLI sandbox  (+3)
Test Files 4 passed (4) / Tests 8 passed (8)
```

新增的 `isolated Pi lifecycle smoke` 在真实 `pi --mode rpc` 子进程里(隔离 `XPI_MEMO_DATA_DIR` + `XDG_CONFIG_HOME`)断言:

- status 输出含 `tiers.T1 = xpi-memo`,且 `events` 是数组、`feedback.passive` 是数字(schema 没被悄悄改);
- `/xpi-memo-trace` 缺目标时打印 usage,不是静默空成功;
- `/xpi-memo-export` 报告 `Exported …` 与 `Output: …`;
- 四个工具各注册恰好一次。

### 6.4 回滚

`src/cross-session-eval.integration.test.ts` 新增 3 条:

1. 关闭 profile 注入:同一 dataDir 下 `onTurn.context` 含 `<user-preference-profile>`,`offTurn.context` 仍含记忆正文但不含该块;
2. 关闭被动反馈:开启时 passive 审计行 > 0,关闭后计数不增,recall 内容不变;
3. 关闭事件呈现:TUI 上下文里有事件行(` · ` 分隔),关闭后没有事件行,而 `remember` 仍然成功写入 bank。

## 修复过程中发现的三个真问题

1. **`isolated-pi` 的 status 断言已 stale**:`status.recall` 实际还带 `backendState`,原 `toEqual` 会失败。该测试此前长期 gated(默认 skip),从未暴露。改为 `toMatchObject` 并注释"后端状态随本地 CLI 变化,必须成立的是 schema"。
2. **`live-rpc` 的 remember 断言与治理设计冲突**:非 TUI 模式下所有 `xpi_memo_remember` 都按设计进入候选队列,断言 `status === "stored"` 永远不可能通过。修正做法是让工具调用使用 TUI 上下文(同时补上测试 ctx 缺的 `setWidget`),而不是放宽断言 —— 存储语义不能为了测试而改。
3. **`live-rpc` 的 sleep 断言缺少前提**:未配置 `XPI_MEMO_SLEEP_MODE` 时返回 `sleep-mode-not-configured`(fail-closed 的正确行为),而断言期望 `dedicated` 模式下的 `dedicated-sleep-model-unsupported`。补上 `XPI_MEMO_SLEEP_MODE: "dedicated"` 后断言与预期语义一致。

另修掉 `cross-session-eval.integration.test.ts` 的 `noAwaitInLoops`(顺序 `await` 改 `Promise.all`),让 biome 输出恢复为零。

## 边界说明:真实进程无法调用他扩展的工具

`pi.getAllTools()` 返回 `ToolInfo[]`(仅元数据),`ExtensionAPI` 没有 `executeTool`;RPC 协议也没有工具调用请求类型。最初尝试在 probe 扩展里直接 `tool.execute(...)` 会得到 `TypeError: tool.execute is not a function`。

因此工具面覆盖拆成两条真实路径,**都实际运行过**:

- 真实 Pi 进程:命令面(status / trace / export)+ 工具注册唯一性;
- 进程内真实治理路径:`live-rpc`(remember / recall / forget / sleep + 项目隔离 + 精确 ID 能力)与 `real-cli`(四个工具打真实 mnemosyne 沙箱)。

这条边界写在测试文件的注释里,不隐藏。

## 状态

`evolve-memory-runtime` 21/21 任务完成,建议 archive。
