# Task 4 Report — 状态可见性与回退诊断

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 4.1 / 4.2 / 4.3。

## 目的

前三组定好了评测怎么跑、结果怎么记、图谱怎么用。这一组解决**用户侧**的两个问题和一个**可诊断性**问题：

- 记忆动作发生时用户看到什么（4.1）；
- 什么时候才允许打断用户（4.2）；
- T2 挂掉时怎么知道它挂了、以及为什么基线不会跟着挂（4.3）。

这三件事共同的前提是：T2 是**可选增强层**，它的失败不能变成用户的失败。

## 实现

### 4.1 / 4.2 `docs/evaluation-reports/t2/action-visibility.md`

- **三档可见性**：`stream`（流光，1 s 脉冲）/ `dim`（灰度，常驻中性文案）/ `hidden`（不显示）。默认 `stream`，即**保持现状**——今天 `setFooterStatus(ctx, paused, true)` 已经会打 `✦ memo on` 脉冲（`src/footer.ts:22-35`）。
- **六类动作状态**：`captured` / `candidate-created` / `candidate-confirmed` / `candidate-rejected` / `failed` / `degraded`，每类绑定一个 `auditAction` 作为回查入口，并给出三档各自的呈现文案。
- **字段白名单**：状态 payload 只能是 `src/audit.ts` 的 `AuditMetadata` 字段集合的子集 + 三个状态字段；明令禁止 `content` / `text` / `body` / `query` / `token` 等 16 个正文类键。
- **交互边界**：全仓库的阻塞式提示调用点只有三处（`src/index.ts:681`、`src/console.ts:588`、`src/status-panel.ts:458`）。捕获路径只调 `setFooterStatus`（`src/index.ts:417`），不触碰对话框。候选确认还要过两道闸：非 TUI 直接返回 `later`，且默认 `confirmStore=false` 不弹框。

### 4.3 `docs/evaluation-reports/t2/t2-diagnostics.md`

- **回退契约三条不变量**：recall 必须返回 baseline 结果；T2 字段与基线字段分开存；每个 T2 状态对应一个有界错误码。
- **字段集**：复用 `backendState` / `searchBackend` / `queriedBanks` / `warning` / `retrieval.fallback` / `attempts[]`，新增 `t2State` / `t2Reason` / `t2Attempted` / `baselineBacked` / `embeddingContributed` / `graphDegraded`。
- **七类不可用状态**：`t2-disabled-by-config` / `t2-adapter-missing` / `t2-adapter-error` / `t2-adapter-timeout` / `t2-adapter-invalid-result` / `t2-index-stale` / `t2-graph-degraded`，与 3.2 的五条关闭条件一一对应。
- **禁止的组合**：`t2State != "ok"` 且 `baselineBacked == false` —— 即「T2 挂了，基线也没跑」的静默失败。

## 特点与边界

- **不改运行时**：两份设计文档 + 两份示例 JSON，`src/**` 零改动。
- **断言而不是承诺**：`scripts/t2-contract-check.ts` 新增 65 条断言（总计 90 条），把「状态里不含正文」「只有候选确认能弹框」「T2 失败不得让基线也挂」从文字变成会失败的检查。
- **白名单来源于现有代码**：字段白名单直接取自 `src/audit.ts` 的 `AuditMetadata`（其注释已写明 never memory bodies），不新造一套命名。
- **默认值保持现状**：`statusVisibility` 默认 `stream`，避免静默改变现有 UX；改成 `dim` 是产品决策，留给实现变更。
- **T2 只能进队列**：T2 不能自己触发 `force`，也没有除候选队列之外的打断入口。

## 验证

- `node scripts/t2-contract-check.ts` → **PASSED: 90 断言全部通过**（exit 0）
- **三个负向对照**（证明断言非空转）：
  1. 把某类 `baselineBacked` 改成 `false` → `FAILED: 1/90`，exit 1（D2 捕获静默失败）
  2. 给 T2 失败边界用例打开提示框 → `FAILED: 3/90`，exit 1（V4 捕获越界打断）
  3. 给状态 payload 加一个 `content` 字段 → `FAILED: 2/90`，exit 1（V2 捕获正文泄漏）
  - 恢复后回到 90/90。
- **「adapter 缺失时基线仍可用」已实测**：本变更没有安装任何 T2 adapter，每一次基线召回天然就是该场景；`baseline-none-run.json` / `baseline-local-run.json` 的 12 场景全部完成，`degradationProbes` 记录了两类后端不可用的有界原因（`spawnSync mnemosyne ENOENT`、`FileExistsError`）。
- `pnpm typecheck` → 通过（exit 0）
- `pnpm test` → 702 passed | 7 skipped
- `pnpm -w run lint` → 本组新增文件全部通过；仓库整体仍只有既有的 `docs/reports/token-analysis.html`
- `biome.jsonc`：把 `scripts/t2-contract-check.ts` 加入中文 `noSecrets` 豁免的既有 override（中文断言文案被误判高熵字符串）
- `openspec` 进度 → 13/16 完成

## 留给最后一组（5.x）的输入

- 5.1 必须逐场景记录 `t2State` / `baselineBacked`，否则分不清「T2 没帮忙」与「T2 挂了」。
- 5.2 的门槛条款已经具体到可判定：V4（打断边界）与 D2（失败不传播）都是会失败的断言。
- 5.3 的 rollback 章节要引用七类 reason，说明关掉 T2 后系统回到哪一档。
