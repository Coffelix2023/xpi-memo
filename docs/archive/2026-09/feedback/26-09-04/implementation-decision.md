# xpi-memo 架构修复实施决策

**日期**: 2026-09-04  
**基于**: feedback-0904-3.md + feedback-0904-3-conclusion.md + feedback-0904-3-advisors.md  
**决策原则**: 用户观点"现在还没到引入其他memory工具的时候" + 架构师裁决

---

## 一、决策总结

根据架构师对 Design Deck 四张卡片的裁决，结合用户"将部分困局文档存底、延后处理"的观点，本轮实施方案：

### 立即实施（P0，本轮完成）

1. **Track B 真实验证** - 连续三轮空白，最后期限，一次会话有答案
2. **MEMORY.md 止血（方案 C）** - L0 删除事件剔除 + TODO 标注 L2 根治
3. **孤儿 Bank revoke 工具** - `xpi_memo_init --revoke` 归档到 `banks-archived/`
4. **forget 恢复设计** - 从 pi-memory 学习，`recovery/<id>.json` 可恢复

### 文档存底（延后到 L2/ai-memory 阶段）

1. **MEMORY.md 根治（bank 重建）** - TODO 标注在代码中，和 L2 打包
2. **注入相关性验证** - 不阻塞当前功能
3. **supersededBy 去重** - 随 mechanical sleep 一起做

---

## 二、架构师裁决要点

### 卡片 1/4：MEMORY.md 数据源 - **改选 C（混合方案）**

**推翻原推荐 A**，理由：
- 方案 A 把正确性寄托在"每个删除路径记得发 `memory_deleted` 事件"——和当初 forget 漏发的根因是同一模式（调用点各自努力）
- 方案 B 一步到位切 bank 状态重建是对的终态，但现在切会让 ai-memory 接入前的闸门 A 工作量变大
- **方案 C 的正确性**：止血逻辑先修住缺陷，同时把"切换 bank 重建"写成显式 TODO 锚点。关键：止血件不需要完美，因为注定被 L2 根治替换——降低本轮验收风险，又没放弃终态

ai-memory 的闸门 A 要求的是"导出语义正确"，C 的止血版已经满足（已删除记忆不再出现在 MEMORY.md）；根治版随 L2 做。

### 卡片 2/4：Track B 验证 - **选"立即启动"（推荐正确）**

连续三轮空白，**没有资格再延期**。配置预算参数保守合理。

**补充**：验证会话结束后**记得把 `enabled` 改回 `false`**——这是临时验证，不是默认开启。

### 卡片 3/4：孤儿 Bank - **改选"init --revoke 联动归档"**

**推翻原推荐"doctor 检测+提示"**，改选选项 2，理由：
- "doctor 检测+提示"只完成"看得见"，没完成"能处理"——用户看到提示后依然要手动 `rm -rf`，正是上轮批评的"手动清理不可持续"
- **选项 2 把处理动作收进已有工具面**：`xpi_memo_init` 已有工具，加 `revoke` 参数让 agent/用户都能"撤销身份并归档 bank"，闭环完整
- 归档（`banks-archived/<bank>-<timestamp>/`）而非删除，符合"不自动删历史数据"铁律

**实现要点**：revoke 只归档，不删除；doctor 检测项可随后补（不在本轮）。

### 卡片 4/4：ai-memory 接入 - **选"关闭两闸门后开工"（推荐正确）**

闸门 A（导出层）+ 闸门 B（Track B）→ 分支决定分工/接管 → 写接入规格。

"边修边接"风险：已删除记忆同步进跨 harness wiki，从本地瑕疵升级为跨工具泄漏。

---

## 三、执行顺序（架构师建议微调）

```
1. Track B 验证（最先做，一次会话有答案，决定 ai-memory 规格）
2. MEMORY.md 用 C 方案止血（工作量最小）
3. 孤儿 Bank revoke（和 MEMORY.md 可并行）
4. forget 恢复设计（低成本，顺手补上）
5. MEMORY.md 根治 和 孤儿 Bank doctor 检测 都排进 L2，不挤占本轮
```

---

## 四、从上游学到的两件事（立即可做）

### 1. pi-memory 的 forget 恢复设计

- **现状**：xpi-memo 的 forget 删完就没了，audit 只记动作不记内容
- **pi-memory 做法**：forget 前把完整条目复制到 `recovery/<id>.json`，返回 recovery ID，`memory_restore` 可恢复
- **成本**：极低，和现有 audit 纪律兼容
- **收益**：补上 forget 链路最后缺口，删除可恢复后"已删条目滞留 MEMORY.md"的焦虑等级降低

### 2. pi-memory 的 KV-cache 稳定快照策略

- **做法**：显式状态机（session_start / compact / long_term_write / day-rollover 四个刷新点），daily/scratchpad 写入故意不刷新
- **未来价值**：在本地模型（llama.cpp/vLLM）上跑时，直接决定 token 成本
- **本轮**：做设计笔记，不实现

---

## 五、困局本质（架构师分析）

```
pi-memory:  Markdown 真相源 + 无治理 + 无自动捕获 + 无投影
mnemosyne:  SQLite 真相源  + 无治理 + 无自动捕获 + 无投影
xpi-memo:   SQLite 真相源  + 治理(候选/证据) + 自动捕获(Track B) + Markdown 投影 + 多 bank
            └── 每一个困局都精确对应多出来的那一列
```

| 困局 | 根源组件 | 上游为什么没有 |
|---|---|---|
| 零记忆稳态 | 候选治理双闸门 | 它们没有治理 |
| 意图提取漏捕获 | 自动捕获（Track A/B） | 它们没有自动捕获 |
| MEMORY.md 恒空/不回溯 | Markdown 投影层 | pi-memory 的 Markdown 是本体不是投影；mnemosyne 没有人读层 |
| 孤儿 bank | 多 bank + git-hash 身份层 | mnemosyne 单库；pi-memory 单目录 |
| forget 投影失真 | "SQLite 真相 + L0 投影"双轨 | 它们都是单一真相源 |

**架构师结论**：mnemosyne 和 pi-memory 没有解决你的困局——它们通过停在"单真相源 + 无治理 + 无自动捕获"的安全区里，从未走进困局。你的困局是你比它们多要的每一样东西（治理、证据链、人读投影、多 bank、自动捕获）的**入场费**。这不是后退的理由，而是提醒：你多要的每一样东西，都必须自己把对应的子系统做到位，因为上游没有现成答案可抄——除了两个例外：pi-memory 的 forget 恢复设计和 KV-cache 快照状态机，这两个直接拿走。

---

## 六、用户观点整合

用户说"现在还没到引入其他memory工具的时候，是否可以把一些困局做备注文档存底，等未来再解决"——这个判断是对的，但需要区分：

### 哪些是必须立即付的入场费（无法延后）

1. **Track B 验证** - 决定未来 ai-memory 的角色（分工 vs 接管），不验证就无法编写接入规格
2. **MEMORY.md 止血** - 已删条目滞留是信任杀手，人读层是信任界面，必须修
3. **孤儿 bank 生命周期** - 不是 ai-memory 前置，是本项目多 bank 设计的固有代价

### 哪些可以文档存底（延后到 L2/ai-memory）

1. **MEMORY.md 根治（bank 重建）** - 标注 TODO，和 L2 "SQLite 可重建/Markdown 真相源"打包
2. **注入相关性验证** - 连续两轮未测，但不阻塞当前功能
3. **supersededBy 确定性去重** - 随 mechanical sleep 一起做

### 哪些是低成本立即可做（从上游学习）

1. **forget 恢复设计** - 极低成本，立即补上
2. **KV-cache 快照状态机设计笔记** - 为未来本地模型成本优化做准备

---

## 七、实施计划

| 优先级 | 任务 | 工作量 | 产出 |
|---|---|---|---|
| **P0-1** | Track B 真实验证 | 1-2天 | audit.json extraction 记录、候选提案质量评估、ai-memory 角色决策 |
| **P0-2** | MEMORY.md 止血（方案 C） | 1-2天 | 新增 `memory_deleted` L0 事件类型、collectMemoryEntries 剔除逻辑、TODO 标注 L2 根治 |
| **P0-3** | 孤儿 bank revoke 工具 | 1天 | `xpi_memo_init --revoke` 参数、归档到 `banks-archived/`、工具链闭环 |
| **P0-4** | forget 恢复设计 | 0.5天 | `recovery/<id>.json` 写入、返回 recovery ID、memory_restore 工具（或标注 TODO） |
| **P1** | doctor orphan_bank 检测 | 0.5天 | 配合 revoke 工具，显示孤儿 bank 列表 |
| **文档** | MEMORY.md 根治 TODO 标注 | - | 代码注释 + 本文档引用 |
| **文档** | 注入相关性验证存底 | - | 本文档记录 + 延后理由 |
| **文档** | KV-cache 快照设计笔记 | 0.5天 | 参考 pi-memory 设计，记录未来优化方向 |

**总工作量**：约 3.5-4.5 天（P0 项）

---

## 八、验收标准

### Track B 验证
- [ ] 配置文件启用 offline extraction（临时）
- [ ] 运行 5-10 个包含自然表达的真实会话
- [ ] audit.json 中有 extraction 记录（completed/failed/timed-out）
- [ ] 候选提案质量评估（提取率、准确率、漏捕获分析）
- [ ] 决策：Track B 活→ai-memory 分工模式，Track B 死→ai-memory 接管模式
- [ ] 验证后 `enabled` 改回 `false`

### MEMORY.md 止血（方案 C）
- [ ] `src/l0/types.ts` 新增 `memory_deleted` 事件类型
- [ ] `src/markdown-export/memory-generator.ts` 实现两遍扫描剔除逻辑
- [ ] `src/index.ts` forget 工具追加 L0 删除事件
- [ ] 测试：forget 后 MEMORY.md 不再显示已删条目
- [ ] TODO 注释标注 L2 根治方向（引用本文档 + feedback-0904-3-conclusion.md）
- [ ] 测试通过：589 passed / 6 skipped，新增测试覆盖删除剔除逻辑

### 孤儿 bank revoke 工具
- [ ] `src/index.ts` `xpi_memo_init` 新增 `revoke` 参数
- [ ] 实现：删除 project.json + 归档 bank 到 `banks-archived/<bank>-<timestamp>/`
- [ ] 返回归档路径
- [ ] 测试：init → revoke → 验证 project.json 删除、bank 归档、可恢复

### forget 恢复设计
- [ ] forget 前写入 `recovery/<id>.json`（完整条目内容）
- [ ] forget 返回 recovery ID
- [ ] 文档说明恢复路径（或实现 `memory_restore` 工具，可选）
- [ ] 测试：forget → 验证 recovery 文件存在、内容完整

### doctor orphan_bank 检测（P1）
- [ ] `src/repo-export.ts` 实现 `detectOrphanBanks()`
- [ ] `src/status.ts` 集成显示孤儿 bank 列表（bank、大小、最后活跃时间）
- [ ] 提示 revoke 命令

---

## 九、文档存底项（TODO 标注位置）

### MEMORY.md 根治（bank 重建）

**代码位置**：`src/markdown-export/memory-generator.ts` `collectMemoryEntries()` 函数

**TODO 注释**：
```typescript
/**
 * Collect confirmed T1 writes. Exact duplicates stay in the export and are
 * marked `supersededBy` later; SQLite is never rewritten.
 * 
 * TODO(L2): MEMORY.md 数据源切换为 bank 重建
 * 当前从 L0 事件流重建，删除事件通过 memory_deleted 剔除（止血）。
 * L2 阶段应从 bank 当前状态投影，语义对齐：
 * - MEMORY.md = "现在记住什么"（状态投影）
 * - L0 = "怎么变成这样的"（历史溯源）
 * 参考：
 * - docs/feedback/26-09-04/feedback-0904-3-conclusion.md §二
 * - docs/feedback/26-09-04/feedback-0904-3-advisors.md §1/4
 * - docs/feedback/26-09-04/implementation-decision.md §六
 * 
 * 根治方案：collectMemoryEntriesFromBanks() 从 bank SQLite 读取当前状态，
 * forget/supersede/mechanical sleep 的结果自动反映，无需维护投影逻辑。
 */
export function collectMemoryEntries(sources: MemorySource[]): MemoryEntry[] {
  // 止血逻辑：memory_deleted 事件剔除
  // ...
}
```

### 注入相关性验证

**存底位置**：本文档

**问题描述**：连续两轮报告未测注入相关性（"注入发生了"和"注入得对"是两回事）。双查询已通过，但相关性未验证：查询语言和记忆语言是否匹配、召回是否准确。

**延后理由**：不阻塞当前功能。recall 工具的基础召回已验证（query → bank → 返回结果），相关性优化属于召回质量改进，不是功能缺失。

**验证方法（L2 做）**：
1. 准备测试集：10 条不同 kind 的记忆（中英文混合）
2. 设计 10 个查询（5 个精确匹配、5 个语义相关）
3. 人工评估召回结果：准确率、召回率、语言匹配度
4. 如果相关性差，考虑：查询改写、embedding 模型调优、混合检索策略

### supersededBy 确定性去重

**存底位置**：本文档

**问题描述**：当前 exact duplicate 标记为 `supersededBy`，但去重逻辑在 MEMORY.md 导出层，SQLite 中仍保留。mechanical sleep 应该实现确定性去重：保留最新、删除旧版。

**延后理由**：随 mechanical sleep 一起做。mechanical sleep 本身尚未实现（sleep 工具已有但是 fail-closed，需要授权才能执行）。

**实现方向（L2 做）**：
1. mechanical sleep 触发时（用户授权 + 满足条件）
2. 扫描所有 bank 的 exact duplicate pairs
3. 按 timestamp 保留最新，调用 mnemosyne delete 删除旧版
4. L0 记录 `memory_consolidated` 事件（supersededBy 关系）
5. MEMORY.md 从 bank 重建后自动反映去重结果

---

## 十、一句话总结

**你的困局不是"还没到引入ai-memory的时候"能回避的——它们是你比上游多要的治理+证据链+投影的入场费。本轮只做四件必要的事（Track B验证、MEMORY.md止血C方案、孤儿bank revoke、forget恢复），其他标TODO延后到L2。这不是向困局妥协，而是明确哪些是现在必须付的入场费，哪些可以等场地更大了再装修。**

---

## 附录：参考文档

- `docs/feedback/26-09-04/feedback-0904-3.md` - 第二轮实测报告
- `docs/feedback/26-09-04/feedback-0904-3-conclusion.md` - 评审建议（两个闸门）
- `docs/feedback/26-09-04/feedback-0904-3-advisors.md` - 架构师裁决（四张卡片）
- `docs/l0-contract.md` - L0 append-only 语义
- `docs/phase-1-implementation-guide.md` - Phase 1 实施指南
