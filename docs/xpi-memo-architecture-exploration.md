# xpi-memo 架构探索备忘录

- 状态：Explore Mode，仅记录调研、结论与决策指导，不包含实现
- 范围：评估 `pi-hermes-memory` 的 6 项可移植设计，并与当前 `xpi-memo` 架构对照
- 参考日期：本文件按当前工作区状态整理
- 参考项目：
  - https://pi.dev/packages/pi-hermes-memory
  - https://github.com/chandra447/pi-hermes-memory

## 1. 结论摘要

`pi-hermes-memory` 的设计值得借鉴，但不能作为 `xpi-memo` 的替代骨干。两者的核心取向不同：

```text
pi-hermes-memory
  Markdown 当前状态 + SQLite 搜索镜像 + agent 自主写入

xpi-memo
  L0 事件溯源 + T1 受治理写入 + Markdown 派生投影
```

本次探索的主要结论：

1. Markdown 投影同步纪律是当前最优先的问题，且现有实现存在真实一致性风险。
2. `completeSimple()` 是合适的未来传输方向，但当前 Pi 扩展公开 API 没有直接暴露该能力，不能凭名称假设可用。
3. Standing Instructions 应是独立的、用户主动维护的确定性指令层，不应把 `project_constraint` 简单升级为 pinned memory。
4. 纠正即时保存已有实现雏形，当前主要缺口是识别覆盖率、否定表达和误触发边界。
5. 工具调用触发与当前每 session 一次的提取预算模型冲突，必须先重新定义预算和任务合并语义。
6. `show_injected` 是历史注入查询，不是完整的当前上下文预览；未来 preview 应保持只读且不触发新的 recall。
7. 不引入 `pi-hermes-memory` 作为依赖。两套存储布局和治理模型混装会造成双份、互不可见的记忆系统。

## 2. 当前 xpi-memo 架构

```text
Pi input
  │
  ├─ L0（会话事件层）追加 user_message / tool_call / tool_result
  │
  └─ before_agent_start
       ├─ 显式意图识别
       ├─ T1（长期记忆层）治理写入或候选
       └─ recall 检索并注入上下文

session_before_compact / session_shutdown
  └─ 可选离线提取 runner
       └─ 规范化、内容策略、scope 路由、候选治理

T1 写入
  ├─ Mnemosyne bank
  ├─ L0 t1_memory_write
  ├─ audit.json
  └─ 异步 Markdown export
```

已验证的关键代码位置：

- 生命周期和主流程：[`src/index.ts`](/Users/felix/c6x_local/app-prd/xpi-memo/src/index.ts:1924)
- Markdown 导出：[`src/markdown-export/exporter.ts`](/Users/felix/c6x_local/app-prd/xpi-memo/src/markdown-export/exporter.ts:165)
- MEMORY.md 生成：[`src/markdown-export/memory-generator.ts`](/Users/felix/c6x_local/app-prd/xpi-memo/src/markdown-export/memory-generator.ts:67)
- 显式纠正识别：[`src/memory-intent.ts`](/Users/felix/c6x_local/app-prd/xpi-memo/src/memory-intent.ts:43)
- 候选生命周期：[`src/candidate-lifecycle.ts`](/Users/felix/c6x_local/app-prd/xpi-memo/src/candidate-lifecycle.ts:139)
- 离线提取边界：[`src/offline-extraction.ts`](/Users/felix/c6x_local/app-prd/xpi-memo/src/offline-extraction.ts:170)
- 现有 P0 评审：[`docs/review.md`](/Users/felix/c6x_local/app-prd/xpi-memo/docs/review.md:10)

当前进行中的 `xpi-memo-ui-visual-layer` OpenSpec 明确把 memory engine、治理和存储语义排除在外。因此同步、transport、standing instruction 和周期提取应作为独立变更讨论；context preview 若只消费既有只读状态，可以与 UI 变更关联。

## 3. 建议一：Markdown 与存储同步纪律

### 3.1 参考设计

`pi-hermes-memory` 把 Markdown 写入和 SQLite 搜索镜像视为一个同步不变量，并提供显式 `/memory-sync-markdown` 回填命令。成功写入后立即可搜索；同步失败不能静默变成 SQLite-only 状态。

### 3.2 当前实现中的实际风险

当前导出器已经有增量 position、`--force`、`memoryOnly`、删除事件过滤和 `validateExport()`，但这些能力没有形成完整的投影一致性保证：

1. `xpi_memo_forget` 写入 `memory_deleted` 后没有立即调度 Markdown export，`MEMORY.md` 可能继续显示已删除记忆。
2. 普通增量 export 只把本次读取的事件放入 `memoryInputs`，但会重写整个 `MEMORY.md`。新增一条 T1 记忆后，旧记忆可能不再出现在文件中。
3. 只有删除事件的新一轮增量 export 没有完整历史 T1 内容，无法可靠地从现有文件中只删除目标条目。
4. `MEMORY.md` 写入失败后，导出 position 仍可能被持久化。下次运行不会重新处理这些事件，投影会陈旧。
5. `validateExport()` 只验证 L0 position 是否覆盖，不验证 `MEMORY.md` 是否成功写入、是否完整或是否对应当前投影。
6. `memory-generator.ts` 已留下 TODO：未来应考虑从当前 T1 bank 重建，而不是只从 L0 历史投影。这说明当前设计债务已经被代码标记。

### 3.3 适合 xpi-memo 的同步不变量

不应直接复制“Markdown 是真源”的模型。根据 L0 合约，适合本项目的定义是：

```text
L0 是唯一事件真源
T1 是受治理的当前记忆引擎
MEMORY.md 是可重建的人类可读投影
投影失败时不得推进对应游标
删除后必须触发投影重建
必须提供显式 full rebuild / sync 命令
```

第一阶段建议保留 L0 派生模式：完整读取所有相关 L0 事件，按 `memory_deleted`、supersede 和治理状态确定性生成 MEMORY.md。不要在此阶段引入第二套 Markdown-to-T1 冲突解决模型。

### 3.4 决策指导

| 选项 | 判断 |
| --- | --- |
| 复制 Hermes 的 Markdown 真源模型 | 不选。破坏 L0 事件溯源边界 |
| 继续当前增量投影，不补不变量 | 不选。已有覆盖和失败推进风险 |
| L0 全量重建 MEMORY.md，增量日志独立处理 | 推荐。改动最小，符合现有合约 |
| 直接从 Mnemosyne 当前 bank 重建 | 后续选项。需要稳定枚举 API 和当前状态语义 |

## 4. 建议二：进程内 LLM 边车 transport

### 4.1 参考设计

`pi-hermes-memory` 默认用进程内 `completeSimple()` 处理 review、flush、correction 和 consolidation；失败时再回退到 subprocess。目标是避免启动子 Pi 进程，并减少参数、扩展加载和会话缓存方面的开销。

### 4.2 当前 Pi API 边界

已安装的 Pi 类型显示：

- `ExtensionContext` 暴露 `model` 和 `modelRegistry`。
- `ModelRegistry` 暴露 `complete()`。
- `ModelRuntime` 内部类型暴露 `completeSimple()`。
- 当前扩展公开 API 没有直接向 extension 暴露 `ModelRuntime` 或 `completeSimple()`。
- `OfflineExtractionRunner` 已经是一个宿主注入的 provider-neutral 边界。

因此，不能仅因为依赖包内部存在 `completeSimple()`，就直接在扩展中调用它。

### 4.3 额外风险

自动 fallback 可能导致重复请求和重复费用：

```text
direct 请求已经到达 provider
  ├─ provider 实际成功，但响应解析失败
  └─ subprocess fallback 再发一次请求
```

所以未来 transport 必须区分：

- 请求尚未发送：允许 fallback。
- 请求已经发送但结果未知：不能自动重试。
- 每次提取必须有幂等运行 ID。
- direct 和 subprocess 的结果都必须经过同一套规范化、内容策略和治理。
- `session_shutdown` 不能依赖一个无法终止的 LLM 请求。
- `session_before_compact` 不能阻塞 Pi 的压缩主流程。

“保住主会话 KV cache”也不能作为无条件承诺。进程内调用可以避免子进程启动成本，但 provider 是否复用前缀缓存取决于实际模型、请求上下文和 provider 行为，需要实测。

### 4.4 选型

当前不新增 `reviewTransport` 配置，也不猜测私有 API。保留：

```text
XpiMemoDependencies.offlineExtractionRunner
```

未来有两种合适入口：

1. Pi 扩展公开正式的简单模型调用接口后，由 xpi-memo 适配该接口。
2. 宿主显式注入 `direct` runner，xpi-memo 只消费 provider-neutral runner。

只有在真实 runner 存在后，才讨论 `direct`、`subprocess` 和 fallback 策略。

## 5. 建议三：Standing Instructions 确定性指令层

### 5.1 当前误区

`kinds.ts` 已有：

```text
MemoryRole = standing | contextual
```

并且 `global_preference`、`global_workflow`、`project_constraint` 被标记为 `standing`。但这只是 taxonomy（分类元数据），不代表每次会话无条件注入。

当前 `before_agent_start` 仍通过 recall policy 和搜索结果决定注入内容。即使一个记忆的 role 是 `standing`，它仍可能检索不到。

### 5.2 两类数据必须分开

```text
用户 pin 的确定性指令
  ├─ 用户主动创建
  ├─ 每会话注入
  ├─ agent 不得自动晋升
  ├─ 有独立容量上限
  └─ 可明确列出、删除和预览

T1 standing memory
  ├─ 经过治理
  ├─ 依赖 recall policy
  ├─ 允许检索失败
  └─ 属于长期记忆系统
```

因此不建议直接给 `project_constraint` 增加 `pinned: true`。这会把“用户硬指令”和“待审查的项目约束候选”混成同一个治理对象。

### 5.3 Project Trust 边界

项目级 standing instruction 尤其需要遵守 Project Trust（项目可信）边界：

- 未信任项目中的仓库文件不能自动变成高优先级持久化指令。
- 项目级 pin 可以存储在项目 `.pi/memory/`，但只有受信任项目才允许无条件注入。
- 全局 pin 应位于 xpi-memo 自有数据目录，不应依赖当前工作目录。
- 所有 pin 必须经过现有内容安全策略扫描。
- 注入块必须有清晰来源标记和硬上限。

Hermes 提出的 20 条 / 2000 字符可以作为初始参考，不应视为已验证的 xpi-memo 产品决策。

## 6. 建议四：纠正即时保存

### 6.1 已有能力

当前 `memory-intent.ts` 已识别：

- `actually`
- `更正`
- `纠正`

并且在 `before_agent_start` 中同步执行显式意图激活。全局 preference/workflow 可以直接存储，项目高影响类型仍经过候选治理。

因此“纠正即时保存”的核心路径已经存在，不需要从零新增后台 review。

### 6.2 需要补强的方向

建议建立小型判定矩阵，而不是单纯扩大正则：

```text
强纠正词 + 唯一记忆类型
  → 立即进入现有治理路径

弱纠正表达 + 明确记忆类型
  → 仅在置信边界满足时进入治理

记忆类型不明确
  → 不写入

否定表达
  → 明确阻断

项目事实表达
  → 继续要求验证，不因“纠正”绕过规则
```

需要特别覆盖：

- “不是这样”“以后按这个来”“我说的是……”等自然表达。
- “不要记住”“这只是举例”“这不是规则”等否定表达。
- 纠正前缀与项目决策、工作流、偏好同时出现时的歧义。
- 中文和英文混合表达。
- 纠正路径的延迟，以及它是否阻塞 `before_agent_start`。

## 7. 建议五：按轮次和工具调用触发 review

### 7.1 当前生命周期能力

Pi 已提供：

- `tool_call`
- `tool_result`
- `turn_start`
- `turn_end`
- `session_before_compact`
- `session_shutdown`

当前 xpi-memo 只在 `session_before_compact` 和 `session_shutdown` 处理离线提取，并且默认每 session 最多执行一次。

### 7.2 冲突点

如果加入“每 10 轮或每 15 次工具调用触发”，就必须先回答：

- 每次达到阈值是否真正执行一次 LLM 提取？
- 还是只设置 `extraction-due`，由安全生命周期点执行？
- 当前每 session 一次预算是否取消？
- 多个阈值触发是否合并？
- direct 请求运行期间的新事件如何处理？
- `tool_call` 已产生但没有 `tool_result` 时是否计数？
- 提取失败是否可以重试？

当前预算：

```text
每 session 最多执行 1 次
最多 20 个 proposal
最多 5000 字符
```

在这个模型下，周期触发几乎没有实际意义。

### 7.3 推荐状态机

未来可以采用：

```text
事件累计
  │
  ├─ 达到轮次或工具调用阈值
  │    └─ 标记 extraction-due
  │
  ├─ 当前没有提取任务
  │    └─ 启动一次有界提取
  │
  └─ 已有提取任务
       └─ 合并为下一次 dirty 状态
```

更合理的计数点是 `turn_end` 或工具执行完成后的 `tool_result`，避免在工具尚未完成时提前触发。阈值应取“先到者”，但不能绕过 session 总预算、并发锁和幂等处理。

## 8. 建议六：Context Preview

### 8.1 当前能力的边界

当前 `xpi_memo_show_injected` 主要依赖最近的 `memory_injected` L0 事件：

```text
记录 injectedMemoryIds
  → 按 ID 反查记忆内容
```

它适合回答“最近注入了哪些记忆”，但不是完整的当前上下文视图，不能稳定回答：

- 当前 prompt 实际注入了什么。
- 哪些候选因字符预算被省略。
- 使用了哪个 recall policy。
- startup recall 和 prompt recall 是否重复。
- 是否存在 standing instruction。
- 注入内容来自哪个生命周期阶段。

### 8.2 未来 preview 的约束

`/memory-preview-context` 应是只读诊断视图，显示：

```text
Policy
Standing instructions
Recall query
Selected memories
Omitted count / omission reason
Character and item budget
Scope / trust / lifecycle state
Source references
```

它不应：

- 触发新的 recall。
- 修改 audit。
- 写入 L0。
- 持久化 UI 专属状态。
- 因预览而改变下一次实际注入结果。

当前 `show_injected` 可以保留为历史事件查询；preview 需要额外的“当前有效上下文”契约。

## 9. 推荐优先级

```text
P0：先修一致性
  1. 修复 MEMORY.md 增量重建可能覆盖历史内容的问题
  2. MEMORY.md 写失败时不得推进导出游标
  3. forget 后触发投影同步或明确标记 dirty
  4. 扩展 validateExport，使其验证投影状态
  5. 修复现有评审指出的 L0/T1 双写顺序风险

P1：建立可验证的边界
  6. 明确 direct runner 的宿主接口
  7. 强化纠正识别和否定阻断
  8. 设计只读 context preview

P2：新增策略能力
  9. 独立 Standing Instructions 存储和注入层
  10. 轮次 / 工具调用触发提取
  11. 程序性记忆或 skill 管理
```

## 10. 推荐的变更拆分

为了保持提交小、可回滚和边界清晰，后续不建议把所有建议合并成一个大 change：

1. `markdown-projection-hardening`
   - 只处理 MEMORY.md、游标、删除后的同步、投影验证。
2. `in-process-review-runner`
   - 只处理宿主注入 runner、direct transport、幂等和 fallback。
3. `standing-instructions`
   - 只处理用户 pin、Project Trust、预算和确定性注入。
4. `review-trigger-policy`
   - 只处理轮次、工具调用、任务合并和预算。
5. `context-preview`
   - 如果只消费既有状态，可纳入现有 UI change；如果需要新的运行时上下文契约，应独立建 change。

## 11. 当前应保留的决策

| 决策 | 状态 | 理由 |
| --- | --- | --- |
| 不引入 `pi-hermes-memory` 依赖 | 已建议 | 存储布局、事件溯源和治理模型不兼容 |
| L0 继续作为事件真源 | 推荐 | 符合现有 `docs/l0-contract.md` |
| MEMORY.md 继续作为派生投影 | 推荐 | 避免第二套冲突解决系统 |
| 暂不直接调用 `completeSimple()` | 推荐 | 当前扩展公开 API 不提供直接契约 |
| 不把 `project_constraint` 直接变成 pinned | 推荐 | 用户硬指令与待审查记忆语义不同 |
| 暂不加入周期提取触发 | 推荐 | 当前一次/session 预算不匹配 |
| preview 保持只读 | 推荐 | 诊断不应改变记忆行为 |

## 12. 未决问题与验证门槛

### Markdown 投影

- 增量导出是否应改为“事件日志增量 + MEMORY.md 全量重建”。
- 是否需要一个独立的 `projection-status.json`，记录成功投影版本、dirty 状态和失败原因。
- `MEMORY.md` 是否需要基于完整 L0 事件生成，还是等待 Mnemosyne 提供稳定当前状态枚举。

### Direct runner

- Pi 是否会提供 extension 可用的 `completeSimple()` 正式 API。
- `ctx.modelRegistry.complete()` 是否满足 JSON-only、超时、取消和无工具调用要求。
- provider 请求已发出但结果未知时，如何避免重复计费。
- direct runner 是否能在 shutdown 和 compact 生命周期安全结束。

### Standing Instructions

- 全局 pin 和项目 pin 是否都需要支持。
- 项目 pin 是否允许进入仓库并被 Git 协作共享。
- 20 条 / 2000 字符是否适合真实使用。
- pin 与 recall 记忆冲突时，哪一层拥有优先级，以及如何展示冲突。

### 周期 review

- 触发点使用 `turn_end`、`tool_result` 还是安全生命周期点。
- session 总预算是否从 1 次提升为可配置的有限次数。
- review 是否只生成候选，不允许直接存储。
- 长会话中重复提取的事件窗口如何界定。

## 13. 最小下一步

如果进入实现阶段，优先建立一个只针对 Markdown 投影的 change，并先增加能暴露以下问题的回归场景：

```text
首次导出旧记忆
  → 新增一条 T1 记忆
  → 再次增量导出
  → 旧记忆和新记忆都存在

首次导出旧记忆
  → forget 一条记忆
  → 增量导出
  → 目标消失，其他记忆保留

MEMORY.md 写入失败
  → 导出结果标记失败
  → position 不推进
  → 下次导出仍会重试
```

这是当前风险最明确、边界最小、最适合先落地验证的方向。
