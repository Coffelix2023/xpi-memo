# xpi-memo 进化策略探索 Handoff

- 状态：Explore Mode 结论交接；本文件不包含实现代码
- 用途：新窗口启动 OpenSpec 决策目标工作前，先读取本文件
- 参考项目：`pi-memory-mem0`
  - https://github.com/TGYD-helige/pi/tree/master/packages/pi-memory-mem0
- 相关探索：[`docs/xpi-memo-architecture-exploration.md`](./xpi-memo-architecture-exploration.md)
- 当前仓库已有未应用变更：`xpi-memo-ui-visual-layer.bak`

## 1. TL;DR

`pi-memory-mem0` 值得移植的是安全边界、时间语义和配置表达方式，不是 Mem0 的存储模型或无治理自动推理。

`xpi-memo` 的核心边界必须保持：

```text
L0（Level 0，会话事件真源）
  append-only、可重放、不可变
        ↓
T1（Tier 1，受治理长期记忆）
  七分类、证据、候选确认、作用域路由
        ↓
MEMORY.md
  人类可读的派生投影，不是真源
```

本次探索的优先结论：

1. P0：召回内容进入模型前增加不信任数据边界。
2. P0：在所有外部传输边界执行凭证保护。
3. P0：修复 L0/T1 双写一致性风险；不能为了取得 backend ID 牺牲 L0 记录。
4. P1：定义自动捕获、自动召回、召回频率的独立语义。
5. P1：为 Track B（离线提取路径）准备 `observedAt` 和宿主 provider runner。
6. P2：在可靠的精确 ID API 可用前，只做重复记忆报告，不做自动删除。

## 2. 已确认的当前架构

```text
Pi input
  ├─ L0 记录 user_message / tool_call / tool_result
  └─ before_agent_start
       ├─ 显式意图识别
       ├─ T1 治理写入或候选创建
       └─ recall → rank → renderMemoryContext → custom user message

session_before_compact / session_shutdown
  └─ 可选 Track B 离线提取
       └─ normalize → content policy → scope routing → candidate governance

T1 写入
  ├─ Mnemosyne bank
  ├─ L0 t1_memory_write
  ├─ audit.json
  └─ 异步 Markdown export
```

关键代码：

- 生命周期与注入：[`src/index.ts:1752`](../src/index.ts:1752)、[`src/index.ts:2451`](../src/index.ts:2451)
- 内容策略：[`src/content-policy.ts:37`](../src/content-policy.ts:37)
- 召回排序：[`src/recall-ranking.ts:195`](../src/recall-ranking.ts:195)
- 候选生命周期：[`src/candidate-lifecycle.ts:139`](../src/candidate-lifecycle.ts:139)
- Track B 边界：[`src/offline-extraction.ts:170`](../src/offline-extraction.ts:170)
- L0 协议：[`src/l0/types.ts:1`](../src/l0/types.ts:1)、[`src/l0/l0-runtime.ts:1`](../src/l0/l0-runtime.ts:1)
- Mnemosyne 适配：[`src/operations.ts:1`](../src/operations.ts:1)
- Markdown 投影：[`src/markdown-export/exporter.ts:165`](../src/markdown-export/exporter.ts:165)、[`src/markdown-export/memory-generator.ts:1`](../src/markdown-export/memory-generator.ts:1)

## 3. P0：安全边界

### 3.1 召回注入安全

当前 `renderMemoryContext()` 直接生成：

```text
<memories>
1. 原始记忆文本 [kind]
</memories>
```

存在的问题：

- 没有明确的 `[UNTRUSTED MEMORY DATA]` 边界。
- 没有对 prompt injection（提示注入）模式做阻断。
- `memory_injected` 只记录 `injectedMemoryIds`，不能解释阻断数、省略数或策略版本。
- `xpi_memo_show_injected` 是历史注入查询，不是当前上下文完整预览。

推荐的逻辑边界：

```text
RecallItem[]
  ↓
排序、去重、字符/条目预算
  ↓
安全格式化
  ├─ 命中注入模式：阻断并记录计数
  └─ 未命中：JSON quote + UNTRUSTED 标记
  ↓
custom user message
  ↓
L0 memory_injected：只记录 ID 与有界元数据，不记录内容体
```

安全函数应覆盖：

- 自动注入路径；
- `xpi_memo_recall` 的模型可见工具输出；
- `xpi_memo_show_injected` 的输出；
- 后续 context preview 的输出。

不能直接复制 Mem0 的 `@amaster.ai/pi-shared/threat-patterns`：当前 `package.json` 和 lockfile 未提供该依赖。应先使用现有依赖和小型、可测试的本地规则；不要为几个正则引入新安全库。

### 3.2 凭证保护

当前 `content-policy.ts` 主要是“拒绝”，而不是“脱敏后继续处理”；Markdown 导出已有 `redactSensitive()`，但它只覆盖导出层。

必须区分两个边界：

```text
L0 本地事件流
  = 是否保留原始事件，取决于 L0 lossless 合约

外部传输边界
  = 发送给 Track B runner、Mnemosyne 或其他 provider 前必须脱敏
```

推荐决策：

- L0 继续作为可重放事件真源，不在事件写入后修改历史事件。
- 发送给外部模型、Mnemosyne 或 provider runner 前执行凭证脱敏，或直接拒绝。
- `MEMORY.md` 继续按 `privacy` 配置执行导出脱敏。
- 不要把“L0 原文”和“外部安全副本”混成同一份数据。

未决决策：是否允许 L0 本地保留原始敏感内容。若继续宣称 L0 lossless，建议允许本地保留并强化文件权限，同时禁止原文出域；若不允许，则必须重新定义 L0 合约。

## 4. P0：L0/T1 一致性风险

当前部分 governed write 路径是：

```text
T1 adapter.store()
  ↓
L0 t1_memory_write
```

这样可以拿到 Mnemosyne `memoryId`，但 L0 写入失败时会留下：

```text
T1 已存在
L0 没有对应事件
audit / MEMORY.md 无法可靠重建
```

[`src/l0/l0-runtime.ts`](../src/l0/l0-runtime.ts) 已明确：governed T1 write 应遵循 L0-first；`recordSafe()` 只适用于 hook 的 best-effort 记录。

推荐决策顺序：

1. 恢复 L0-first。
2. 接受首次 `t1_memory_write` 可能没有 backend ID，或新增独立的 ID 关联事件。
3. 不使用“先写 T1，再写 L0”作为取得 ID 的捷径。
4. 不把必须成功的治理事件降级为 `recordSafe()`。

另外，[`src/operations.ts:143`](../src/operations.ts:143) 的 `getMemoryById()` 当前用相关性 `recall` 模拟精确 ID 查询。真实 CLI 行为已被验证为不可靠，因此：

- `forget`、`show_injected` 和 recovery 不能假设它是精确主键读取。
- dedup 的删除流程不能依赖它。
- 应先记录为上游能力缺口，或等待稳定的 `get <id>` API。

## 5. 七项建议的决策矩阵

| 建议 | 解决的痛点 | 当前状态 | 决策 |
| --- | --- | --- | --- |
| 安全注入三件套 | 召回内容可能被模型误当成指令 | `renderMemoryContext` 直接拼接文本 | P0，立即规划 |
| 凭证脱敏 | secret/token 可能进入 T1、runner、provider 或导出 | content policy 多为拒绝，导出层已有部分脱敏 | P0，按边界分层 |
| `observedAt` | 历史回放时“昨天/上周”被系统当前时间锚定 | source metadata 尚未区分观察时间与写入时间 | P1，先定义协议 |
| `recallFrequency` | startup recall 与 prompt recall 可能重复，token 成本不可控 | 只有 recall policy 三档 | P1，先定义 session 语义 |
| 三控独立覆盖 | 无法独立表达自动捕获、自动召回、工具可用性 | 配置已有多个单字段覆盖 | P1，谨慎拆分 |
| provider registry 映射 | Track B 需要额外 provider/key 配置 | 已有 provider-neutral runner | P1，放宿主适配层 |
| dedup 维护命令 | T1/MEMORY.md 可能积累 exact duplicate | 局部有 idempotency、召回去重、导出去重标记 | P2，先 report-only |

## 6. 配置方向

不建议直接复制 Mem0 的 `hybrid / active / passive`。`xpi-memo` 的显式捕获是确定性意图识别，T1 工具还是治理、删除和诊断入口。

建议把行为拆成独立语义：

```text
automaticCapture
  显式意图激活是否启用

automaticRecall
  是否执行 before_agent_start 自动召回

recallFrequency
  每次用户输入
  每个 Pi session 一次
  仅高价值触发

offlineExtraction
  独立开关，默认关闭

managementTools
  默认保持可用
```

拆分前必须先解决：

- startup recall 与 prompt recall 是否允许同一轮同时发生；
- session 频率是按 session ID、fork 还是 resume 计算；
- recall 失败是否消耗一次频率预算；
- `recallPolicy` 与新字段如何兼容；
- 配置是否需要 preset，还是现有字段已经足够。

Ponytail 判断：如果只需要“关闭自动注入”，先增加一个最小的 `automaticRecall` 语义，不要先引入完整 preset 体系。

## 7. `observedAt` 与 provider runner

建议区分：

```text
L0 event.timestamp
  事件写入事件流的时间

observedAt
  原始事实或会话实际发生的时间

T1 confirmedAt
  记忆通过治理并写入 T1 的时间
```

`observedAt` 主要服务历史回放和 Track B，live Track A 可以省略。

provider 映射应位于宿主层：

```text
Pi modelRegistry
  ↓
宿主 resolver
  ↓
OfflineExtractionRunner
  ↓
xpi-memo 核心治理
```

核心治理代码不应认识 OpenAI、Anthropic 等具体 provider。这样可以复用 Pi 已配置的凭证和 base URL，同时保持治理边界 provider-neutral。

## 8. Dedup 边界

当前已有：

- `memory-idempotency`：同一 L0 事件避免重复写入；
- `recall-ranking`：一次注入内去重；
- `memory-generator`：导出时标记 exact duplicate。

这不等于 T1 持久化去重。未来 dedup 必须采用：

```text
只读扫描
  ↓
报告重复候选、kind、scope、project identity 和时间依据
  ↓
用户确认
  ↓
写入 L0 supersession/deletion 事件
  ↓
调用可靠的 T1 删除 API
```

去重键至少应考虑：

- canonicalized content；
- memory kind；
- semantic scope；
- project identity；
- active/superseded 状态。

在 Mnemosyne 没有可靠精确 ID API 前，不做自动删除。

## 9. OpenSpec 决策目标

新窗口开始决策目标工作时，先回答以下问题，再创建 change：

### 目标 A：是否把 P0 合并为一个 change

推荐拆成两个独立边界：

```text
memory-boundary-hardening
  - 召回安全包装
  - 外部写入/模型输入凭证保护
  - 注入诊断元数据

memory-consistency-hardening
  - L0-first governed write
  - backend ID 关联策略
  - 精确 ID 查询能力边界
  - MEMORY.md 投影一致性
```

若当前发布压力要求最小变更，先只做 `memory-boundary-hardening`，但必须在 proposal 中明确 L0/T1 一致性风险仍未解决。

### 目标 B：是否包含 `observedAt`

推荐不放入 P0 安全 change。它属于 Track B 协议演进，应独立规划或作为 P1 的明确任务。

### 目标 C：是否重构配置

先用现有 `recallPolicy` 和一个最小自动召回开关验证真实痛点；只有用户确实需要独立控制自动捕获和管理工具时，再引入 preset + override。

### 目标 D：是否修改 UI change

不要把运行时安全、凭证保护、L0/T1 一致性塞入 `xpi-memo-ui-visual-layer.bak`。UI change 可以消费未来的只读诊断契约，但不拥有 memory engine、治理或存储语义。

## 10. 推荐的新窗口启动顺序

1. 读取本文件。
2. 读取 [`docs/xpi-memo-architecture-exploration.md`](./xpi-memo-architecture-exploration.md)。
3. 读取根目录 `AGENTS.md` 和项目 `.pi/agent/AGENTS.md` 约束。
4. 执行 `openspec list --json`，确认现有 change。
5. 阅读 `xpi-memo-ui-visual-layer.bak` 的 proposal/design/tasks，避免范围混入。
6. 选择一个明确的决策目标：安全边界、一致性，或 Track B 协议。
7. 仅在目标、边界和未决问题清楚后创建新的 OpenSpec change。

探索阶段约束：不要直接实现代码；如果用户要求实现，先退出 Explore Mode，并创建 change proposal。

## 11. 不应移植的内容

- 不引入 Mem0 SDK 或 Mem0 作为运行时依赖。
- 不把向量库替换为唯一真源。
- 不委托外部 LLM 自动解决 xpi-memo 的冲突和治理。
- 不引入 platform 模式，让敏感记忆默认出域。
- 不在没有可靠精确 ID API 时做自动 dedup 删除。
- 不因为追求 UI 可见性而给 L0 注入事件写入完整记忆内容。

## 12. 最终判断

Mem0 的成熟点不在于它证明了“全自动记忆”适合 xpi-memo，而在于它把两个边界做得清楚：

```text
外部记忆内容不是可信指令
凭证不应原样进入存储或外部 provider
```

`xpi-memo` 应吸收这两个边界，同时保留自身的核心差异化：L0 事件溯源、T1 治理、候选确认、证据链和可审计投影。
