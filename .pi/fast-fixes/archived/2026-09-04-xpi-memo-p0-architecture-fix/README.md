# xpi-memo P0 架构修复

**工作流标识**: `e1560746-661e-40d1-9ac0-8288d598748a`  
**创建时间**: 2026-09-04  
**计划状态**: `archived`  
**执行状态**: `deferred`

---

## 原始需求摘要

将 `docs/feedback/26-09-04/implementation-plan-final.md` 的 P0 部分（5 个阶段任务）转换为可执行的 fast-fix 计划文档。

原方案基于：
- 架构师 3 轮反馈分析（advisors-2.md）
- 用户体验缺陷诊断（ux-recall-visibility-gap.md）
- grilling 结构化访谈（10 个决策点全部明确）

**P0 范围**（5-6 天）：
1. 注入可见性（工具层）- 1 天
2. MEMORY.md 止血（方案 C）- 1 天
3. forget 恢复设计 - 0.5 天
4. 孤儿 bank revoke 工具 - 1 天
5. Track B 真实验证 - 1-2 天

**非目标**：
- L2 延后项（interview 面板、TUI 标签页、MEMORY.md 根治）

---

## 文档引用

- **计划详情**: `plan.md`
- **任务清单**: `tasks.md`
- **只读基线**: `tasks.initial.md`（禁止修改，用于与 tasks.md 对比检测任务遗漏）
- **原始方案**: `docs/feedback/26-09-04/implementation-plan-final.md`
- **访谈记录**: `docs/feedback/26-09-04/grilling-interview-transcript.md`

---

## 当前任务状态
- 总任务数: 21
- 已完成: 5
- 进行中: 0
- 失败: 1
- 待执行: 15
---

## 恢复说明

如果执行中断，运行：

```bash
/xpi-fast-fix execute .pi/fast-fixes/2026-09-04-xpi-memo-p0-architecture-fix
```

执行期间若发现 `tasks.md` 与 `tasks.initial.md` 的任务 id 集合不一致，说明发生了任务遗漏：
- `tasks.initial.md` 是只读基线，记录初始任务列表
- 任何步骤（含失败处理、恢复、重试）禁止修改、重命名或删除 `tasks.initial.md`
- 发现差异时立即从基线恢复缺失条目，将当前任务标记为 `failed` 并暂停

---

## 阻塞记录

- 任务 1.6 暂停：`pnpm typecheck && pnpm test` 在 `src/activation-loop.integration.test.ts` 失败；新增断言场景未触发自动注入，未产生 `memory_injected` 事件。
- 失败摘要：`expected [] to have a length of 1 but got 0`。
- 下一步：修订测试到可控的真实 recall 命中场景，再将 1.6 从 failed 转为 pending 后重试。
