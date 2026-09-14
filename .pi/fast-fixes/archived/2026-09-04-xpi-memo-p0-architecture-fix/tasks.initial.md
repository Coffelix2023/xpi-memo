# xpi-memo P0 架构修复 - 任务清单（只读基线）

> **⚠️ 只读基线，禁止修改**  
> 本文件用于与 `tasks.md` 对比检测任务遗漏。  
> 任何步骤（含失败处理、恢复、重试）不得修改、重命名或删除此文件。

**工作流标识**: `e1560746-661e-40d1-9ac0-8288d598748a`  
**创建时间**: 2026-09-04  
**计划路径**: `.pi/fast-fixes/2026-09-04-xpi-memo-p0-architecture-fix/plan.md`  
**工作副本**: `.pi/fast-fixes/2026-09-04-xpi-memo-p0-architecture-fix/tasks.md`

---

## 1. 注入可见性（工具层）

- [ ] 1.1 L0 新增 memory_injected 事件类型 (验收: L0_EVENT_TYPES 包含 "memory_injected"，导出 L0MemoryInjectedPayload 接口; 验证: `pnpm typecheck`)
- [ ] 1.2 实现 getMemoryById() 基础能力 (验收: src/operations.ts 导出 getMemoryById 函数，从 bank 通过 ID 反查单条记忆; 验证: `pnpm typecheck && pnpm test src/operations.test.ts`)
- [ ] 1.3 实现 xpi_memo_show_injected 工具 (验收: 工具注册，从 L0 读取最近一次注入事件，通过 ID 反查内容并返回; 验证: `pnpm typecheck && pnpm test`)
- [ ] 1.4 recall 支持空查询（列出全部） (验收: query 参数改为 optional，空查询调用 mnemosyne list 返回所有记忆，支持 limit/offset 分页; 验证: `pnpm typecheck && pnpm test`)
- [ ] 1.5 标题生成工具函数 (验收: src/formatting.ts 导出 extractMemoryTitle 和 formatMemoryList 函数; 验证: `pnpm typecheck && pnpm test src/formatting.test.ts`)
- [ ] 1.6 recallForContext 集成 L0 注入事件 (验收: 注入成功后追加 memory_injected 事件到 L0; 验证: `pnpm typecheck && pnpm test`)

## 2. MEMORY.md 止血（方案 C）

- [ ] 2.1 L0 新增 memory_deleted 事件类型 (验收: L0_EVENT_TYPES 包含 "memory_deleted"，导出 L0MemoryDeletedPayload 接口; 验证: `pnpm typecheck`)
- [ ] 2.2 collectMemoryEntries 剔除逻辑 (验收: 两遍扫描实现，第一遍收集 deletedIds，第二遍剔除; 验证: `pnpm typecheck && pnpm test src/markdown-export/memory-generator.test.ts`)
- [ ] 2.3 forget 工具集成 L0 删除事件 (验收: forget 成功后追加 memory_deleted 事件到 L0; 验证: `pnpm typecheck && pnpm test`)
- [ ] 2.4 TODO 注释标注 L2 根治方向 (验收: collectMemoryEntries 函数头部有 TODO(L2) 注释，引用相关文档; 验证: 人工检查)
- [ ] 2.5 存量已删条目处理 (验收: 手动运行全量导出，确认历史已删条目不再出现; 验证: 手动验证 MEMORY.md)

## 3. forget 恢复设计

- [ ] 3.1 forget 前写入 recovery 文件 (验收: forget 删除前将完整内容写入 recovery/<id>.json，返回 recoveryId; 验证: `pnpm typecheck && pnpm test`) (依赖: 2.3)
- [ ] 3.2 文档说明恢复路径 (验收: docs/GUIDE.md 新增"恢复已删除的记忆"章节; 验证: 人工检查)

## 4. 孤儿 bank revoke 工具

- [ ] 4.1 xpi_memo_init --revoke 参数 (验收: 新增 revoke 参数，删除 project.json，归档 bank 到 banks-archived/<bank>-<timestamp>/; 验证: `pnpm typecheck && pnpm test`)
- [ ] 4.2 revoke 功能测试 (验收: init → revoke → 验证 project.json 删除、bank 归档、可通过归档路径恢复; 验证: 手动测试)

## 5. Track B 真实验证

- [ ] 5.1 配置启用 offline extraction (验收: ~/.pi/config.yml 中 xpi-memo.offlineExtraction.enabled 改为 true; 验证: 人工检查配置)
- [ ] 5.2 运行 5-10 个真实会话 (验收: 包含自然表达的真实会话，audit.json 有 extraction 记录; 验证: `cat ~/.pi/agent/xpi-memo/audit.json | jq '.[] | select(.category == "extraction")'`)
- [ ] 5.3 人工标注 L0（分类分析） (验收: 完成 docs/feedback/track-b-validation-annotation.md，包含应捕获标注、漏捕获率、根因分类; 验证: 人工检查标注文档) (依赖: 5.2)
- [ ] 5.4 验收 show_injected 集成 (验收: Track B 提取的记忆能通过 show_injected 查看; 验证: 在会话中追问"你启动时读取了什么记忆？") (依赖: 1.3, 5.2)
- [ ] 5.5 产出 ai-memory 角色决策 (验收: 基于漏捕获率和根因分布，在标注文档中明确 ai-memory 角色（分工 vs 接管）; 验证: 人工检查决策章节) (依赖: 5.3)
- [ ] 5.6 关闭 offline extraction (验收: ~/.pi/config.yml 中 enabled 改回 false; 验证: 人工检查配置) (依赖: 5.5)
