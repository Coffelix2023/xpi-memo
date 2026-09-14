# 真机反馈复盘与 Track B 修复计划

## 结论摘要

`docs/evaluation-reports/feedback-2026-09-04.md` 证明上一轮 P0（最高优先级）修复已经完成并通过真机验证，不再重复实施：双语召回、注入可见化、`RECALL_ZERO_STREAK`、`ROUTING_REJECTED`、项目记忆删除、真实 `id` 返回、意图闸门修复均有效。

当前唯一值得进入后续修复计划的限制是：中文注入模板对不含“项目/决策/约束/偏好/未完成工作”等词的记忆覆盖有限，例如纯技术栈事实无法通过该模板自动召回。该现象属于设计边界，不是当前 P0 缺陷；继续堆查询词只能缓解词面问题，不能解决自然表达漏记的根因。

决策：关闭本轮 P0，启动下一阶段 Track B（会话边界的 LLM，即大语言模型，提取），保留正则热路径和现有 T1（第一层，受治理长期记忆）治理链路。

## 已确认决策

1. **P0 结案**
   - 以本报告为验收证据，标记上一轮“注入闭环修复”完成。
   - 不再把已验证的双查询、状态展示、零命中告警和路由拒绝展示列为待修复项。

2. **不继续扩充查询词作为主方案**
   - 不增加“技术栈、习惯”等词来持续打补丁。
   - 原因：查询词只能改善已有记忆的检索覆盖，不能解决用户自然表达没有进入 T1 的问题。

3. **启动 Track B，但保持 opt-in（显式选择启用）**
   - `offlineExtractionEnabled` 继续默认 `false`。
   - 通过现有配置 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` 显式启用。
   - 先观察 2–4 周真实使用，再根据闭环质量决定是否调整默认策略；本计划不直接改为默认开启。

4. **只在 `session_shutdown` 提取**
   - 不新增 `session_before_compact` 提取触发。
   - 保留已有 `compaction` L0 事件记录，但由 session shutdown 统一提取，避免同一会话重复调用模型。
   - 沿用每会话最多 1 次执行预算。

5. **保留现有 provider-neutral runner 接口**
   - 不引入在线模型 SDK、数据库、Web 框架或新的队列。
   - 宿主通过 `XpiMemoDependencies.offlineExtractionRunner` 注入模型实现。
   - `offline-extraction.ts` 继续只负责边界、超时、预算、输出规范化和治理。

6. **模型提取不得绕过治理**
   - 所有模型提案统一证据类型为 `l0-conclusion`，永不转换为 `explicit-user-statement`。
   - 继续经过内容策略、项目路由、候选生命周期、幂等和审计。
   - 项目决策、项目约束、项目踩坑等高风险内容默认进入候选，不自动确认。
   - 高置信度且短小的 `session_context` 可沿用现有直接存储规则。

7. **用闭环质量指标评估，不预设未经基线验证的硬阈值**
   - 记录并评估：提案有效率、Store/Reject 比例、后续非空召回率、重复率、误存率、敏感内容拦截率。
   - 敏感内容进入 T1、模型提案伪装为用户显式证据、跨项目泄漏均为零容忍验收项。
   - 是否扩大启用由下一轮真机报告决定，不以“模型调用成功”单独判定成功。

## 现有实现基础与需收口处

当前仓库已有可复用实现：

- `src/offline-extraction.ts`：模型 runner 边界、最多 200 个尾部 L0 事件、输入字符上限、15 秒超时、输出归一化、预算检查和治理入口。
- `src/extraction-budget.ts`：每会话执行次数、提案数和字符数预算持久化。
- `src/index.ts`：`session_shutdown` 调用 `runOfflineExtractionForShutdown`，并将结果交给 `governOfflineExtractionOutput`。
- `src/candidate-lifecycle.ts`：候选 Store/Later/Reject 生命周期。
- `src/operations.ts`：现有 Mnemosyne（外部记忆检索工具）存储适配与来源元数据编码。
- `src/l0/*`、`src/audit.ts`：来源追踪和无正文审计。

因此实现重点不是重写 Track B，而是补齐“启用前契约、失败可见性、治理结果可观测、真实 runner 注入和实机验收”。

## 修复任务

### Task 1：建立 Track B 运行契约

**目标**：把现有离线提取骨架整理成稳定、可验证的公共内部契约。

**范围**：
- 明确 `OfflineExtractionRunnerInput` 的输入语义：只接收当前 session 的有界尾部 L0 事件、`sessionId` 和字符预算。
- 明确 runner 输出格式：数组或 `{ proposals }`，每条提案必须包含 `content`、`kind`、`confidence`、`sourceReference`。
- 明确允许的 `MemoryKind`，拒绝未知类别、缺来源、非法置信度和空正文。
- 确认超时、不可用、异常、预算耗尽均返回有界状态，不向 Pi 主流程抛出错误。
- 继续禁止输出正文进入诊断、审计和错误信息。

**验收标准**：
- 类型契约能表达 runner 输入、输出归一化结果和失败状态。
- 无效提案不会进入候选、T1 或审计正文。
- runner 超时或异常不阻塞 `session_shutdown`。

**测试**：
- 扩展 `src/offline-extraction.test.ts`：输入边界、超时、runner 缺失、预算耗尽、输出格式异常。
- 扩展 `src/offline-extraction-governance.test.ts`：未知 kind、无来源、非法 confidence、模型伪造 `explicit-user-statement`。

**依赖**：无。  
**预计范围**：S（1–2 个文件）。

### Task 2：收口 session shutdown 数据流

**目标**：确认提取只处理当前会话、只执行一次，并且与 compaction 记录关系清晰。

**范围**：
- 保持 `runOfflineExtractionForShutdown` 的 `sessionId` 校验和尾部事件读取。
- 验证读取上限为 200 个事件、输入字符上限为 60,000，不能扫描无限历史。
- 确认预算检查发生在读取事件之前。
- 确认一次成功、失败或超时都消耗本会话执行预算，避免 shutdown 重试重复调用模型；若现有行为对失败不消耗预算，补齐为明确契约并测试。
- 提取完成后逐条进入既有治理；单条提案失败不影响其他提案。
- 继续让 shutdown 捕获提取异常并静默降级，不影响会话退出。

**验收标准**：
- 同一 session 多次触发 shutdown 最多一次 runner 调用。
- 提取不会读取其他 session 的事件，不把历史 session 内容混入当前提案来源。
- 关闭或失败时，现有正则捕获、remember、recall、export 行为不变。

**测试**：
- 增加 `session_shutdown` hook 集成测试：仅当前 session、重复 shutdown、失败不阻塞。
- 验证 `compaction` 只记录 L0，不直接触发第二次模型提取。

**依赖**：Task 1。  
**预计范围**：M（3–5 个文件，主要是 `src/index.ts` 与 hook 测试）。

### Task 3：补齐提案治理与审计可见性

**目标**：让真实使用能够回答“模型提了什么类型、多少被接受、多少被拒绝”，同时不泄露记忆正文。

**范围**：
- 复用现有 `governOfflineExtractionOutput`，不新增第二套存储路径。
- 为提取结果增加有界计数型审计：提案总数、有效数、无效数、直接存储数、候选数、拒绝数、预算拒绝数。
- 审计只记录 session、触发点、状态、kind、reason、数量和来源位置摘要；不写内容正文、token、凭据或完整模型输出。
- 对每个模型提案保留可追溯的 `sourceReference`，但限制为 L0 session/position 等稳定引用。
- 让 status/doctor 能区分“未启用、不可用、失败、超时、预算耗尽、成功但无提案、成功有候选/存储”。

**验收标准**：
- `audit.json` 和 L0 事件可统计 Track B 结果，但不包含记忆正文。
- `RECALL_ZERO_STREAK`、`ROUTING_REJECTED` 等既有诊断不回退。
- 模型提案与显式用户捕获在统计和证据类型上可区分。

**测试**：
- 扩展审计、observability、doctor 测试。
- 增加敏感内容断言：审计序列化结果不包含提案正文、密钥样式内容或完整 runner 输出。

**依赖**：Task 1、Task 2。  
**预计范围**：M（3–5 个文件）。

### Checkpoint A：实现安全闸门

必须全部通过后，才进入真机配置验证：

- `pnpm typecheck`
- `pnpm -w run lint`
- `pnpm test`
- 关闭 Track B 时 runner 未被调用。
- 开启 Track B 时，所有输出都经过现有治理。
- 失败/超时/预算耗尽不阻塞 shutdown。
- 审计和诊断无正文泄露。

### Task 4：提供可控的 runner 注入与本地冒烟实现

**目标**：验证宿主注入接口，不把具体模型供应商耦合进扩展核心。

**范围**：
- 保留 `XpiMemoDependencies.offlineExtractionRunner` 作为测试和宿主注入点。
- 增加测试用 fake runner，输出一条 global preference、一条 project decision、一条敏感内容和一条非法提案。
- 不在仓库写入 API Key、Token、模型地址或供应商凭据。
- 如果 Pi 宿主已有可调用的模型接口，只在入口适配为 runner；否则本阶段只完成 provider-neutral 边界和 fake runner 验证，不自行引入新模型客户端。
- 在配置和 status 中明确显示 Track B 是否启用及最近一次结果。

**验收标准**：
- fake runner 可稳定复现 direct store、candidate、rejected、invalid 四类结果。
- 关闭配置时不会产生 runner 调用、预算消耗或提案。
- 配置 `XPI_MEMO_PAUSED=true` 时，提取不产生 T1 写入；若仍允许读取，行为必须由现有 paused 契约明确覆盖并测试。

**测试**：
- 配置单元测试：默认关闭、显式开启、非法配置 fail-closed。
- hook 集成测试：runner 调用参数和治理结果。

**依赖**：Checkpoint A。  
**预计范围**：S–M（2–4 个文件）。

### Task 5：真机调试与 2–4 周观测

**目标**：验证 Track B 是否恢复真实记忆价值，而不只验证代码路径成功。

**准备**：
- 使用临时 `XPI_MEMO_DATA_DIR`，避免污染现有记忆库。
- 显式设置 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true`。
- 先使用可审计、可回滚的测试 runner/宿主模型配置；不把凭据写入仓库或报告。
- 记录启用时间、版本、配置摘要和测试 session 标识。

**场景矩阵**：
1. 自然表达的 global preference：确认提案经过治理并可在后续 session 召回。
2. 自然表达的 project decision/constraint/gotcha：确认进入 candidate，不自动确认。
3. 纯技术栈事实：观察模型是否能提取；若提取为 `project_gene`，必须满足受信证据规则，不能仅凭模型推断直接写入。
4. 敏感内容、凭据、个人信息：确认被拒绝，不进入 T1、candidate 或正文审计。
5. 无模型、模型失败、模型超时：确认 shutdown 正常完成且有可诊断状态。
6. 同 session 重复 shutdown：确认最多一次提取。
7. 项目/全局/session 隔离：确认没有跨项目或跨 session 泄漏。
8. 召回闭环：比较 Track B 开启前后的非空 recall、注入次数和用户可见状态。
9. 用户删除行为：记录提案被 Store 后是否很快被 Forget，作为信任指标，而不是简单视为“捕获成功”。

**观测指标**：
- `extraction_runs`、`completed/failed/timed-out/unavailable`。
- `proposals_total`、`valid_proposals`、`invalid_proposals`。
- 各 kind 的 candidate/store/reject 数量。
- 用户 Store 比例、Reject 比例、后续 Forget 比例。
- 非空 recall 次数、自动注入次数、注入后用户是否继续使用相关上下文。
- 重复提案率、跨 scope 泄漏数、敏感内容误存数。

**保留/扩大条件**：
- 提案能稳定进入既有治理路径。
- 非空召回相对基线有可观察改善。
- 用户接受的内容具有持续使用价值，而不是只增加候选噪音。
- 敏感内容误存和 scope 泄漏为零。
- 模型失败不会破坏主工作流。

**停止或回滚条件**：
- 出现任何敏感内容进入 T1/candidate、跨项目泄漏或证据伪造。
- 候选噪音显著增加且用户 Reject 明显高于 Store。
- shutdown 延迟或失败影响正常工作流。
- 非空召回没有改善，且提案质量长期接近零。

**回滚方式**：
- 设置 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false` 或保持默认关闭。
- 必要时设置 `XPI_MEMO_PAUSED=true` 暂停 T1 写入/召回。
- 不删除 `audit.json`、候选、Bank 或 L0 文件；保留证据以便复盘。

**依赖**：Task 4。  
**预计范围**：实机验证和报告，不新增核心代码。

### Task 6：更新文档与决策记录

**目标**：让下一位开发者知道 P0 已结案、Track B 为 opt-in，以及为什么不继续扩词。

**建议文档落点**：
- 新增 OpenSpec change，例如 `openspec/changes/xpi-memo-track-b-extraction/`：`proposal.md`、`design.md`、`tasks.md`。
- 在该 change 中引用 `docs/evaluation-reports/feedback-2026-09-04.md` 作为 P0 验收证据和 Track B 决策依据。
- 更新 `ARCHITECTURE.md` 的 gated offline extraction 段落，说明当前触发点、预算、证据和回滚。
- 更新 `docs/COMPATIBILITY.md`，明确默认关闭、显式开启、数据兼容和禁用方式。
- 在评价报告或后续结论文档中记录：当前模板限制是已知设计边界，不是 P0 bug；不采用无限扩词。
- 若项目采用 ADR（架构决策记录），新增一个短 ADR 记录“保留正则热路径 + session_shutdown Track B + opt-in rollout”。若没有既有 ADR 编号约定，不强行新建第二套格式。

**验收标准**：
- 配置名、默认值、触发时机、预算、失败状态和回滚命令与代码一致。
- 文档不承诺未经真机验证的召回率或提案质量。
- 不新增密钥、Token 或完整用户记忆正文。

**依赖**：Checkpoint A；可与 Task 4 并行，但最终需在真机前完成。  
**预计范围**：S–M（2–5 个文档文件）。

## 不在本计划范围内

- 不重新实现已完成的 P0 双查询注入和 doctor 状态。
- 不把中文模板继续扩展成无限词表。
- 不替换 embedding（嵌入向量）模型。
- 不迁移到 Markdown 真相源。
- 不把 SQLite Bank 放入项目目录。
- 不自动启用 sleep 或把 sleep 当作 Track B 的实现。
- 不把所有 L0 事件自动提升到 T1。
- 不把模型推断伪装成用户明确陈述。
- 不新增后台 daemon（常驻后台进程）、第二套候选队列或新的外部依赖。

## 最终验证门禁

实现阶段完成前必须运行并通过：

```bash
pnpm typecheck
pnpm -w run lint
pnpm test
```

随后必须完成一次临时数据根真机冒烟，并保留：

- 配置与版本摘要；
- 提取状态和预算摘要；
- 候选/存储/拒绝计数；
- recall 与注入计数；
- scope 隔离、敏感内容和失败降级结果；
- 可回滚记录。

## 默认假设

- 现有 `offline-extraction.ts`、`extraction-budget.ts` 和 `session_shutdown` wiring 是当前实现基础，不另造抽象。
- 当前 runner 由宿主注入；本计划不假设仓库内已有可直接调用的具体 LLM API。
- 当前默认 `offlineExtractionEnabled=false` 保持不变，直到真实观测完成。
- 当前 `session_shutdown` 是唯一模型提取触发点；`session_before_compact` 仅记录/准备上下文，不启动第二次提取。
- 现有候选 Store/Later/Reject、T1 路由、L0 来源链、审计和内容策略均为不可绕过的治理边界。
- 计划只安排一条 Track B 管道，避免正则捕获、离线提取和 sleep 形成三套互相竞争的自动整理机制。
