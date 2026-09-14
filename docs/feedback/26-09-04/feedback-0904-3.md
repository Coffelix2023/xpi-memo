# xpi-memo 运行实测调研报告 · 第二轮 (修复验证)

- **日期**: 2026-09-04
- **实测环境**: pi 0.85.0, xpi-memo v0.2.0 (上轮报告后已修复优化), 工作目录 `/Users/felix/c6x_local/app-prd/pi-work`
- **目的**: 验证上轮报告 3 个问题的修复情况, 复测治理链路, 获取新运行情况
- **代码质量基线**: `pnpm test` 589 passed / 6 skipped (63 files), `tsc --noEmit` 无错误, `biome check` 无问题

**TL;DR**: 上轮 3 个问题中 2 个已修复 (init 工具化 ✅, 残留 bank 目录清理 ✅), MEMORY.md 导出层有实质改进但仍存在一个新确认的缺陷: **forget 删除不回溯 Markdown, 已删条目永久滞留 MEMORY.md**。治理链路 (token 拦截 / 幂等 / sleep fail-closed) 全部复测通过。

---

## 一、上轮问题修复验证

| 上轮问题 | 修复情况 | 实测证据 |
|---|---|---|
| #1 非项目目录死路提示 (中等) | ✅ **已修复** | 新增 `xpi_memo_init` 原生工具 (agent 路径可直接调用); `RoutingRejectionError` 现在携带 `recovery` 对象, 按 agent/cli/tui 三种表面分别给出恢复指引。实测: init 返回 `"Retry xpi_memo_remember after init"`, 重试即成功 |
| #2 MEMORY.md 与库脱节 (中等) | ⚠️ **部分修复** | 导出器重写 (`exporter.ts` +106 行, `memory-generator.ts` +78 行), MEMORY.md 现在能反映新写入 (上轮是永久空白, 本轮实测 store 后即时出现对应 section)。但发现新缺陷, 见下文 |
| #3 残留嵌套 `banks/` 目录 (小) | ✅ **已清理** | `905a35a701ac` 与 `9a5af0fe2a2b` 下的嵌套 `banks/` 目录已消失 |

附加改进 (代码审查发现):
- `project.json` 写入现在使用 `mode: 0o600` + `chmodSync` (本地身份文件权限收紧)
- offline extraction 状态暴露到 status, audit 记录 extraction outcome 计数
- extraction 输入有界 + retry budget 消费 (`fix(extraction): bound input and consume retry budget`)

## 二、本轮实测结果 (10 次调用)

### 1. `xpi_memo_init` — ✅ 新工具正常

```
xpi_memo_init → Initialized non-Git project identity "pi-work" (p-8272b2d1ddac)
```
生成 `.pi/xpi-memo/project.json` (权限 600), 建立 project bank `project-p-8272b2d1ddac`。

### 2. remember — 治理路由复测全部符合规范

| 输入 | 结果 | 判定 |
|---|---|---|
| `project_decision` (init 前) | 拒绝: `project-identity-required` | 拦截正确 |
| `project_decision` (init 后) | `stored` (candidate → confirmed) | 进入项目 bank, 正确 |
| `project_constraint` 含 GitHub token | 拒绝: `token` (audit: `prohibited-content:token`) | 密钥拦截生效 |
| `project_constraint` 正常内容 | `stored` (candidate → confirmed) | 正确 |
| 重复提交相同 decision | `Memory already captured for this session` | 幂等生效 |

### 3. recall — ✅ 项目 bank 路由正常

```
查询 "pi-work 报告存档 docs 约束 决策"
→ queriedBanks: ["project-p-8272b2d1ddac", "default"]  (项目 bank 优先命中)
→ 返回 2 条项目级记忆, score 0.52-0.56, backend=mnemosyne hybrid
```
init 后 recall 自动加入新 project bank, 全局/项目双库联合检索工作正常。

### 4. forget — 工具本身 ✅, 但暴露导出层缺陷

bank 删除即时生效, audit 记录 `memory-deleted-by-user`。**但 MEMORY.md 中被删条目仍保留** (等待 3 秒复查无变化)。

**根因** (源码确认, `src/markdown-export/memory-generator.ts`):
- `collectMemoryEntries()` 只扫描 L0 的 `t1_memory_write` 事件重建 MEMORY.md
- forget 产生的 L0 事件类型不是 `t1_memory_write`, 不参与重建
- 导出是增量 position-based (export-state.json 记录每 session 已导位置), 删除的历史事件不会触发回溯

**影响**: MEMORY.md 作为"人读层"会累积已删除的记忆, 与 T1 真实状态背离, 且无 `--rebuild` 类命令修正 (force 只重置 position, 不重建 MEMORY.md 内容)。

**建议修复方向**: forget 时在 L0 记录 delete 事件并在 `collectMemoryEntries` 中按 memory id 剔除; 或 MEMORY.md 改为从 bank 重建而非 L0 append-only。

### 5. sleep — ✅ fail-closed 复测通过

`authorized: false` → `Sleep not executed: sleep-disabled-by-default`, 与上轮一致。

### 6. 自动捕获回路 — ✅ 持续正常

audit 计数 (本轮会话): recall 175 / rejection 9 / candidate 6 / confirmation 6 / sleep-authorization 3 / write 1。token 拦截、幂等、删除均在 audit 留痕。

## 三、新发现的问题

1. **forget 不回溯 MEMORY.md** (中等, 本轮确认) — 见上文根因分析。上轮报告的 #2 只修了"写入不导出"方向, "删除不导出"方向未覆盖。

2. **init 后残留治理痕迹** (轻微) — 实测结束后删除了本地身份目录 `.pi/xpi-memo/`, 但 `~/.pi/agent/xpi-memo/banks/project-p-8272b2d1ddac/` (940 KB SQLite) 会成为孤儿 bank, 无自动清理。上轮问题 #3 的手动清理不可持续, 建议提供 bank 清理命令或在 init 撤销时联动删除。

## 四、结论

v0.2.0 相比上轮有实质修复: init 工具化打通了 agent 路径的 project 记忆闭环 (init → store → recall → forget 全通), 密钥拦截扩展到 token 类型, 权限收紧, 测试/类型/lint 全绿。核心治理契约持续可靠。

遗留: MEMORY.md 的 delete 回溯缺口 (建议下轮修复优先级最高), 以及孤儿 bank 清理机制。

使用建议 (更新):
- 非 Git 项目现在可直接调 `xpi_memo_init`, 无需进 TUI;
- 避免依赖 MEMORY.md 做记忆审计 — 删除不同步, 以 `xpi_memo_recall` / audit.json 为准;
- 短命测试项目用完 init 后, 手动清理 `~/.pi/agent/xpi-memo/banks/project-p-*` 避免累积。
