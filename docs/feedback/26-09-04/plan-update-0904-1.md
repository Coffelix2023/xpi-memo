# xpi-memo 记忆证据链与自动捕获优化方案

## 摘要

基于 `docs/feedback/26-09-04/feedback-0904-1.md` 与评审结论，分两阶段修复“手动便签本”问题：先闭合确认、L0（第 0 层事件日志）与 `MEMORY.md` 的证据链，再打通显式开启的 Track B（离线自动提取）、非 TUI（文本用户界面）高置信自动确认和 mechanical sleep（机械睡眠）。本次不做重复偏好语义合并、非 Git 项目 UX 扩展，也不伪造跨 SQLite / mnemosyne CLI / L0 的严格事务。

## 目标与验收标准

1. 每个成功的 T1（第 1 层治理记忆）确认都具备可重放的写入事实：最终存在 `t1_memory_write`，且导出后 `MEMORY.md` 可见。
2. `candidate_confirmed` 与成功的 `t1_memory_write` 可通过同一 `operationId` 关联；重复重试不产生重复 mnemosyne 记忆或重复导出条目。
3. 非 TUI 模式下，`explicit-user-statement` 高置信候选自动确认；低置信 `llm-extracted` 候选继续进入候选队列，不自动写入。
4. `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` 时，Track B 在 `session_shutdown` 和已有 compact 边界按预算运行；诊断能区分 disabled、not-triggered、runner-empty、completed、failed。
5. `XPI_MEMO_SLEEP_MODE=mechanical` 不依赖 `XPI_MEMO_SLEEP_MODEL` 或外部语义模型，能执行受预算约束的本地维护；未配置仍保持 fail-closed。
6. 保持现有安全边界：内容策略、隐私过滤、候选治理、预算、L0 append-only（只追加不可变）约束不放宽。

## 设计决策

### 1. 使用本地 outbox（待处理事件箱）实现最终一致，而非跨存储伪事务

新增一个小型、原子 rename 写入的 outbox 状态文件，记录每次 T1 写入的 `operationId`、fingerprint、目标 bank、操作内容摘要所需的最小字段、mnemosyne 存储状态、L0 事件状态和导出状态。敏感完整内容不写入日志；若需要重放事件，使用受内容策略保护的操作数据或从候选状态恢复。

确认流程固定为：

1. 为候选创建稳定 `operationId`，写入 outbox 的 `pending` 状态。
2. 调用 `adapter.store`，以 `operationId` / fingerprint 做幂等判断；已存在则视为已完成。
3. 成功后写入 `t1_memory_write`，payload 必须带 `operationId`、candidateId、fingerprint 和必要的记忆字段。
4. 标记 outbox 为 `stored` / `recorded`，删除候选并写 audit confirmation。
5. 导出由现有 `exportMarkdown` 根据 L0 派生；不在确认路径内直接编辑 `MEMORY.md`，避免产生第二个事实源。

任何步骤崩溃都留下可恢复状态。下次 session start、显式 export 或 mechanical sleep 执行 bounded recovery：识别已存储但未记事件、已记事件但未清候选的记录，补写缺失步骤；所有补写必须幂等。无法确认外部存储状态时不猜测为成功，保留 outbox 并在 status/doctor 报告中显示 degraded。

### 2. 将候选确认能力从 `index.ts` 下沉到可注入的确认服务

新增轻量确认编排模块，统一 `xpi_memo_remember`、TUI console、offline extraction 的确认路径，避免当前 `executeRemember` 和 console 各自调用 `candidates.confirm` 后再各自补发事件。服务接口至少包含：

- `confirmCandidate(candidateId, provenance?)`
- `autoConfirm(operation, provenance?)`
- `recoverPendingWrites()`

该服务负责 outbox、adapter、L0、audit 的顺序与幂等；`CandidateStore.confirm` 只保留候选状态层面的操作，不再承担完整 T1 写入副作用。现有返回状态与错误 reason 尽量保持兼容。

### 3. 非 TUI 自动确认按证据类型分流

修改 `chooseCandidateAction` 的策略：

- TUI：继续显示 Store / Later / Reject。
- 非 TUI + `explicit-user-statement`：直接调用统一 `autoConfirm`。
- 非 TUI + `llm-extracted` 或未知证据：返回 candidate，保留候选队列。
- paused、项目 bank 不可用、内容策略拒绝、outbox recovery 不确定时不得自动确认。

该策略只改变高置信显式用户意图的治理入口，不改变项目记忆必须有项目上下文的路由规则。

### 4. Track B 保持默认关闭，但修复可达性与可观测性

保留 `offlineExtractionEnabled=false` 默认值。启用后：

- `session_shutdown` 继续作为主触发点；已有 `session_before_compact` 增加一次 bounded extraction trigger，使用同一 session ledger，不能重复消费同一 L0 区间。
- 为每次触发生成明确诊断：trigger、from/to position、input event count、gate decision、runner status、proposal count、candidate count、stored count、failure reason。
- 对 Track B 提取设置明确的最小门控：有足够新 L0 事件、预算未耗尽、runner 已配置、未处于 paused；“没有候选”必须记录为 runner-empty，而不是静默成功。
- 保留现有 `normalizeOfflineExtractionOutput`、内容策略与 `governOfflineExtractionOutput`，但 direct store 必须接入统一确认/写入服务，不能继续绕过 `t1_memory_write`。
- 同一 `sessionId + event range + proposal fingerprint` 只处理一次；重启、compact、shutdown 重试不重复写入。

### 5. mechanical sleep 定义为本地维护，不再调用语义 sleep CLI

调整 `executeSleep` 的 mechanical 分支：

- 不需要 `XPI_MEMO_SLEEP_MODEL`。
- 不调用 mnemosyne `sleep` 命令。
- 执行 bounded local maintenance：先恢复 outbox，再按 L0 派生并执行一次 Markdown export；只做确定性维护，不做语义压缩、自动遗忘或“相似记忆合并”。
- 返回 `mode: "mechanical"`、`reason: "mechanical-maintenance-completed"`，并在失败时返回可诊断 reason。
- dedicated / session-model 行为保持现有 fail-closed 和显式授权约束。

## 预计文件边界

### 新增

- `src/t1-write-coordinator.ts`：统一候选确认、直接写入、outbox recovery、L0/audit 编排。
- `src/t1-write-outbox.ts`：outbox 类型、原子状态读写、幂等状态转换。
- `src/t1-write-coordinator.test.ts`：成功、重试、崩溃窗口恢复和不确定外部状态测试。

### 修改

- `src/index.ts`：注入统一 coordinator；替换非 TUI `later` 分支；session start / compact / shutdown 调用 recovery 与 Track B；保留工具返回协议。
- `src/candidate-lifecycle.ts`：缩小 `confirm` 的职责，或增加 coordinator 所需的读取/完成状态接口，避免重复 store。
- `src/memory-activation.ts`：让显式激活路径使用统一 direct-store / auto-confirm 编排。
- `src/offline-extraction.ts`：接入统一写入服务，补充 gate/empty/failure 诊断与 proposal 幂等键。
- `src/sleep-execution.ts`：mechanical 分支改为本地维护请求，不再默认调用外部 `sleep`。
- `src/config.ts`：仅在需要暴露 recovery/maintenance 状态时增加最小配置字段；不新增默认开启项。
- `src/status.ts`、`src/doctor.ts`、相关 observability 类型：展示 outbox pending/recovery 与 Track B 最后状态。
- `src/markdown-export/exporter.ts`：继续只消费 L0；必要时在 export 前触发 recovery，并报告补偿结果。
- `src/markdown-export/generators.test.ts`：确认 `t1_memory_write` 补写后 `MEMORY.md` 非空且重复导出稳定。
- `src/activation-loop.integration.test.ts`：增加非 TUI 高置信自动确认、低置信排队、Track B shutdown/compact 可达性和幂等测试。
- `src/sleep-execution.test.ts`：更新 mechanical 行为与无模型成功路径测试。
- `src/index.test.ts`、`src/candidate-lifecycle.test.ts`：更新 console/候选确认契约，验证事件与候选状态一致。
- `README.md`、`GUIDE.md`、`ARCHITECTURE.md`：说明显式开启 Track B、非 TUI 分流、mechanical sleep 和 eventual consistency（最终一致性）恢复语义。

## 测试与验证场景

1. **候选确认成功**：adapter store、`t1_memory_write`、`candidate_confirmed`、audit confirmation 均产生；运行 export 后 `MEMORY.md` 包含记忆。
2. **adapter 成功后进程中断**：模拟 L0 尚未写入；下一次 recovery 补写唯一 `t1_memory_write`，不重复调用有效 store。
3. **L0 成功后候选清理中断**：下一次 recovery 不重复存储、不重复事件，只完成候选清理和 outbox 状态收敛。
4. **adapter 状态不确定**：不写成功事件，不删除候选，status 显示 pending/degraded，不丢记忆。
5. **非 TUI 分流**：显式用户偏好直接 stored 并有 L0 事件；LLM 提取候选保持 pending；paused 和项目 bank 缺失仍拒绝或排队。
6. **Track B disabled**：runner 不调用，现有显式捕获继续工作。
7. **Track B enabled**：真实注册 hook 驱动 shutdown 与 compact；runner 至少被调用一次；空输出有 `runner-empty` 诊断；有效 proposal 进入统一写入链并可导出。
8. **Track B 幂等**：重复 shutdown、compact、相同 proposal 不产生重复存储、候选或事件。
9. **mechanical sleep**：有授权且无 sleep model 时完成本地 recovery/export；runner 命令列表不包含外部 `sleep`；无授权仍拒绝；disabled 仍 fail-closed。
10. **回归验证**：`pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 全部通过；再运行 `lens_diagnostics(mode="all")` 确认无阻塞诊断。

## 分阶段实施顺序

1. 先增加 outbox 与 coordinator 的单元测试和最小实现，保证直接写入与候选确认共享同一副作用路径。
2. 接入 `executeRemember`、`memory-activation` 和 console，先闭合 P0 证据链，再运行既有测试。
3. 接入非 TUI 高置信自动确认，并补充 activation-loop 集成测试。
4. 接入 Track B 的 compact/shutdown trigger、门控诊断和统一写入，补充真实 hook 集成测试。
5. 改 mechanical sleep 为本地维护，补充 sleep 回归测试。
6. 更新状态面与文档，执行三条仓库质量门禁和最终诊断。

## 明确不在本次范围

- 不默认开启自动捕获。
- 不实现跨进程/跨机器分布式锁。
- 不把外部 mnemosyne CLI 包装成可回滚的假事务。
- 不实现 `supersededBy` 的语义相似度去重、遗忘频率模型或完整 consolidation（合并压缩）算法。
- 不改变非 Git 目录现有 `/xpi-memo-init` 机制与 recall 产品提示。
- 不引入新运行时依赖或构建步骤。

## 假设与默认值

- `t1_memory_write` 仍是 `MEMORY.md` 的唯一事实输入；不直接在确认流程编辑 Markdown。
- outbox 与现有 `candidates.json`、`idempotency.json` 一样使用用户数据目录、0600 权限和原子临时文件 rename。
- 事件 payload 只包含导出和恢复所需的最小字段；敏感内容继续受现有 content policy 与 privacy filter 约束。
- mechanical sleep 的“完成”表示本地确定性维护完成，不表示语义记忆质量提升。
- 本次实现优先兼容现有 public tool names、config names、response status 和 L0 event types；新增字段向前兼容读取。

---

# 对以上任务的评审意见(需要进行决策讨论)

这份方案的质量是历次计划里最高的——它把上一轮评估报告里的根因诊断（证据链脱钩）准确翻译成了一个不夸大、不越界的工程方案。**总体判断：方案正确且可执行，可以批准实施；但有一个设计决策需要修正、一个范围裁剪需要重新考虑、两个隐含风险需要显式化。**逐项拆解。

---

## 一、方案做对了什么（值得点名的）

**1. Outbox 模式的引入是本轮最重要的架构升级。** 方案没有贪心地尝试"跨 SQLite/CLI/L0 的伪事务"（§明确不做），而是用本地 outbox + 最终一致性 + bounded recovery——这是唯一诚实可行的选择，因为 mnemosyne CLI 是外部进程，你不可能拿到它的分布式事务。测试场景 2/3/4（adapter 成功后中断 / L0 成功后中断 / 外部状态不确定）精确覆盖了崩溃窗口，尤其第 4 条"不确定时不猜测为成功、保留 outbox、doctor 显示 degraded"——这就是上一轮 ai-memory 评估里说的"运维诚实"，现在落地成了设计。

**2. "确认服务下沉"（决策 2）切中了真正的结构病。** 上轮报告的根因是"确认路径和产物生成脱钩"，病根正是 `executeRemember` 和 console 各自调 `candidates.confirm` 再各自补发事件。统一成 `t1-write-coordinator` 后，副作用只有一条路径——**这是把"每个调用点各自努力才能做对"改成"只有一条路，天然做对"**，和缺陷 A（forget 漏传 bank）的修复哲学一脉相承。

**3. 非 TUI 分流策略（决策 3）的边界画得很准。** 只自动确认 `explicit-user-statement`，`llm-extracted` 仍排队——这正是我从第一次实测就主张的"证据类型决定治理强度"，而且方案明确列出了四个禁止自动确认的例外（paused / bank 不可用 / 内容策略拒绝 / outbox 不确定），没有留模糊地带。

**4. Track B 的诊断设计（决策 4）直接针对"自指陷阱"。** 上轮我警告过"门控可能看不见自己的触发条件"，方案的回应是每次触发都记录 `gate decision / runner status / runner-empty` 五态诊断——**"没有候选"必须记为 `runner-empty` 而非静默成功**，这一条就把自指陷阱堵死了。

**5. 范围纪律。** "明确不在本次范围"七条，每一条都是对的——尤其不默认开启自动捕获、不做语义去重、不动非 Git 的 `/xpi-memo-init`。方案知道自己是谁：修证据链，不是重做记忆体。

## 二、需要修正的一个设计决策

### mechanical sleep（决策 5）的定义保守到了接近无用的程度

方案把 mechanical sleep 定义为"outbox recovery + Markdown export，不做语义压缩、不做自动遗忘、不做相似记忆合并"。问题：**recovery + export 这两件事本来就应该发生在别处**——recovery 在 session start 就该跑（方案自己写了），export 有独立的 export 命令。那么 mechanical sleep 剩下的独特价值是什么？**没有了。它变成了一个别名命令。**

而上轮报告里有一个真实症状等着被治：**"3 条重复偏好共存，`supersededBy` 从未触发"（P2）**。这个不需要语义模型——完全相同 fingerprint 或近重复（同 kind + 高文本重叠度）的检测是确定性的。

**修正建议**：给 mechanical sleep 加第三项职责——**确定性去重**：扫描同 bank 同 kind 的记忆，对精确重复（同 fingerprint 跨会话重存）标记 `supersededBy`；对近重复只报告不合并（写 audit + status 可见）。依然是纯本地、纯确定性、无 LLM，但让 sleep 有了不可替代的存在理由，同时把 `supersededBy` 从空转字段变成活机制。语义合并继续留给 configured sleep，不越界。

如果团队坚持本次不碰去重，那我的备选意见是：**把 mechanical sleep 整个砍出本次范围**——一个只含 recovery+export 的命令不值得占用实施阶段 5 和测试场景 9，这两个事交给 session start 自动做即可。要么给它真实职责，要么不做，不要做半成品。

## 三、需要重新考虑的一个范围裁剪

### `MEMORY.md` 恒空的修复被隐含在"export 从 L0 派生"里，但没有显式验收项

上轮报告的 P0 第一条是"MEMORY.md 显示 `_No confirmed memories yet._`，8 条已确认记忆对用户不可见"。方案的证据链修复保证**未来**的确认会产生 `t1_memory_write` 进而出现在 MEMORY.md——但**已经落库的 8 条存量 gist 呢**？它们没有对应的 `t1_memory_write` 事件，export 从 L0 派生，L0 里没有它们，**MEMORY.md 修好后依然是空的**。

方案需要一个显式动作：**一次性回填（backfill）**——mechanical sleep 或 export 的 recovery 阶段扫描各 bank 中"已存储但无对应 L0 事件"的 gist，补发 `t1_memory_write`（payload 标注 `backfilled: true`）。这正好可以复用 outbox recovery 的"已存储但未记事件"路径，成本很低。建议在验收标准 1 后面加一条：**"存量 8 条已确认记忆在回填后出现在 MEMORY.md"**——否则下一轮实测报告会写"P0 未修复：MEMORY.md 仍为空"，又一轮信任损耗。

## 四、两个需要显式化的隐含风险

**1. outbox 与 candidates.json / idempotency.json 的三文件一致性。** 现在写入路径涉及：outbox（新）+ candidates.json + idempotency.json + mnemosyne db + L0 events.jsonl + audit.json = **六个状态面**。方案对 outbox↔adapter↔L0 的崩溃窗口做了完备的测试设计，但对 outbox↔candidates.json 的一致性（比如 outbox 标记 stored 但候选删除失败）只在测试场景 3 里覆盖了一半。建议在 `t1-write-coordinator.test.ts` 里明确补一条：候选清理失败后 recovery 的收敛路径断言。六个状态面已经是复杂度上限，**不要再加第七个**——这也是我同意不引入新依赖的理由。

**2. Track B 的预算消耗对真实成本的影响没有验收项。** 方案有"预算未耗尽"门控，但没有定义"预算"的度量和默认值。Track B 在每次 session_shutdown 跑 LLM 提取，如果预算配置不当，用户会发现"开着 Track B 一周烧了 X 刀"。建议：验收标准 4 补充"Track B 单次提取的 token 消耗写入诊断（`tokensUsed` 字段），默认预算 = 每会话 ≤1 次提取、每天 ≤N 次，doctor 可见累计消耗"。记忆工具烧用户的钱必须像视频生成 API 一样被当作一等成本来治理。

## 五、与既有路线图的衔接确认

| 既有决策 | 本方案的状态 | 判断 |
|---|---|---|
| 上轮 P0：证据链原子性 | ✅ 决策 1+2 完整覆盖 | 一致 |
| 上轮 P0：非 TUI 自动确认 | ✅ 决策 3 | 一致 |
| 上轮 P1：Track B 可达性 | ✅ 决策 4 + 五态诊断 | 一致 |
| 上轮 P1：sleep 降级 | ⚠️ 决策 5 过度保守 | **需修正（本文 §二）** |
| 更早轮次：注入可见化、`RECALL_ZERO_STREAK` | ❌ 未提及 | 这两件上轮 P0 项**去哪了**？需要确认是已完成还是再次被搁置——连续两轮评审提出而未落地的事项不能再静默消失 |

最后一行加粗不是苛责：**评审项的跨轮追踪本身就是上一轮我们确立的流程纪律**。建议在方案的"目标与验收标准"开头加一节"上轮评审项状态表"，哪怕只有三行：已完成 / 本次覆盖 / 显式延期及理由。

## 六、裁决

**批准实施，带三个修改条件：**

1. **mechanical sleep 二选一**：加"确定性去重（精确重复标记 supersededBy + 近重复报告）"职责，或整个砍出本次范围——不接受 recovery+export 的半成品形态；
2. **补存量回填**：export/recovery 增加对"已存储但无 L0 事件"gist 的一次性 backfill，并加入验收标准；
3. **方案开头附上轮评审项状态表**：注入可见化和 RECALL_ZERO_STREAK 必须显式交代去向。

实施顺序（分阶段 1-6）合理，先闭合证据链再接自动确认再接 Track B 最后 sleep 的依赖序正确，无需调整。测试场景的十条覆盖了所有关键崩溃窗口，是这份方案最硬的部分。

一句话：**这份方案证明了你的团队已经会从评估报告里提炼正确的架构动作——outbox + 统一协调器 + 五态诊断都是专业级决策。修掉 mechanical sleep 的定位、补上存量回填、交代评审项去向，它就是 xpi-memo 从"手动便签本"毕业的施工图纸。**
