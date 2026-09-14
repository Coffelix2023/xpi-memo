# Task 6：memory-forget-exact-id(能力门控删除)

> 本文件是 `openspec/changes/memory-forget-exact-id` 的分组任务报告(AGENTS.md §7)。
> 覆盖全部四个任务组。

## 任务组 1:仓库闸门(Prerequisite: repository gate)

### 目的

让质量闸门在改动之前先变绿,使后续任何失败都能归因到本次变更,而不是被既有噪声掩盖。

### 作用

- `.pi/reports/**` 加入 Biome 忽略清单(`biome.jsonc` files.includes)。
  该目录里的报告是**生成产物**,其中的压缩 CSS 会被 Biome 的 `useSortedProperties` /
  `useTemplate` 误判,并且它的自动修复会把 `margin-top:2px;font-size:12px` 破坏成
  `margin-top:2pxfont-size:12px`——忽略比"让它通过"更安全。
- `package.json` 按仓库 Biome 配置重排(`keywords` / `pi.extensions` / `pi.skills` 数组),它此前未格式化,是 `biome check .` 的另一个(非产物类)失败源。

### 特点

只动配置与格式,不动任何 TypeScript 逻辑;`git diff` 可逐行解释。

### 边界

不调整 Biome 规则集,不放宽任何 lint 级别;`.pi/reports` 之外的文件照常检查。

### 验证(实测)

- `pnpm -w run lint` → exit 0,`Checked 140 files in 68ms`(改动前 exit 1,`Found 86 errors`,错误全部来自 `.pi/reports/token-analysis.html`)。
- 基线(改动前,未触碰源码):
  - `pnpm typecheck` → exit 0。
  - `pnpm test` → `68 passed | 3 skipped (71)` test files,`644 passed | 6 skipped` tests。
  - 记录基线计数是为了让后续失败可归因:本次变更后为 `69 passed | 3 skipped (72)` 文件、`667 passed | 6 skipped` 条(新增 23 条测试,无既有测试被删除或跳过)。

## 任务组 2:上游能力与 adapter 改造(Upstream capability and adapter change)

### 目的

把"缺少精确按 ID 读取能力"从**永久拒绝删除的理由**改成**一次运行时可判定、可诊断、可自动升级的能力结论**:能力不可用时直接删除,能力可用时保留"先写 recovery 再删除"。

### 作用

- 新增能力探测 `probeExactIdReadCapability(run, dataDir)`(`src/banks.ts`):用**不可能存在的 id** 实调一次精确读取候选子命令,按进程 × dataDir 缓存结论(与既有 `which` 缓存风格一致)。
  判定信号只有两类:**子命令存在性**(输出/错误不是 `Unknown command: <cmd>`)**与输出可解析性**(响应能被归类为结构化记录或结构化 not-found)。解析失败按"不可用"处理。
- 新增响应分类 `parseExactIdReadOutcome` 与读取器 `createExactIdReader`(`src/operations.ts`):`record` → 返回记忆行;`not-found` → 返回 `null`;`unparseable` → 抛错(绝不伪装成"这条记忆不存在")。
- adapter 现在默认带 CLI 精确读取器,并暴露 `exactIdReadCapability(dataDir)`;显式注入 `exactMemoryReader` 时视为能力可用(注入即证据)。
- `runT1Delete`(`src/deletion-lifecycle.ts`)按能力分流:可用 → 逐 bank 精确读取 → 写 recovery → 删除(读取不到就试下一个 bank);不可用 → **不读、不写快照**、逐 bank 直接 `delete`,以 backend 的 not-found 结果作为"该 bank 没有目标"的判定,首次成功后立即停止。
- 删除结果新增 `recovery: "none" | "written"`,工具结果暴露 `recoverySnapshot`,审计在全部 bank 未命中时记录 `capability` 结论码(`src/audit.ts` 新增白名单字段)。project bank → default bank 顺序、`xpi_memo_forget(memoryId)` 单参数签名、以及"只有删除成功才记 `memory-deleted-by-user`"的语义均未改动。

### 2.1 上游能力复核记录(实测)

已安装版本:**mnemosyne-memory 3.15.1**(`/Users/felix/.local/share/uv/tools/mnemosyne-memory/lib/python3.12/site-packages/mnemosyne_memory-3.15.1.dist-info/METADATA`)。

| 事实 | 具体路径与位置 |
| --- | --- |
| CLI 只有 `store/recall/update/delete/export/bank/...`,**没有** `get` | `.../site-packages/mnemosyne/cli.py:1621` 的 `COMMANDS` 字典(逐条比对无精确读取项) |
| `delete <id>` 直接 `mem.forget(id)`,不做预读,自带 not-found 判定 | `.../site-packages/mnemosyne/cli.py:226` `cmd_delete` → `_fail(f"Memory not found: {memory_id}", exit_code=1)` |
| Python core 有精确读取,CLI 没接出来 | `.../site-packages/mnemosyne/core/memory.py:552` `Memory.get`;`.../core/beam.py:4265` `BeamMemory.get`(注意其 SQL 形如 `session_id = ? OR scope = 'global'`,即 core 的精确读取自身带会话/全局范围约束) |
| bank 选择仍由 `MNEMOSYNE_BANK` 决定 | `.../site-packages/mnemosyne/cli.py` `_resolve_bank_name` |

探测可用的信号(实测命令与结果,沙箱 `MNEMOSYNE_DATA_DIR=/tmp/mnemo-probe-sandbox`):

```
$ mnemosyne get 00000000000000000000000000000000
Unknown command: get
Run 'mnemosyne --help' for usage.        # exit 2  → 子命令不存在信号
$ mnemosyne delete 00000000000000000000000000000000
Error: Memory not found: 0000...0000     # exit 1  → "not found" 信号(直接删除路径的判定依据)
$ mnemosyne --help
... 命令清单里没有 get/show/read 行
```

与 `openspec/changes/memory-forget-exact-id/specs/memory-operation-closure/spec.md` 的对应关系:
`Forget MUST delete when exact ID read is unavailable` ↔ 上述 delete 的 not-found 语义与直接删除分流;
`Adapter exact-ID capability MUST be probed, not assumed` ↔ 上述两类探测信号与 `probeExactIdReadCapability` 的实现文件。

### 特点

- 判定方向是"失败落到可删除":探测不确定 → 少了快照但能删,而不是拒绝删除(fail-closed 的正确边界是"不伪造 recovery 成功",不是"不删除")。
- 上游将来接出精确读取命令后,能力探测自动转阳性 → 删除自动回到 recovery 前置,**不需要改调用方或配置**。候选子命令名集中在一个常量里(`["get"]`),届时按实际命令名扩展。
- 无新依赖,不读 SQLite,不做语义 `recall`,不做全库 `export` 扫描,不驱动 Python 环境。

### 边界

- 未实现:把能力结论暴露到 `status` / `doctor`(任务 3.3)、`TROUBLESHOOTING.md` 与 `docs/GUIDE.md` 的口径更新(任务 4.1)、上游 follow-up 记录(任务 4.2)。
- 已知陈旧文档(留给任务组 4):`TROUBLESHOOTING.md:96`、`docs/GUIDE.md:8`、`docs/COMPATIBILITY.md:74` 仍是旧的 "fail-closed / 不会调用 delete" 口径。
- 无快照删除的代价是显式且不可撤回的:恢复只能依赖用户自身备份或仓库导出;工具结果与审计都显式声明 `recovery: none`。
- 真实删除能力依赖 backend 的 not-found 文案(`Memory not found`)与退出码;文案若变,该错误会被当作真实失败(保守方向)。

### 验证(实测)

- 新增 `src/exact-id-capability.test.ts`(9 条):探测"不存在 / 存在且可解析(结构化 record 与结构化 not-found)/ 存在但不可解析"、按进程缓存只探测一次、响应分类、读取器的三种结果、delete not-found 判定。
- `src/deletion-lifecycle.test.ts` 新增 4 条:能力不可用时 project 命中直接删除(无 `recovery` 目录、无读取调用)、project 未命中回退 default、所有 bank 未命中报错且无成功审计、backend 非 not-found 失败即终止(不再试下一个 bank);并在既有 recovery 用例上加断言 `deleteCalls === []`(recovery 写失败时 delete 绝不被调用)。
- `src/index.test.ts` 的 forget 边界改为 3 条端到端用例:project bank 命中删除(且从不调用 `recall`/`export`)、project 未命中回退 default、全部未命中返回 `status: error` 且无成功审计。
- 真机回归:`XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1 pnpm exec vitest run src/real-cli.integration.test.ts` → `4 passed`,其中"四个工具对真实 CLI 沙箱"用例实测 `status: deleted` + `recoverySnapshot: none` + 审计出现 `deletion`(改动前该断言期望的是 `upstream-exact-id-read-unavailable` / `status: error`,即删除从未发生)。
- 质量闸门:`pnpm typecheck` exit 0;`pnpm -w run lint` exit 0(140 files);`pnpm test` → `69 passed | 3 skipped (72)` 文件、`662 passed | 6 skipped` 条,exit 0。
- 已知前置失败(与本变更无关,已用 `git stash` 在原始基线上复现同样报错):`XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1 vitest run src/live-rpc.integration.test.ts` 在更早的 `remember` 步骤即失败(`expected "stored", received "candidate"`)。

## 任务组 3:结果、审计与诊断语义

### 目的

让“删了/没删”“写了快照/没写快照”“能力可用/不可用”三件事在工具结果、审计与诊断里都能被外部区分,不需要读正文也不靠猜。

### 作用

- 工具结果(3.1):成功返回 `status: deleted` + 实际 `bank` + `id`;新增 `recoverySnapshot: "none" | "written"`(存储字段本名 `recovery`,因 `ToolDetails.recovery` 已被恢复指引对象占用而改名);成功文案不再是 `Recovery: undefined`,而是显式 `No recovery snapshot was written.` 或 `Recovery: <recoveryId>.`。
- 审计(3.2):只有真正删除成功才写 `deletion` + `reason: memory-deleted-by-user` + 实际 bank;所有未命中/失败走 `rejection`,并在能力不可用时带上 `capability: upstream-exact-id-read-unavailable`(`audit.ts` 新增白名单字段 `capability`,否则该字段会在写入时被静默丢弃)。所有 bank 都没命中时也会补一条终态 `memory_failed` 事件,不再留下只有 request 的悬空 L0 记录。
- 诊断(3.3):status 新增 `exactIdRead: { available, command?, reason? }`,数据来自同一份进程内缓存的探测结论;`renderStatus` 显式白名单重渲染,保证只有结论、命令名或 reason code,没有正文。

### 特点

- 三处使用的是**同一个**能力结论对象,不会出现“工具以为可用、status 显示不可用”的分裂。
- 所有字段都是有界枚举或 reason code,便于外部脚本判定,不依赖文案。

### 边界

- 不新增 status 文案渲染(只进 JSON/诊断字段),不改 UI 面板布局。
- `recoverySnapshot` 是工具结果的字段名,与 `recovery`(恢复指引)不混用。
- 未把能力结论写进 MEMORY.md / Markdown 导出(投影层只关注记忆本体)。

### 验证(实测)

- `src/index.test.ts`:新增“能力可用时先写 recovery 快照再删除”(实测调用序为 `get(probe)` → `get(memory-1)` → `delete`,并断言 recovery 文件存在、`recoveryId` 与文件名一致)、“审计成功/失败集合”(实测 `deletion` 恰好 1 条且 `bank: project-forget-project`,失败侧恰好 1 条 `rejection` + capability 码);并给能力可用性不可用用例补上 `No recovery snapshot was written.` 文案断言。三种结果形状(不可用删除 / 可用删除 / error)在 `xpi_memo_forget boundary` 下各有独立用例。
- `src/status.test.ts`:新增 `exactIdRead` 渲染用例,断言不可用时键集只有 `available`+`reason`、可用时只有 `available`+`command`。
- `src/index.test.ts` status 侧新增 2 条:能力不可用 → `exactIdRead: {available:false, reason:...}` 且探测调用为 `get <32 个 0>`;能力可用 → `{available:true, command:"get"}`,并断言状态 JSON 不包含探测响应中的正文。

## 任务组 4:文档与验收

### 目的

让文档口径与代码实现一致,且不向用户承诺上游并不存在的命令;把上游跟进请求存档但不混进本次交付。

### 作用

- `TROUBLESHOOTING.md`:原 “Forget fails closed” 章节改写为 “Forget: deletion is capability-gated, not fail-closed”,按 `exactIdRead.available` 分流说明,并给出排查建议(`memory-not-found` / backend 真实故障 / `unresolved` / 哪里能拿到 recovery)。
- `docs/GUIDE.md`:原“当前 `forget` 能力边界”改写为能力分流表,删除段的语义按“有快照/无快照”两条写明;新增说明 `recoverySnapshot: none` 时没有自动恢复路径及其代价。
- `docs/COMPATIBILITY.md`:降级行为里那条“需要精确 ID 读取能力、因此不会调用 delete”的旧口径同步为分流口径(该文件未在任务清单列出,但它記載的是同一个已改变的行为,不改就是与新契约矛盾)。
- `docs/UPSTREAM-FOLLOWUPS.md`(新建,本次指定的 follow-up 归档位置):`FU-1 精确按 ID 读取命令`,标注**已记录、未实施、明确 out of scope 于本 change**,并附上游文件行号、请求内容,以及 xpi-memo 侧已就绪的自动接入路径。

### 特点

- 文档只描述已存在的行为:不再出现“将来会返回 `upstream-exact-id-read-unavailable` 并拒绝删除”这类与实现相反的承诺;也不把上游尚未提供的 `get` 写成可用命令(只写成请求)。
- 删除顺序、单参数签名、审计语义在三份文档里描述一致。

### 边界

- 不向上游提 issue/PR(仅文档归档),不修改上游代码,不驱动 Python 环境。
- 不改 README 的命令清单(`xpi_memo_forget — Delete memory` 仍然成立)。

### 验证(实测,任务 4.3)

```
$ pnpm typecheck                                     → exit 0
$ pnpm -w run lint                                   → exit 0 (Checked 140 files, No fixes applied)
$ pnpm test                                          → exit 0
  Test Files  69 passed | 3 skipped (72)
  Tests       667 passed | 6 skipped (673)
```

- 文档一致性:`grep -rn "Forget fails closed"` 在 `openspec/changes/memory-forget-exact-id/` 之外已无命中(该目录里引用的是待改写的旧章节名);`upstream-exact-id-read-unavailable` 在文档/源码中只剩三种正当用法:能力 reason code 常量(`src/banks.ts`)、审计与测试断言、以及 `docs/UPSTREAM-FOLLOWUPS.md` 与 `docs/task-report/dev-2`(历史报告)的说明。
- `XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1 vitest run src/real-cli.integration.test.ts` → 4 passed(真机 CLI)。
- `git diff --stat` 复核:仅触及本变更声明过的源码/测试/文档 + `biome.jsonc`/`package.json`(任务组 1)。
