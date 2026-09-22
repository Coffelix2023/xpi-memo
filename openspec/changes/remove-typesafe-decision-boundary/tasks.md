## 1. 删除决策模块

- [x] 1.1 删除 `src/decision/` 整目录（`types.ts`、`runner.ts`、`http-runner.ts`、`rerank.ts`、`repeat-stability.ts`、`calibration.ts`、`observability.ts` 及全部测试）。验证：`ls src/decision` 报不存在，且 `grep -rn "decision/" src --include=*.ts` 无命中。
- [x] 1.2 收缩 `src/config.ts`：移除七个键的接口字段、默认值、`UserConfig` 可选字段、`DECISION_VALIDATORS` 表项、`invalidConfigKeys` 中的引用与 `loadConfig` 的环境变量映射；顺带删除因此失去消费方的校验器。验证：`grep -n -i "decision" src/config.ts` 无命中（仅剩无关的 `admissionAllowProjectDecision`），`pnpm test src/config.test.ts` 通过。

## 2. 收缩消费方接线

- [x] 2.1 收缩 `src/index.ts`：移除 decision 相关 import、`decisionRunnerFor`、`decisionLedgerFor`、`maybeProposeStabilityCandidate`、`recentUserPrompts` 与三个稳定性窗口常量、精排调用点、校准调用点，以及 status/doctor 报告装配中的 decision 字段（顺带删除因失去消费方而不再使用的 `type XpiMemoConfig` import）。验证：`grep -n "decision/\|DecisionLedger\|DecisionRunner\|decisionRunnerFor\|decisionLedgerFor\|maybeProposeStabilityCandidate\|gatedRerankRecall\|decisionRunnerEnabled\|decisionRerank\|decisionRepeat\|decisionCalibration\|decisionStabilityThreshold" src/index.ts` 无命中（裸词 `decision` 仍出现在无关的 `CandidateDecision` / `decideRecall`，故按标识符校验而非单词），`pnpm typecheck` 通过。
- [x] 2.2 收缩 `src/memory-activation.ts`：移除校准调用与 ledger 参数/字段，证据记录改回直接 `createEvidenceRecord`。验证：`grep -n "calibrat\|ledger\|Decision" src/memory-activation.ts` 无命中（残留的 `project-decision` 是无关的 kind 别名），`pnpm test src/memory-activation.test.ts src/activation-loop.integration.test.ts` 通过。

## 3. 移除排序诊断

- [x] 3.1 从 `src/recall-ranking.ts` 移除 `headGapOf`、`headGap` 字段与仅服务于门控的注释。验证：`grep -rn "headGap" src` 无命中，`pnpm test src/recall-ranking.test.ts` 通过。
- [x] 3.2 确认 `RankedRecallOutput` 的其余消费方在字段删除后仍编译。验证：`pnpm typecheck` 通过。

## 4. 收缩表面层

- [x] 4.1 从 `src/settings-groups.ts` 移除 `decision` 设置组，组数由 8 降为 7。验证：`grep -n "decisionRunner\|decisionRerank\|decisionRepeat\|decisionCalibration\|decisionStability" src/settings-groups.ts` 无命中（`admissionAllowProjectDecision` 属无关的准入字段）。
- [x] 4.2 从 `src/glimpse/short-codes.ts` 移除 `decisionRunnerEnabled` 至 `decisionStabilityThreshold` 七个字段条目，同时移除 `GROUP_SHORT.decision`（B8）与 `SETTINGS_PANEL_SHORT.decision`（P8），并注明 `P3-1-S40`–`P3-1-S46`、`B8`、`P8` 为永久保留号段、禁止复用；`short-codes.test.ts` 的 `EXPECTED_CODE_COUNT` 由 104 降为 95。验证：`pnpm test src/glimpse/short-codes.test.ts` 通过，映射仍为 total 且 unique。
- [x] 4.3 从 `src/console.ts`、`src/panel-text.ts` 移除 Decision 组的字段规格、组名与七类词条（choice/detail/field/note，双语）。验证：`grep -n "decisionRunner\|decisionRerank\|decisionRepeat\|decisionCalibration\|decisionStability\|XPI_MEMO_DECISION" src/console.ts src/panel-text.ts` 无命中，`pnpm test src/console.test.ts` 通过。
- [x] 4.4 从 `src/status.ts` 与 `src/doctor.ts` 移除 decision 字段、计数块与默认值，并删除 `doctor.test.ts` 中断言该计数的用例。验证：`pnpm test src/status.test.ts src/doctor.test.ts` 通过，渲染结果不含 decision 计数。
- [x] 4.5 清理引用被删开关的断言：`short-codes.test.ts`（95 码 / 39 字段 / 7 组）、`views.test.ts`（39 行 / 7 组）、`window.test.ts`（39 行），以及 `console.test.ts` 的字段清单与光标算术（默认 13 行、全折叠 7 行、Display 为第 6 个组头）；`window.test.ts` 的 `settingsRowsFixture` 断言与字段数同步。验证：`pnpm test` 通过（1258 passed）。

## 5. 文档与评估档案

- [x] 5.1 移除该边界的文档：`README.md`（功能要点 + 两个配置条目）、`README.zh-CN.md`（同上，另加设置页标签条清单里的「决策接入」）、`GUIDE.md`（配置表 9 行 + 整个 `Decision connection (optional)` 章节）。验证：`grep -rn "TYPESAFE_API\|decisionRunnerEnabled\|Decision connection\|决策出口\|decision-connection-optional" README.md README.zh-CN.md GUIDE.md ARCHITECTURE.md TROUBLESHOOTING.md docs/*.md` 无命中；`ARCHITECTURE.md` / `TROUBLESHOOTING.md` / `docs/COMPATIBILITY.md` / `docs/README.md` 经核对本就没有该边界内容（其中的 `decision` 命中都是无关的 `project_decision` kind 与 `routing_decision` 审计动作）。
- [x] 5.2 新建 `docs/references/jev/README.md` 作为移除说明：快照性质、四个移除理由（无可用端点 / 精排治不了落榜 / 已有量级更大的零外发杠杆 / 无实测收益）、`TYPESAFE_*` 不再被读取、以及重新引入需要什么。验证：该文件存在且含 `remove-typesafe-decision-boundary`（命中 2 处）；三份快照本身保持逐字未改。
- [x] 5.3 核对 `docs/README.md` 的「当前有效」表与两份 `.pi/prototype-design/*/semantic-ui-map.yaml`。验证：`grep -rn -i "decision-runner\|decisionRerank\|decisionCalibration" docs .pi/prototype-design` 无命中；该表只收录 `docs/` 顶层的五份文件，不含 `references/`，因此新增的 jev README 不需要登记。

## 6. 门禁与收口

- [x] 6.1 三条门禁全绿：`pnpm typecheck` 通过；`pnpm -w run lint` 退出码 0（仅 2 条 info，为 HEAD 既有的 `useMaxParams` 提示）；`pnpm test` = 119 passed / 4 skipped，1259 tests passed。验证：三条命令退出码均为 0。
- [x] 6.2 在 `src/config.test.ts` 新增用例 `treats leftover decision-boundary keys as inert unknown keys`：临时配置写入全部七个决策键，断言 `loadConfig` 不抛错、`ignoredKeys` 为空、结果对象不含任何该键，且其余配置等于 `DEFAULT_XPI_MEMO_CONFIG`。验证：该用例通过（测试总数 1258 → 1259）。
- [ ] 6.3 核对删除未触碰治理规则：变更文件集合与 `src/auto-store-policy.ts`、`src/evidence.ts`、`src/kinds.ts` 无交集。验证：`git diff --name-only` 与上述三个路径求交集为空。
- [ ] 6.4 以单一提交收口，提交信息写明移除理由与回滚方式（`git revert`）。验证：`git show --stat HEAD` 仅包含本变更涉及的文件。
