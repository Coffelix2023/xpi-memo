# xpi-memo 记忆体优化治理结论

> 文档用途：留存 `xpi-memo` 与 `mnemopi`、`pi-memory`、`openhuman` 的对比结论，以及后续优化边界。
> 
> 结论基于本仓库源码、OpenSpec 变更和三方仓库截至本次调研获取的源码/文档。第三方项目会持续演进，实施前应重新核对上游版本和许可证。

## 1. 总体结论

`xpi-memo` 不应重写成另一个通用记忆引擎，也不应整体复制三个参考项目。最佳定位是：

> **具备自动捕获、主动召回和严格证据治理的 Pi 原生项目记忆层。**

推荐组合：

```text
xpi-memo：记忆治理主权、证据链、项目 Bank、L0/T1 边界、审计和 doctor
mnemopi：自动 recall/retain 生命周期、查询意图、排序和时间衰减
pi-memory：低摩擦写入、Markdown 可读视图、压缩交接和稳定快照
openhuman：source scope、数据可信级别、健康检查等架构思想
```

不追求“整体能力最强”，而追求：

```text
有价值内容能被捕获
有价值内容能在需要时被召回
错误内容不会污染长期记忆
每个失败状态都可以诊断
```

## 2. 对比后的定位

| 项目 | 最强能力 | 对 xpi-memo 的启发 |
|---|---|---|
| `mnemopi` | 自动首轮召回、定期 retain、事实抽取、working/episodic 记忆、向量/图/巩固 | 借自动生命周期和召回排序，不整体嵌入 Bun 运行时或完整引擎 |
| `pi-memory` | Markdown 优先、低摩擦写入、每日记录、scratchpad、压缩交接、退出摘要 | 借用户体验和上下文组织，不复制第二套 Markdown/qmd 系统 |
| `openhuman` | Memory Tree、多来源同步、数据可信级别、source scope、平台级诊断 | 只借治理思想；不复制 GPL 源码，不引入完整平台 |
| `xpi-memo` | 7 类 T1 类型、全局/项目 Bank、L0 事件源、证据/provenance、候选治理、空库 doctor | 保留并深化这些差异化能力 |

### 2.1 对 `mnemopi`

`mnemopi` 是四者中记忆引擎能力最强的方案：

- `autoRecall` 默认启用；
- `autoRetain` 默认启用；
- 默认每 4 个用户回合 retain；
- 支持 working memory、episodic memory、事实、三元组和图；
- 支持 embedding（嵌入向量）、事实抽取、时间召回、置信度和巩固；
- 支持 global、per-project、per-project-tagged scope。

`xpi-memo` 目前没有等价的自动 retain 和 L0 到 T1 自动形成闭环，因此在自动记忆能力上不如 `mnemopi`。

`xpi-memo` 的优势是语义治理更严格：

```text
global_preference
global_workflow
project_gene
project_constraint
project_decision
project_gotcha
session_context
```

并且每次写入有 evidence（证据）、provenance（来源链）、Bank 和审计信息。

**结论：**借 `mnemopi` 的生命周期和排序；保留 `xpi-memo` 的 T1 治理，不整体替换存储引擎。

### 2.2 对 `pi-memory`

`pi-memory` 是低摩擦 Pi 记忆扩展的优秀参考：

- `MEMORY.md`、每日 Markdown、`SCRATCHPAD.md` 和 recovery 文件结构清晰；
- 写入不要求复杂分类；
- 默认注入 scratchpad、今日记录、长期记忆和昨日记录；
- 支持 `session_before_compact` 会话交接；
- 支持稳定快照，避免每轮动态内容导致 KV Cache（键值缓存）失效；
- 可选 qmd（全文和语义检索工具）后台索引；
- 删除前保留可恢复记录。

`xpi-memo` 当前的主要不足是写入和召回均偏保守：

```text
Agent 不主动调用 remember，就没有 T1
非 TUI 候选会留在 candidates.json
普通编码 prompt 不触发 high-value-auto recall
```

**结论：**借 `pi-memory` 的低摩擦交互、handoff（会话交接）、稳定快照和 recovery（恢复记录）；不建立第二套 Markdown 事实源或第二套 qmd 索引。

### 2.3 对 `openhuman`

`openhuman` 不是同量级的 Pi 记忆扩展，而是包含以下能力的完整平台：

- Memory Tree；
- SQLite 与 Markdown/Obsidian 镜像；
- Gmail、Notion、GitHub、Slack 等外部数据同步；
- Agent 工作流；
- 多 Agent 编排；
- 平台级健康检查与安全策略。

如果目标是个人 AI 平台，`openhuman` 的能力远超 `xpi-memo`；如果目标是单一 Pi Coding Agent 的受治理项目记忆，`openhuman` 过重。

**结论：**只借鉴 `MemoryTaint`（记忆可信/污染等级）、`source_scope`（来源范围约束）、pipeline health（流水线健康状态）和 doctor 思想；不复制其完整源码或平台模块。

## 3. 许可证与复用边界

| 项目 | 已核对许可证 | 处理原则 |
|---|---|---|
| `mnemopi` / Oh My Pi | MIT（宽松开源许可证） | 可以在保留版权和许可证声明的前提下移植具体代码；优先仿照行为而不是复制大模块 |
| `pi-memory` | MIT | 可以移植具体工具函数或实现片段；保留版权、许可证和来源记录 |
| `openhuman` | GPL-3.0-only（GNU 通用公共许可证，仅第三版） | 不复制源码或模块；只根据公开行为和架构重新实现 |
| `xpi-memo` | 本仓库当前未发现根目录 `LICENSE`，且 `package.json` 为 `private` | 正式发布前先明确自身许可证和第三方声明策略 |

如果实际复制 MIT 代码，应新增或维护 `THIRD_PARTY_NOTICES.md`，至少记录：

- 上游仓库地址；
- 上游 commit 或版本；
- 复制的文件/函数；
- MIT 版权和许可证文本；
- 本项目对代码的修改。

不要复制 `openhuman` 的 Rust 记忆模块到 TypeScript，再用“只是参考”描述规避许可证问题。独立重写接口、数据模型和实现。

## 4. 必须保留的 xpi-memo 核心

### 4.1 七类 T1 类型

```text
global_preference   用户长期偏好
global_workflow     用户通用工作流
project_gene        项目稳定事实或技术基因
project_constraint  项目约束
project_decision    项目架构/实现决策
project_gotcha      项目踩坑和特殊注意事项
session_context     当前会话上下文
```

技术栈事实应归入 `project_gene`，项目强制要求归入 `project_constraint`，不是新增“技术栈偏好”类别。

### 4.2 全局和项目 Bank

保留当前混合拓扑：

```text
用户级数据根
├── global Bank
└── project Bank(s)
```

默认根目录：

```text
~/.pi/agent/xpi-memo/
```

项目 Bank：

```text
<dataDir>/banks/project-<id>/mnemosyne.db
```

继续使用稳定 Git 项目身份，避免不同 worktree 产生碎片记忆。

### 4.3 L0/T1 边界

- L0（零层，会话事件源）保存追加式会话轨迹；
- T1（第一层，治理长期记忆）只保存跨会话有价值的信息；
- 原始 transcript（对话记录）、工具输出和模型推理不能直接写入 T1；
- T1 记录必须保留来源、证据、时间和 Bank 信息。

## 5. P0 优化：让主动记忆真正形成闭环

### 5.1 增加确定性的显式记忆意图检测

不引入模型摘要器，先识别高置信度的用户显式意图：

```text
记住：以后默认使用 pnpm
请记住我偏好中文回复
以后不要引入 ESLint
我们已经决定使用 Adapter
Remember that this project uses Vitest
```

处理规则：

```text
明确 global_preference/global_workflow
  → 直接写入对应 T1

明确 project_decision/project_gotcha
  → 进入 candidate，或在 TUI 中确认

普通对话、工具输出、Agent 推断
  → 不直接进入 T1
```

这条路径的目标是降低“Agent 必须自己意识到要调用 remember”的依赖，但不放弃敏感内容过滤和项目路由。

### 5.2 增加极短的 Agent 使用指引

在可移除的 prompt 消息中加入：

```text
用户明确要求记住偏好、纠正做法或确认项目决策时，调用 xpi_memo_remember 并选择准确的 kind。不要保存原始对话、工具输出、密钥或推测。
```

不要每轮注入完整治理文档。

### 5.3 处理非 TUI candidate 积压

当前非 TUI 路径会把 candidate 留在 `candidates.json`，但缺少无人值守后的管理入口。

继续复用 `candidate-lifecycle.ts`，增加一个最小管理面：

```text
/xpi-memo-candidates
```

或等价的工具接口：

```text
list candidates
store candidate
reject candidate
 defer candidate
```

不新增第二个队列数据库，不在非 TUI 模式弹出阻塞 UI。

### 5.4 可选的轻量 agent_end 捕获

借鉴 `mnemopi` 的 `agent_end` 触发时机，但不把整段对话直接写入 T1：

```text
agent_end
  → 记录 L0 checkpoint
  → 扫描显式记忆意图
  → 高置信度写入 T1
  → 其他内容继续留在 L0 或 candidate
```

第一阶段不做 LLM 摘要、不做全量对话抽取。

## 6. P0 优化：让主动召回真正可见

### 6.1 默认启用有限主动召回

不要从保守策略直接切换到每轮全量搜索。建议：

```text
session_start：自动召回一次
新主题出现：最多自动查询一次
同一主题后续回合：复用已有结果
无高分结果：不注入 memory block
```

### 6.2 分离 standing memory 和 contextual memory

```text
standing memory
  global_preference
  global_workflow
  project_constraint
  少量高价值 project_gene

contextual memory
  project_decision
  project_gotcha
  project_gene
  session_context
```

建议初始预算：

```text
standing：最多 3 条
contextual：最多 3～5 条
总注入：约 4K～5K 字符
```

### 6.3 引入查询意图加权

借鉴 `mnemopi/src/core/query-intent.ts`，按 prompt 意图提高对应 kind 的分数：

```text
“之前决定了什么”
  → project_decision

“项目使用什么技术”
  → project_gene/project_constraint

“我平时偏好什么”
  → global_preference/global_workflow
```

### 6.4 引入价值排序和去重

推荐最终排序因素：

```text
relevance
× confidence
× recency
× scope priority
× diversity
```

先实现简单的时间衰减和内容去重；当记忆数量明显增长后，再借鉴 `mnemopi/src/core/mmr.ts` 的 MMR（最大边际相关性）去重。

主动召回必须有：

- 相关性阈值；
- 当前项目 scope 限制；
- superseded（已被取代）过滤；
- 结果数量上限；
- 字符/token（词元）预算；
- 无结果时静默跳过。

## 7. P1 优化：治理、恢复和诊断

### 7.1 扩展证据和状态字段

优先复用已有 source metadata 和 Mnemosyne 字段，保留：

```text
confidence
evidence_type
source_session
created_at
last_recalled
recall_count
superseded_by
```

不在第一阶段引入完整知识图谱或 Memory Tree。

### 7.2 删除可恢复

借鉴 `pi-memory`：

```text
forget
  → 保存 recovery record
  → 删除或标记 superseded
```

如实现成本可控，再增加 `xpi_memo_restore`；不要让恢复记录进入搜索索引。

### 7.3 扩展 doctor/status 指标

除现有：

```text
NEVER_CALLED
PENDING
WRITE_FAILED
RECALL_EMPTY
```

还应显示计数：

```text
remember 调用次数
显式意图捕获次数
candidate 数量
直接存储数量
拒绝数量
召回查询次数
召回命中次数
自动注入次数
无结果次数
后端失败次数
```

诊断只输出数量、kind、Bank、状态、证据类型和路径，不输出记忆正文。

## 8. 明确不做的事情

### 8.1 不整体嵌入 mnemopi

原因：

- `mnemopi` 主要面向 Bun（JavaScript 运行时）；
- `xpi-memo` 是 Node.js + TypeScript Pi 扩展；
- 会引入新的运行时和数据库生命周期；
- 当前问题主要是激活策略，不是缺少存储引擎。

### 8.2 不复制 pi-memory 全部实现

否则会产生：

```text
两套 Markdown 事实源
两套 qmd 索引
两套删除恢复机制
两套上下文注入路径
```

只吸收设计和少量 MIT 代码。

### 8.3 不复制 openhuman GPL 源码

只用 TypeScript 独立重写：

```text
source scope
trust/taint
pipeline status
doctor health
```

### 8.4 不把所有会话写入 T1

目标不是最大化数据库行数，而是最大化：

```text
有价值捕获率 × 有效召回率
```

### 8.5 第一阶段不加入模型摘要器

本阶段采用：

```text
确定性显式意图提炼
```

后续如果数据证明规则覆盖不足，再以可选、可关闭、带预算的模型提炼作为独立能力评估。

## 9. 推荐实施顺序

### 阶段一：恢复可用性

1. 增加显式用户记忆意图检测；
2. 增加极短的 remember 使用指引；
3. 增加首轮有限主动召回；
4. 扩大普通项目 prompt 的相关召回，但保留阈值和预算；
5. 提供非 TUI candidate 管理；
6. 增加捕获/召回/注入统计。

### 阶段二：提高召回质量

1. 查询意图加权；
2. 时间衰减；
3. superseded 过滤；
4. 内容去重；
5. 规模增长后再增加 MMR。

### 阶段三：增强可维护性

1. 稳定 standing memory 快照；
2. compaction handoff；
3. 可恢复删除；
4. source scope 和可信级别；
5. 可选的确定性仓库事实捕获。

## 10. 最终判断

`xpi-memo` 的竞争力不在于击败 `mnemopi` 的向量、事实图或自动巩固能力，也不在于复制 `openhuman` 的平台广度。

它应成为：

```text
比 pi-memory 更受治理
比 mnemopi 更容易解释和审计
比 openhuman 更聚焦 Pi 编码场景
```

最小有效方案是：

```text
借 mnemopi：自动 recall/retain 生命周期、query intent、时间/多样性排序
借 pi-memory：Markdown 视图、handoff、稳定快照、恢复删除
借 openhuman：source scope、可信级别、健康诊断思想
保留 xpi-memo：七类 kind、L0/T1、证据链、Bank、candidate、doctor
```

核心原则：

> **捕获可以低摩擦，长期记忆必须有边界；召回可以主动，但只有高相关内容才能进入上下文。**

## 11. 参考来源

- Oh My Pi / `mnemopi`：<https://github.com/can1357/oh-my-pi/tree/main/packages/mnemopi>
  - 重点参考：`packages/mnemopi/src/core/memory.ts`
  - `packages/mnemopi/src/core/query-intent.ts`
  - `packages/mnemopi/src/core/mmr.ts`
  - `packages/mnemopi/src/core/weibull.ts`
  - `packages/coding-agent/src/mnemopi/state.ts`
  - `packages/coding-agent/src/mnemopi/config.ts`
- `pi-memory`：<https://github.com/jayzeng/pi-memory>
  - 重点参考：根目录 `index.ts`、`README.md`、`design.md`
  - 版本：本次调研获取的 `0.4.2`
- `openhuman`：<https://github.com/tinyhumansai/openhuman>
  - 重点参考：`src/openhuman/memory/`、Memory Tree、source scope、doctor 文档和测试
  - 版本：本次调研获取的 `0.63.19`
- 本仓库：
  - `src/kinds.ts`
  - `src/routing.ts`
  - `src/pending-candidate.ts`
  - `src/candidate-lifecycle.ts`
  - `src/recall-policy.ts`
  - `src/doctor.ts`
  - `src/index.ts`
  - `openspec/changes/fix-zero-memory-activation/`
