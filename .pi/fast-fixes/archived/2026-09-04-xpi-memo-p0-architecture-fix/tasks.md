# xpi-memo P0 架构修复 - 任务清单

**工作流标识**: `e1560746-661e-40d1-9ac0-8288d598748a`  
**创建时间**: 2026-09-04  
**计划路径**: `.pi/fast-fixes/2026-09-04-xpi-memo-p0-architecture-fix/plan.md`  
**只读基线**: `.pi/fast-fixes/2026-09-04-xpi-memo-p0-architecture-fix/tasks.initial.md`

---

## 1. 注入可见性（工具层）

- [x] 1.1 L0 新增 memory_injected 事件类型 (验收: L0_EVENT_TYPES 包含 "memory_injected"，导出 L0MemoryInjectedPayload 接口; 验证: `pnpm typecheck`)
  - 验证: `pnpm typecheck`
  - 结果: 通过
  - 时间: 2026-09-04
- [x] 1.2 实现 getMemoryById() 基础能力 (验收: src/operations.ts 导出 getMemoryById 函数，从 bank 通过 ID 反查单条记忆; 验证: `pnpm typecheck && pnpm test src/operations.test.ts`)
  - 验证: `pnpm typecheck && pnpm test src/operations.test.ts`
  - 结果: 通过（5 tests passed）
- [x] 1.3 实现 xpi_memo_show_injected 工具 (验收: 工具注册，从 L0 读取最近一次注入事件，通过 ID 反查内容并返回; 验证: `pnpm typecheck && pnpm test`)
  - 验证: `pnpm typecheck && pnpm test`
  - 结果: 通过（61 tests / 全局 591 passed，6 skipped）
  - 时间: 2026-09-04
- [x] 1.4 recall 支持空查询（列出全部） (验收: query 参数改为 optional，空查询调用 mnemosyne list 返回所有记忆，支持 limit/offset 分页; 验证: `pnpm typecheck && pnpm test`)
  - 验证: `pnpm typecheck && pnpm test`
  - 结果: 通过（29 tests in search，592 passed 全局，6 skipped）
  - 时间: 2026-09-04
- [x] 1.5 标题生成工具函数 (验收: src/formatting.ts 导出 extractMemoryTitle 和 formatMemoryList 函数; 验证: `pnpm typecheck && pnpm test src/formatting.test.ts`)
  - 验证: `pnpm typecheck && pnpm test src/formatting.test.ts`
  - 结果: 通过（3 tests passed）
  - 时间: 2026-09-04
- [x] 1.6 recallForContext 集成 L0 注入事件 (验收: 注入成功后追加 memory_injected 事件到 L0; 验证: `pnpm typecheck && pnpm test`)
  - 验证: `pnpm typecheck && pnpm test src/activation-loop.integration.test.ts`
  - 结果: 通过（9 tests passed；active 策略下两次成功注入均记录 memory_injected，T1 写入仍为一次）
  - 时间: 2026-09-04

## 2. MEMORY.md 止血（方案 C）
- [x] 2.1 L0 新增 memory_deleted 事件类型 (验收: L0_EVENT_TYPES 包含 "memory_deleted"，导出 L0MemoryDeletedPayload 接口; 验证: `pnpm typecheck`)
  - 验证: `pnpm typecheck && pnpm test src/l0/types.test.ts`
  - 结果: 通过（typecheck 与 1 test passed；同步 markdown export 全量事件 fixture）
  - 时间: 2026-09-04
- [x] 2.2 collectMemoryEntries 剔除逻辑 (验收: 两遍扫描实现，第一遍收集 deletedIds，第二遍剔除; 验证: `pnpm typecheck && pnpm test src/markdown-export/memory-generator.test.ts`)
  - 验证: `pnpm typecheck && pnpm test src/markdown-export/memory-generator.test.ts`
  - 结果: 通过（deletedIds 两遍扫描与回归测试已存在）
  - 时间: 2026-09-05
- [x] 2.3 forget 工具集成 L0 删除事件 (验收: forget 成功后追加 memory_deleted 事件到 L0; 验证: `pnpm typecheck && pnpm test`)
  - 验证: `pnpm typecheck && pnpm test`
  - 结果: 通过（forget 成功路径追加 memory_deleted；已有 index.test.ts 回归覆盖）
  - 时间: 2026-09-05
- [x] 2.4 TODO 注释标注 L2 根治方向 (验收: collectMemoryEntries 函数头部有 TODO(L2) 注释，引用相关文档; 验证: 人工检查)
  - 验证: 人工检查 `src/markdown-export/memory-generator.ts`
  - 结果: 通过（函数头部已标注 TODO(L2)，引用 fast-fix plan.md）
  - 时间: 2026-09-05
- [ ] 2.5 存量已删条目处理 (验收: 手动运行全量导出，确认历史已删条目不再出现; 验证: 手动验证 MEMORY.md)

## 3. forget 恢复设计

- [x] 3.1 forget 前写入 recovery 文件 (验收: forget 删除前将完整内容写入 recovery/<id>.json，返回 recoveryId; 验证: `pnpm typecheck && pnpm test`) (依赖: 2.3)
  - 验证: `pnpm typecheck && pnpm -w run lint && pnpm test`
  - 结果: 通过（598 passed，6 skipped）
  - 时间: 2026-09-05
- [x] 3.2 文档说明恢复路径 (验收: docs/GUIDE.md 新增"恢复已删除的记忆"章节; 验证: 人工检查)
  - 验证: 人工检查 `docs/GUIDE.md`
  - 结果: 通过
  - 时间: 2026-09-05

## 4. 孤儿 bank revoke 工具

- [x] 4.1 xpi_memo_init --revoke 参数 (验收: 新增 revoke 参数，删除 project.json，归档 bank 到 banks-archived/<bank>-<timestamp>/; 验证: `pnpm typecheck && pnpm test`)
  - 验证: `pnpm typecheck && pnpm test src/index.test.ts src/local-identity.test.ts`
  - 结果: 通过（工具与 slash command 均覆盖，70 tests passed）
  - 时间: 2026-09-05
- [x] 4.2 revoke 功能测试 (验收: init → revoke → 验证 project.json 删除、bank 归档、可通过归档路径恢复; 验证: 手动测试)
  - 验证: 隔离非 Git 目录中实际调用 `xpi_memo_init({})` → 创建 bank 与记忆 → `xpi_memo_init({ revoke: true })`
  - 结果: 通过（project.json 删除；bank 移至 `banks-archived/project-...-timestamp/`；归档 SQLite 可由 mnemosyne recall 查询）
  - 时间: 2026-09-05

## 5. Track B 真实验证

- [x] 5.1 配置启用 offline extraction (验收: ~/.pi/config.yml 中 xpi-memo.offlineExtraction.enabled 改为 true; 验证: 人工检查配置)
  - 验证: `~/.config/xpi-memo/config.json` 的实际配置键 `offlineExtractionEnabled` 临时设为 true
  - 结果: 通过（当前扩展不读取 ~/.pi/config.yml；验证结束后已恢复 false）
  - 时间: 2026-09-05
- [x] 5.2 运行 5-10 个真实会话 (验收: 包含自然表达的真实会话，audit.json 有 extraction 记录; 验证: `cat ~/.pi/agent/xpi-memo/audit.json | jq '.[] | select(.category == "extraction")'`)
  - 验证: 5 个独立 Pi 会话；`audit.json` 有 5 条 `session_shutdown` extraction 记录
  - 结果: 通过（5 条均为 `unavailable`，详细聚合见 docs/feedback/track-b-validation-annotation.md）
  - 时间: 2026-09-05
- [x] 5.3 人工标注 L0（分类分析） (验收: 完成 docs/feedback/track-b-validation-annotation.md，包含应捕获标注、漏捕获率、根因分类; 验证: 人工检查标注文档) (依赖: 5.2)
  - 验证: 人工检查 `docs/feedback/track-b-validation-annotation.md`
  - 结果: 通过（5 个自然表达类别；无 proposal，漏捕获率不可计算；根因归类 infrastructure-unavailable）
  - 时间: 2026-09-05
- [ ] 5.4 验收 show_injected 集成 (验收: Track B 提取的记忆能通过 show_injected 查看; 验证: 在会话中追问"你启动时读取了什么记忆？") (依赖: 1.3, 5.2)
  - 状态: blocked（生产入口未注入 `offlineExtractionRunner`，5 次均为 unavailable，未生成可注入的 Track B 记忆；不可伪造验收）
- [x] 5.5 产出 ai-memory 角色决策 (验收: 基于漏捕获率和根因分布，在标注文档中明确 ai-memory 角色（分工 vs 接管）; 验证: 人工检查决策章节) (依赖: 5.3)
  - 验证: 人工检查 `docs/feedback/track-b-validation-annotation.md` 的 ai-memory 角色决策
  - 结果: 通过（决策为接管 offline extraction 执行；runner 接入后以至少 10 个真实会话复验）
  - 时间: 2026-09-05
- [x] 5.6 关闭 offline extraction (验收: ~/.pi/config.yml 中 enabled 改回 false; 验证: 人工检查配置) (依赖: 5.5)
  - 验证: `~/.config/xpi-memo/config.json` 的 `offlineExtractionEnabled` 已恢复 false
  - 结果: 通过
  - 时间: 2026-09-05
