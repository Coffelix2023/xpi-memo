# Task 7：track-b-real-validation(默认会话模型 runner)

> 本文件是 `openspec/changes/track-b-real-validation` 的分组任务报告(AGENTS.md §7)。
> 覆盖全部四个任务组(tasks 1.1–4.5)。

## 变更背景(一句话)

受门控的离线提取(offline extraction,会话末让模型通读会话并提炼记忆的路径)此前只有测试注入的假 runner,从来没有在真实会话里通电;本轮补上"默认 runner + 平台实测",让这条路真的能被打开一次。

## 任务组 1:平台假设检查(Platform assumption check)

### 目的

先证明"会话关闭阶段还能调用模型"这个前提成立,再写依赖它的代码。前提若不成立,整个默认 runner 的设计就不该落地。

### 作用

- 实测确认 Pi 在使会话失效之前会 **await** 全部 `session_shutdown` 处理器,因此处理器内部的异步调用可以完成。
- 把该结论从"读 `.d.ts` 推论"升级为"可复查的观测证据",避免后续评审再拿类型声明当作事实。
- 决定了 1.2 的分支走向:前提成立,于是**不做**降级限制。

### 特点

- **只观测,不改动运行时**:探针是临时扩展(经 `-e` 注入)+ 一个默认跳过的集成测试,不进入扩展的生产路径。
- **两级证据**:先证 `await` 之后上下文仍可读,再证处理器内能跑完一次真实 `complete()`。第二级才是真正决定成败的测量。
- **零敏感数据**:证据只含模型 id、provider、耗时与 stopReason,不含 Key、地址或任何正文。

### 边界

- 覆盖 `dispose()`(退出)路径;`teardownCurrent()`(`/new`、`/resume`)共用同一 await 语义,未逐条实测。
- **不覆盖**进程被 `SIGKILL` 或父进程先退出——这落在设计已声明的最佳努力边界内。
- 不覆盖未认证/超时分支,它们是运行时诊断,不是平台可用性问题。
- 集成测试默认跳过(`XPI_MEMO_RUN_PI_INTEGRATION=1` 才跑);真实模型调用那一级保留为一次性手工探针,原因是它需要凭证、不适合进 CI。

### 产出

| 文件 | 作用 |
| --- | --- |
| `docs/evaluation-reports/track-b-shutdown-context-2026-09-14.md` | 命令 + 观测结果 + 边界 + 对 1.2 的影响 |
| `src/shutdown-model-context.integration.test.ts` | 观测结果 1 的可回归版本 |

### 关键数字

- `session_shutdown` 内 `await` 300 ms 后:`ctx.modelRegistry` 存活,`getAvailable()` = 50,`ctx.model` = `deepseek/deepseek-flash`。
- 处理器内真实调用:`completeMs` = 857,`stopReason` = `stop`,正文 4 字符。

## 任务组 2:默认 runner 与装配(Default runner and assembly)

### 目的

把"扩展自己就能通电"这件事做成**默认关闭、可注入优先、失败不阻塞关闭**的一条路径,并顺手验证关掉开关能干净回滚。

### 作用

- 新增默认 runner,让离线提取不再依赖外部宿主注入模型客户端,真实会话可以被观测(这是整个 track 的前置条件)。
- 保持既有 seam 不变:外部注入仍是最优先级,默认实现只是兜底——已有宿主与测试行为零变化。
- 把"什么时候允许调用模型"固化为三条同时成立的条件:显式开关、活跃模型、剩余预算。
- 证明回滚不是口号:开关置 `false` 或 unset 后,同一 session 不再发出任何模型请求。

### 特点

- **单向依赖**:`offline-extraction.ts` 保持 provider-neutral(不认识模型);模型知识集中在新的 `offline-extraction-runner.ts`,装配只发生在 `index.ts`。这样可注入测试面没有被破坏。
- **结构化输出 + 强制归一化**:runner 要求严格 JSON;解析失败按"无提案"处理并打上有界标记,原始模型文本永不进入 audit 或 L0 正文。标题、正文都由模型给,但证据类型由边界强制为 `l0-conclusion`(组 3 会再加断言)。
- **超时/中止复用既有哨兵**:runner 自带的超时抛出既有常量 `OFFLINE_EXTRACTION_TIMEOUT_MESSAGE`,因此边界仍把它归类为 `timed-out` 而不是 `failed`,不需要新增状态。
- **零模型请求 = 三重短路**:开关关闭在事件处理器层短路;无活跃模型在装配层短路(不构造 runner,边界报 `unavailable`);预算耗尽在边界层短路。三层都不触碰网络。
- **一个定时器**:请求的超时与 `AbortController.abort()` 共用同一个 `setTimeout`,并在 `finally` 中清理,避免会话关闭阶段留下悬挂计时器。
- **结构化的接缝**:`OfflineExtractionModelClient` 用方法语法声明,使真实 `ModelRegistry` 无需 `as` 转换即可赋值,同时单测可用假客户端。

### 边界

- **不做**模型选择配置:缺省使用当前会话模型,不新增 provider/model 选项。
- **不做**重试、后台补跑、跨会话提取队列。
- **不引入**嵌入模型或任何新运行时依赖;不改默认开启策略。
- 输入/输出预算沿用既有常量(200 事件、60,000 输入字符、1,200 输出 token、5,000 每 session 字符、20 条提案),本轮只新增默认实现,未放宽任何一条。
- `no-model` 时 runner 返回 `unavailable` 标记,但**尚未**把它与"执行了但没提案"在 audit/status 里分开——这是任务组 3.3 的范围。
- 提案进入治理后的证据类型与候选行为未被本组新增断言覆盖(组 3.1)。

### 装配形态

```ts
// src/index.ts
runner: dependencies.offlineExtractionRunner ?? sessionModelRunnerFor(ctx),
```

`sessionModelRunnerFor(ctx)` 在 `!ctx.model || !ctx.modelRegistry` 时返回 `undefined`,这是"无活跃模型即零请求"的实现点。

### 验证覆盖(模型调用计数 0/0/0/1)

| 场景 | 断言 | 位置 |
| --- | --- | --- |
| 开关关闭 | 模型调用 0 | `src/index.test.ts` |
| 无活跃模型 | 模型调用 0,审计 `unavailable` | 同上 |
| 预算耗尽后再触发 | 追加调用 0(累计仍为 1) | 同上 |
| 开启且模型可用 | 模型调用 1,审计 `completed` | 同上 |
| 注入 runner 存在 | 注入被调用,模型调用 0 | 同上 |
| 回滚(`false` / unset) | 调用数不增;对照组删掉预算账本后仍不增 | 同上 |
| runner 单元行为 | 成功/围栏 JSON/解析失败/超时+abort/抛错/无模型 | `src/offline-extraction-runner.test.ts` |

## 任务组 3:治理、安全与诊断(Governance, safety and diagnostics)

### 目的

证明默认 runner 产出的提案**没有绕开**既有治理与安全边界,并让诊断能把"没跑起来"和"跑了但没东西"分开。换句话说:换执行器不能换来新的信任。

### 作用

- **3.1 走既有治理管道**:模型提案经 `normalizeOfflineExtractionOutput` → 内容策略 → 路由 → 候选/直存,证据类型被强制为 `l0-conclusion`,永不冒充 `explicit-user-statement`;需要审核的类别只进候选队列。
- **3.2 出域前脱敏**:`prepareExternalEvents` 仍是唯一出域准备路径。可脱敏凭证替换为 `[REDACTED]` 后才进 prompt;无法确认安全(未闭合的私钥块)时**直接拒绝外发**。
- **3.3 可区分状态**:审计新增 `outcome` 码——`runner-unavailable` / `executed-with-proposals` / `executed-without-proposals`(其余状态沿用自身名字);status 暴露 `offlineExtraction.lastOutcome`;observability 增加 `activation.extractionOutcome` 三个无正文计数。

### 特点

- **判定收敛到一处**:`offlineExtractionOutcome(status, validProposals)` 是唯一映射函数,审计与状态不会各自推演。
- **状态是码不是句子**:三层(审计/状态/观测)只出现枚举码与计数,正文与模型原始输出永不进入。
- **拒绝优先**:安全无法确认时不发请求(`modelCalls === 0`),而不是"发了再脱敏"。
- **只加分层,不改语义**:预算消耗规则、内容策略、路由、候选生命周期全部原样。

### 边界

- 不新增 capability;spec 中"外部 runner"的约束对默认 runner 同源适用。
- `runner-unavailable` 在真实会话里难以复现(默认 runner 存在才有真实路径),该状态由单测覆盖。
- 不做跨路径去重:同一条语句可能同时经显式工具路径与提取路径各产一条候选(见任务组 4 的实测观察)。

### 验证覆盖

| 断言 | 位置 |
| --- | --- |
| 默认 runner 提案 → 候选;证据类型 `l0-conclusion`;无一行被标为 `explicit-user-statement`;模型正文不进 audit | `src/activation-loop.integration.test.ts` |
| 凭证被脱敏为 `[REDACTED]`,原文不出域 | `src/index.test.ts` |
| 未闭合私钥 → 拒绝外发(模型调用 0)且审计 `refused` | `src/index.test.ts` |
| 三种 outcome 在观测层分别计数 | `src/observability.test.ts` |
| status 报 `lastOutcome` 且不含提案正文 | `src/index.test.ts` |

## 任务组 4:真实验证与记录(Real validation and record)

### 目的

把"到底能抓到多少、抓得准不准"从争论变成可引用的数字,并用这些数字定下 ai-memory 的角色。

### 作用

- **4.1** 真实会话通电:5 个隔离会话在开关开启下全部进入模型调用,审计出现可区分 outcome(3× `executed-with-proposals`、2× `executed-without-proposals`);另有回滚对照会话确认开关关闭时**零** extraction 记录。
- **4.2** 产出人工标注表:会话级漏捕获 40%(2/5)、类别精确率 75%(3/4),并命名两类根因。
- **4.3** 按预先写下的阈值判定角色:漏捕获 > 20% 且精确率 < 80% → **接管模式**,并引用实测数字作为依据。
- **4.4/4.5** 三道闸门全绿并把证据归档成本文件。

### 特点

- **先定标准再看数据**:4.3 的阈值写在测量之前(漏捕获 ≤ 20%、精确率 ≥ 80%、零伪造),避免"看着结果定标准"。
- **对照组完整**:关闭开关的真实会话,以及"零提案"的两个样本都存在,不是只报成功案例。
- **可复查**:每个结论都指向 `docs/evaluation-reports/track-b-validation-2026-09-14.md` 里的命令、原始 JSON 与临时数据根路径。
- **零污染**:全部样本使用 `/tmp/xpi-memo-trackb-*` 隔离数据根,未触碰真实 `~/.pi` 与 `~/.config`。

### 边界

- 样本量 n=5、单模型(`deepseek-flash`)、单轮,因此 40%/75% 是**方向性证据**而非稳定指标;结论带有显式复审条件(≥10 会话复测达标则回到分工模式)。
- 不接入、不安装 ai-memory;"接管模式"只是角色判定。
- 未测量成本、延迟与用户 Store/Reject 比例。
- 未覆盖 provider 未认证、超时、预算耗尽在真实会话中的表现(由单测覆盖)。

### 关键数字

| 指标 | 值 |
| --- | --- |
| 会话数(开关开启) | 5 |
| 提取运行结果 | 3 with-proposals / 2 without-proposals / 0 unavailable |
| 会话级漏捕获 | 40%(2/5) |
| 类别精确率 | 75%(3/4) |
| 解析失败 / 治理拒绝 / 预算拒绝 | 0 / 0 / 0 |
| 直存入 T1 | 0 |
| 关闭开关后的 extraction 审计记录 | 0 |

## 闸门结果

```bash
pnpm typecheck        # exit 0
pnpm -w run lint      # exit 0 (biome check ., 143 files)
pnpm test             # exit 0, 684 passed / 7 skipped
```

跳过项为既有的 gated 集成测试;另有一次 `XPI_MEMO_RUN_PI_INTEGRATION=1` 下的 shutdown 探针通过(见组 1)。

## 回滚

- 运行期:`XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false`(或 unset)即回到变更前行为——不发起任何模型请求,显式确定性捕获不受影响。
- 代码期:revert 本轮提交。新增的两个模块与三个测试文件都是可独立删除的增量,`offline-extraction.ts` 的改动只有哨兵常量的导出。
