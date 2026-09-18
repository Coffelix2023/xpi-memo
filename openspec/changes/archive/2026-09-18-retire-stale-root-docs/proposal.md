## Why

`docs/` 根层混着两类不同寿命的文件：仍在生效的契约，和使命已经结束的一次性过程产物。读者从路径上分不出来，`src/l0-boundary.test.ts` 甚至把其中一份当成运行时依赖去读。同时 `docs/OPEN-GAPS.md` 的逐条注记与末尾汇总表已经互相矛盾——8 条 OG 全部写了「2026-09-17 处理结果」，汇总表却仍把 OG-5~OG-8 记作未解决，末尾导语也只宣布 OG-1~OG-4 已处理。现在两份实施 change（`harden-local-identity-and-align-admission-spec`、`stabilize-candidate-auto-admission`）都已归档，OG-1~OG-8 的处理动作已全部落地，正是把这批文档定稿并归档的时点。

## What Changes

- 把 `docs/OPEN-GAPS.md` 的末尾汇总表与导语对齐各条的实测注记：OG-5~OG-8 按实际采纳的方案改写状态列（OG-5 已收口、OG-6 已删除死分支、OG-7 已随验证策略重构落地、OG-8 已按方案 A 改口径），导语从「OG-1~OG-4 已由 harden 处理」扩写为两个 change 的完整处理归属与余留能力边界。
- 先修矛盾再归档，避免把一份自相矛盾的文档冻进历史。
- 用 `git mv` 把三份使命已结束的根层文档移入 `docs/archive/2026-09/retired/`，全部走索引操作，零删除：
  - `docs/OPEN-GAPS.md`：OG-1~OG-8 已全部处理并注记，文件转为历史记录。
  - `docs/CHANGE-EXECUTION-ORDER.md`：harden → stabilize 的串行执行顺序计划，两个 change 都已归档，顺序约束不再有效。
  - `docs/xpi-memo-value-assessment.md`：`docs/archive/2026-09/` 那批早期评估报告的同批材料，全仓 0 处引用。
- 更新归档后遗留的引用：`docs/README.md`（从「当前有效」表移除三行、写入 `retired/` 分组与取代关系）与 `docs/CHANGE-EXECUTION-ORDER.md` 的自身残留引用。
- 更新 `src/l0-boundary.test.ts` 的契约文件读取路径：`docs/l0-contract.md` 移入 `docs/archive/2026-09/contracts/`（**只换位置，不删不改**）。该文件是当前生效的 L0 行为契约，被 `ARCHITECTURE.md` 与 `src/l0/types.ts` 引用，8 条断言全部保留。
- 更新 `ARCHITECTURE.md` 与 `src/l0/types.ts` 中的 `docs/l0-contract.md` 路径引用。
- 清理 `docs/.trash/` 这份从未入库的临时目录（4 份文档的副本 + 1 份对话转录），连同它留在 `.gitignore` 之外的悬空状态。
- **Non-goal**：本 change 不改行为、不改 `openspec/specs/`、不碰 `.gitignore` 对 `docs/archive/`、`docs/task-report/`、`docs/evaluation-reports/` 的既存规则缺陷（那是另一个 change）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- 无。本 change 是纯文档归档与引用收尾：运行时行为、工具输入输出、准入策略、audit 事件集与 scope 语义均不变，因此 `openspec/specs/` 无 delta。`.openspec.yaml` 声明 `skip_specs: true`。

## Impact

- 文档：`docs/OPEN-GAPS.md`、`docs/CHANGE-EXECUTION-ORDER.md`、`docs/xpi-memo-value-assessment.md`、`docs/l0-contract.md`（纯移动）、`docs/README.md`。
- 代码：仅注释与测试内的路径字面量——`src/l0-boundary.test.ts` 的 `readFileSync` 目标路径、`src/l0/types.ts` 的头注释。无逻辑改动，公开工具输入不变。
- 根文档：`ARCHITECTURE.md` 的 L0 契约引用路径。
- 索引操作：四个 `git mv` 的目标目录 `docs/archive/2026-09/{retired,contracts}/` 位于 `.gitignore:26` 覆盖范围内（该规则与已入库的 46 个文件本就不一致），因此入库需 `git add -f`，与 `dev-38`~`dev-46` 报告的既有手法一致。
- 依赖：不新增依赖。测试与校验沿用 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test`、`openspec validate --strict`。
- 反悔成本：全部为 `git mv`，`git revert` 单个提交即可完整还原路径与内容。
