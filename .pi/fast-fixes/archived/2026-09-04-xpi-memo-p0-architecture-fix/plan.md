# xpi-memo P0 架构修复 - 计划详情

**工作流标识**: `e1560746-661e-40d1-9ac0-8288d598748a`  
**创建时间**: 2026-09-04  
**原始需求**: 将 implementation-plan-final.md 的 P0 部分转换为可执行任务

---

## 目标

实现 xpi-memo 架构修复的 P0 阶段（5 个模块，预计 5-6 天）：

1. **注入可见性（工具层）** - 解决用户体验缺陷："启动后追问'你读取了什么记忆？'agent 无法回答"
2. **MEMORY.md 止血** - 修复 forget 删除后不回溯的缺陷
3. **forget 恢复设计** - 从 pi-memory 学习，提供已删除记忆的恢复能力
4. **孤儿 bank revoke 工具** - 解决 init 后删除 .pi/xpi-memo/ 留下孤儿 bank（940KB）的问题
5. **Track B 真实验证** - 连续三轮零验证数据，本轮是最后期限，决定 ai-memory 角色

---

## 非目标

以下功能延后到 L2 阶段（不在本轮实现）：

- interview 交互面板（用户查看记忆列表的可视化界面）
- TUI Injected 标签页（完整的注入历史查看）
- MEMORY.md 根治（从 bank 当前状态重建，彻底替换 L0 投影逻辑）
- 注入相关性验证
- supersededBy 去重（随 mechanical sleep 一起做）

---

## 证据

### 问题诊断

1. **注入可见性断层**（`ux-recall-visibility-gap.md`）：
   - 状态栏显示"✦ 已注入 1 条记忆"，但用户追问时 agent 无法回答
   - 根因：注入的 `<memories>` 块只在 agent context 中，不在对话历史，且没有内省工具
   - 对比：pi-memory 的 MEMORY.md 完全可见，mnemosyne 有 list 命令

2. **MEMORY.md forget 不回溯**（`feedback-0904-3-conclusion.md`）：
   - forget 删除后，MEMORY.md 仍显示已删条目
   - 根因：MEMORY.md 从 L0 append-only 事件流重建，forget 不产生 L0 事件
   - 语义错位：L0="历史发生了什么"，MEMORY.md="现在记住什么"（应从 bank 投影）

3. **Track B 零验证数据**（`advisors-2.md`）：
   - 连续三轮报告 Track B（offline extraction）零验证数据
   - 架构师明确：下轮是最后期限
   - 验证结果决定 ai-memory 角色：Track B 活→分工模式，Track B 死→接管模式

4. **孤儿 bank 生命周期**（`feedback-0904-3-conclusion.md`）：
   - init 后删除 .pi/xpi-memo/ 留下孤儿 bank（940KB SQLite）
   - 手动清理不可持续，需生命周期机制
   - 原则：bank 是记忆数据，删除必须是人或显式授权的 agent 动作

---

## 根因/假设

### 已验证的根因

1. **注入黑盒**：`recallForContext()` 返回的 context 只通过 `before_agent_start` 注入到 agent，不记录到 L0，进程重启后无法追溯
2. **L0 事件缺失**：forget 操作没有对应的 L0 事件，导出层从 L0 重建时无法剔除已删条目
3. **数据源语义错位**：MEMORY.md 从 L0（历史）重建，而非从 bank（当前状态）投影

### 无需验证的假设

- Track B 不引入嵌入模型（等 ai-memory）- 访谈 Q1 决策
- show_injected 数据源从 L0 重建（记 ID，从 bank 反查）- 访谈 Q3 决策
- P0 做工具层，L2 做交互面板 - 访谈 Q10 决策

---

## 推荐方案

### 方案概述

**阶段 1：注入可见性（1 天）**
- L0 新增 `memory_injected` 事件类型，记录 `injectedMemoryIds`（只记 ID，轻量）
- 实现 `getMemoryById()` 基础能力（从 bank 通过 ID 反查单条记忆）
- 实现 `xpi_memo_show_injected` 工具（从 L0 读最近一次注入事件，反查内容）
- recall 支持空查询（`query` optional，空查询=列出全部，支持分页）
- 标题生成函数（提取第一句 + 截断兜底，0.1 天）

**阶段 2：MEMORY.md 止血（1 天）**
- L0 新增 `memory_deleted` 事件类型
- `collectMemoryEntries()` 两遍扫描：第一遍收集 deletedIds，第二遍剔除
- forget 工具追加 L0 删除事件
- TODO 注释标注 L2 根治方向（从 bank 重建）

**阶段 3：forget 恢复设计（0.5 天）**
- forget 删除前写入 `recovery/<id>.json`（完整条目内容）
- forget 返回 recovery ID
- 文档说明恢复路径（docs/GUIDE.md）

**阶段 4：孤儿 bank revoke 工具（1 天）**
- `xpi_memo_init` 新增 `--revoke` 参数
- 删除 project.json + 归档 bank 到 `banks-archived/<bank>-<timestamp>/`
- 测试 init → revoke → 验证归档

**阶段 5：Track B 真实验证（1-2 天）**
- 配置启用 offline extraction（临时）
- 运行 5-10 个真实会话（包含自然表达）
- 人工标注 L0（应捕获时刻 + 分类分析）
- 验收：show_injected 能列出 Track B 提取的记忆
- 产出 ai-memory 角色决策（基于漏捕获率和根因分布）

---

## 放弃方案及原因

### 方案 A：内存缓存 show_injected（已放弃）

**问题**：
- 进程重启后丢失
- RPC 模式下网关重启后失效
- 无法支持"你昨天启动时读了什么"的追溯场景

**放弃原因**：架构师明确"这不是 P1 体验问题，是 P0 审计能力"，重启可追溯是 Track B 可验证性的基础

### 方案 B：MEMORY.md 从 bank 完整重建（延后到 L2）

**优点**：
- 语义对齐：MEMORY.md="现在记住什么"，bank=权威存储
- forget/supersede/sleep 天然正确

**延后原因**：
- 需要调用 mnemosyne CLI（工作量 1 周）
- 不阻塞当前功能
- P0 用"止血"方案（L0 删除事件剔除）快速修复，L2 再根治

### 方案 C：本轮做 interview 交互面板（已放弃）

**问题**：总工期从 5-6 天变成 6-7 天，挤占 Track B 验证时间

**放弃原因**：访谈 Q10 决策 - P0 做工具层，L2 做交互

---

## 涉及范围

### 修改的文件

**核心逻辑**：
- `src/l0/types.ts` - 新增 memory_injected、memory_deleted 事件类型
- `src/index.ts` - show_injected 工具、recall 空查询、L0 事件集成
- `src/operations.ts` - getMemoryById() 函数
- `src/markdown-export/memory-generator.ts` - collectMemoryEntries 剔除逻辑

**新建文件**：
- `src/formatting.ts` - 标题生成和格式化工具函数

**文档**：
- `docs/GUIDE.md` - forget 恢复路径说明
- `docs/feedback/track-b-validation-annotation.md` - Track B 验证标注表（新建）

### 不修改的文件

- `src/markdown-export/*`（除 memory-generator.ts 外）- L2 根治时再重构
- `src/tui/*` - TUI 标签页延后到 L2
- 所有测试文件（只新增，不修改现有测试）

---

## 决策

### 架构决策（来自 grilling 访谈）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Q1: Track B 嵌入模型 | 不引入，等 ai-memory | 验证纯度、避免重复投资 |
| Q3: show_injected 数据源 | L0 重建（记 ID） | 重启可追溯、审计能力 |
| Q6: 标题生成 | 提取第一句 + 截断 | 0.1 天、效果够用 |
| Q8: L0 注入事件粒度 | 只记 ID | L0 轻量、单一真相源 |
| Q9: Track B 验收标注 | 标注 + 分类分析 | 不仅统计漏捕获率，还分析根因 |
| Q10: 工期确认 | P0 工具层 | 不挤占 Track B 时间 |

### 技术决策

1. **L0 事件只记 ID**：每次注入 2-3 条记忆，payload < 200 bytes，避免 events.jsonl 膨胀
2. **getMemoryById() 性能目标**：< 100ms（单条查询），预案：增加 LRU 缓存（不在 P0）
3. **MEMORY.md 止血 vs 根治**：止血（1 天）满足当前需求，根治（1 周）延后到 L2

---

## 风险

### 风险 1：Track B 验证发现漏捕获率 > 50%

**概率**：中等  
**影响**：高（决定 ai-memory 角色）

**缓解**：
- 预案 A：如果漏的是"自然表达"，立即启动 ai-memory 评估（接管模式）
- 预案 B：如果漏的是"闸门词不匹配"，调整 Track A 正则词表（快速修复）

### 风险 2：getMemoryById() 性能不达标

**概率**：低  
**影响**：中（影响 show_injected 响应时间）

**缓解**：
- 预案：增加内存缓存层（LRU cache），缓存最近 50 条查询结果
- 目标：< 100ms 响应时间

### 风险 3：L0 注入事件导致 events.jsonl 膨胀

**概率**：低  
**影响**：低（每次注入 payload < 200 bytes）

**缓解**：
- L0 事件只记 ID 列表，不记完整内容（已采纳）
- 估算：每次注入 2-3 条记忆，payload < 200 bytes

---

## 兼容性

### L0 事件格式

- 新增事件类型（memory_injected、memory_deleted）不影响现有事件的读取
- payload 通过 TypeScript 接口约束，保证向后兼容

### recall 工具

- query 参数改为 optional，空查询是新增功能
- 不破坏现有查询逻辑（有 query 时行为不变）

### forget 恢复

- 纯新增功能，不影响现有 forget 行为
- recovery 文件永久保留，用户手动清理

---

## 假设与默认值

### 假设

1. 用户会话中注入的记忆数量通常 ≤ 10 条（基于现有使用数据）
2. getMemoryById() 调用频率不高（只在用户追问时触发）
3. Track B 验证的 5-10 个会话足够产出可信的漏捕获率数据

### 默认值

- recall 空查询默认 limit=10（与有查询时一致）
- 标题截断长度=50 字符
- recovery 文件命名：`<memoryId>-<timestamp>.json`
- 孤儿 bank 归档路径：`banks-archived/<bank>-<timestamp>/`

---

## 验证命令

### 每个任务的验证

1. **类型检查**：`pnpm typecheck`（每个任务必过）
2. **代码质量**：`pnpm -w run lint`（每个任务必过）
3. **单元测试**：`pnpm test`（整体通过，新增测试覆盖对应功能）

### 功能验证

**阶段 1：注入可见性**
```bash
# 启动 Pi，触发 session_start
pi
# 在会话中追问
"你启动时读取了什么记忆？"
# Agent 应调用 show_injected 工具并列出内容
```

**阶段 2：MEMORY.md 止血**
```bash
# forget 一条记忆
# 检查 MEMORY.md 是否不再显示该条目
cat ~/.pi/agent/xpi-memo/markdown/MEMORY.md | grep "<已删除的内容>"
# 应无输出
```

**阶段 3：forget 恢复**
```bash
# forget 后检查 recovery 文件
ls ~/.pi/agent/xpi-memo/recovery/
# 应有 <id>-<timestamp>.json
```

**阶段 4：revoke 工具**
```bash
# init → revoke → 验证
pi /xpi-memo-init
pi /xpi-memo-init --revoke
ls .pi/xpi-memo/project.json  # 应不存在
ls ~/.pi/agent/xpi-memo/banks-archived/  # 应有归档目录
```

**阶段 5：Track B 验证**
```bash
# 查看 extraction 记录
cat ~/.pi/agent/xpi-memo/audit.json | jq '.[] | select(.category == "extraction")'
# 应有 completed/failed/timed-out 记录
```

---

## 验收标准

### 总体验收

- [ ] 所有 25 个任务的 checkbox 勾选
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm -w run lint` 通过
- [ ] `pnpm test` 通过（测试覆盖率不低于现有 589 passed）

### 场景验收

**场景 1：启动后追问"你读取了什么记忆？"**
```
用户: [Pi 启动]
状态栏: ✦ 已注入 2 条记忆

用户: 你读取了什么记忆？
Agent: [调用 show_injected]
Agent: 我在启动时注入了以下 2 条记忆：
1. 本项目使用 TypeScript strict 模式 [project_constraint]
2. API 文档位于 docs/api/ [project_decision]
```

**场景 2：列出项目记忆**
```
用户: 请列出当前本项目所有记忆
Agent: [调用 recall({})]
Agent: 当前项目共有 15 条记忆（显示前 10 条）：
1. 本项目使用 TypeScript strict 模式 [project_constraint]
...
```

**场景 3：forget 后 MEMORY.md 不再显示**
```bash
# forget → 检查 MEMORY.md → 已删条目不出现
# 手动全量导出 → 历史已删条目也不出现
```

**场景 4：forget 恢复**
```bash
# forget → 检查 recovery/ 目录 → 文件存在且内容完整
```

**场景 5：Track B 验证**
- [ ] 运行 5-10 个真实会话
- [ ] 人工标注完成（应捕获标注、漏捕获率、根因分类）
- [ ] show_injected 能列出 Track B 提取的记忆
- [ ] 产出 ai-memory 角色决策

---

## 参考文档

- `docs/feedback/26-09-04/implementation-plan-final.md` - 原始完整方案（1015 行）
- `docs/feedback/26-09-04/grilling-interview-transcript.md` - 访谈记录（10 个决策点）
- `docs/feedback/26-09-04/ux-recall-visibility-gap.md` - 用户体验缺陷分析
- `docs/feedback/26-09-04/advisors-2.md` - 架构师修正意见
- `docs/feedback/26-09-04/implementation-decision.md` - 初始实施决策
