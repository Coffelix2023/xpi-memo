# docs/ 目录地图

这是 `docs/` 的地图。判断一份文档是不是**当前口径**，看它是否在本页「当前有效」一节；其余全部是历史过程记录，统一收在 `archive/`，保留但不代表现状。

当前口径的最终依据是 `openspec/specs/`（行为契约）与 `ARCHITECTURE.md`（结构说明），不是 `docs/` 下的任何过程文档。

## 当前有效

| 条目 | 职责 | 谁引用它 |
| --- | --- | --- |
| `COMPATIBILITY.md` | 版本与兼容性边界 | `README.md` |
| `GIT-WORKFLOW.md` | git / 远端协作纪律 | `AGENTS.md` 第 6 节 |
| `GITHUB-GUARD.md` | GitHub 操作护栏 | `AGENTS.md` 第 6 节、`CONTEXT.md` |
| `l0-contract.md` | L0 事件层契约 | `ARCHITECTURE.md` |
| `UPSTREAM-FOLLOWUPS.md` | 对上游 Mnemosyne 的跟进请求（不含在 xpi-memo 交付范围） | `TROUBLESHOOTING.md` |
| `RECOVERY.md` | 恢复已删除记忆的操作步骤（原名 `GUIDE.md`） | `TROUBLESHOOTING.md` |

## 证据与交付记录（保留原位）

| 目录 | 职责 |
| --- | --- |
| `evaluation-reports/` | 按日期排列的实测与证据档案，含 2026-09-14 的两轮 Track B 记录；目录里较老的几份也是历史证据，整目录保留是为了不把它拆成两处 |
| `task-report/dev-<编号>/repo-task<编号>.md` | `AGENTS.md` 第 7 节要求的分组任务报告 |

## 归档（`archive/`）

归档判据是**「已被取代或任务已完成」**，不是「旧」。归档只移动、不删除，全部走 `git mv`，历史可追。

`archive/2026-09/` 是本轮（2026-09）的五组：

| 组 | 内容 | 性质 |
| --- | --- | --- |
| `feedback/` | 2026-09-02 / 04 / 07 三轮实测反馈、评审意见、访谈记录、实施计划长文 | 过程记录：当时的问题诊断与决策辩论，部分结论已被后续实测推翻 |
| `plans/` | `plan-note-01` ~ `plan-note-04` | 过程记录：实施计划及其评估意见 |
| `exploration/` | 早期架构探索稿、阶段交接、中间态评审 | 过程记录：结论已实现并归档为 OpenSpec change |
| `notes/` | 早期调研笔记、codegraph 讨论 | 过程记录：调研阶段产物 |
| `out-of-scope/` | `pi-创作Agent平台架构方案.md` 与其 `assets/` | **另一个产品**的设计稿，本仓库不实现它；保留是为了不删除用户资料 |

## 已归档内容之间的取代关系

阅读归档材料时，先看这条链，避免把被推翻的结论当成现状：

- `plans/plan-note-01`、`plan-note-02` 被 `plan-note-03`、`plan-note-04` 取代。
- `plan-note-02` 的「明确不做」清单里有「禁止模型提取」，这条已被 Track B 的实测推翻并落地为 `offline-extraction`（见 `evaluation-reports/` 与 `openspec/specs/memory-activation-loop/`）。
- `feedback/26-09-04` 一轮的裁决（闸门 A：导出层语义；闸门 B：Track B 真实验证）已分别落地为 `markdown-state-projection` 与 `track-b-real-validation` 两个已归档 change，因此该轮文档属于**决策依据**而非当前口径。
- `feedback/26-09-07` 的两个 P0（`forget` 不可用、导出层明文残留）已由 `memory-forget-exact-id` 与后续导出层脱敏处理，见 `RECOVERY.md` 与 `TROUBLESHOOTING.md`。
- `docs/GUIDE.md` → `docs/RECOVERY.md` 是**改名**，不是取代，内容未变。

## 历史引用为什么不改写

`archive/` 之外仍有三处文字指向本页映射表里的旧路径：

- `.pi/fast-fixes/archived/**`
- `docs/task-report/**`
- `openspec/changes/archive/**`

它们记录的是「当时的事实」，改写它们等于篡改快照。需要按旧路径找文件时，用下面的映射表。

## 旧路径 → 新路径（2026-09 结构整理）

| 旧路径 | 新路径 |
| --- | --- |
| `docs/GUIDE.md` | `docs/RECOVERY.md` |
| `docs/README-exploration.md` | `docs/archive/2026-09/exploration/README-exploration.md` |
| `docs/exploration-summary.md` | `docs/archive/2026-09/exploration/exploration-summary.md` |
| `docs/feedback/26-09-02/PLAN-conclusion.md` | `docs/archive/2026-09/feedback/26-09-02/PLAN-conclusion.md` |
| `docs/feedback/26-09-02/PLAN.md` | `docs/archive/2026-09/feedback/26-09-02/PLAN.md` |
| `docs/feedback/26-09-02/conclusion.md` | `docs/archive/2026-09/feedback/26-09-02/conclusion.md` |
| `docs/feedback/26-09-02/xpi-memo-git-analysis.md` | `docs/archive/2026-09/feedback/26-09-02/xpi-memo-git-analysis.md` |
| `docs/feedback/26-09-02/xpi-memo-test-report.md` | `docs/archive/2026-09/feedback/26-09-02/xpi-memo-test-report.md` |
| `docs/feedback/26-09-04/advisors-2.md` | `docs/archive/2026-09/feedback/26-09-04/advisors-2.md` |
| `docs/feedback/26-09-04/feedback-0904-1-conclusion.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-1-conclusion.md` |
| `docs/feedback/26-09-04/feedback-0904-1.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-1.md` |
| `docs/feedback/26-09-04/feedback-0904-2-conclusion.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-2-conclusion.md` |
| `docs/feedback/26-09-04/feedback-0904-2.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-2.md` |
| `docs/feedback/26-09-04/feedback-0904-3-advisors.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-3-advisors.md` |
| `docs/feedback/26-09-04/feedback-0904-3-conclusion.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-3-conclusion.md` |
| `docs/feedback/26-09-04/feedback-0904-3.md` | `docs/archive/2026-09/feedback/26-09-04/feedback-0904-3.md` |
| `docs/feedback/26-09-04/grilling-interview-transcript.md` | `docs/archive/2026-09/feedback/26-09-04/grilling-interview-transcript.md` |
| `docs/feedback/26-09-04/implementation-decision.md` | `docs/archive/2026-09/feedback/26-09-04/implementation-decision.md` |
| `docs/feedback/26-09-04/implementation-plan-final.md` | `docs/archive/2026-09/feedback/26-09-04/implementation-plan-final.md` |
| `docs/feedback/26-09-04/plan-update-0904-1.md` | `docs/archive/2026-09/feedback/26-09-04/plan-update-0904-1.md` |
| `docs/feedback/26-09-04/ux-recall-visibility-gap.md` | `docs/archive/2026-09/feedback/26-09-04/ux-recall-visibility-gap.md` |
| `docs/feedback/26-09-07/xpi-memo-experience-report.md` | `docs/archive/2026-09/feedback/26-09-07/xpi-memo-experience-report.md` |
| `docs/feedback/track-b-validation-annotation.md` | `docs/archive/2026-09/feedback/track-b-validation-annotation.md` |
| `docs/memoharness-wip-notes.md` | `docs/archive/2026-09/exploration/memoharness-wip-notes.md` |
| `docs/note-01.md` | `docs/archive/2026-09/exploration/note-01.md` |
| `docs/note-pi-panel.md` | `docs/archive/2026-09/exploration/note-pi-panel.md` |
| `docs/notes/DISCUSS-codegraph.md` | `docs/archive/2026-09/notes/DISCUSS-codegraph.md` |
| `docs/notes/DISCUSS-codegraphB.md` | `docs/archive/2026-09/notes/DISCUSS-codegraphB.md` |
| `docs/notes/assets/arch_overview.png` | `docs/archive/2026-09/out-of-scope/assets/arch_overview.png` |
| `docs/notes/assets/capability_chain.png` | `docs/archive/2026-09/out-of-scope/assets/capability_chain.png` |
| `docs/notes/assets/card_loop.png` | `docs/archive/2026-09/out-of-scope/assets/card_loop.png` |
| `docs/notes/assets/roadmap.png` | `docs/archive/2026-09/out-of-scope/assets/roadmap.png` |
| `docs/notes/memo-data-save-path.md` | `docs/archive/2026-09/notes/memo-data-save-path.md` |
| `docs/notes/pi-创作Agent平台架构方案.md` | `docs/archive/2026-09/out-of-scope/pi-创作Agent平台架构方案.md` |
| `docs/notes/xpi-memo-investigation-02.md` | `docs/archive/2026-09/notes/xpi-memo-investigation-02.md` |
| `docs/notes/xpi-memo-investigation.md` | `docs/archive/2026-09/notes/xpi-memo-investigation.md` |
| `docs/phase-1-implementation-guide.md` | `docs/archive/2026-09/exploration/phase-1-implementation-guide.md` |
| `docs/phase-4-handoff.md` | `docs/archive/2026-09/exploration/phase-4-handoff.md` |
| `docs/plans/plan-note-01-feedback.md` | `docs/archive/2026-09/plans/plan-note-01-feedback.md` |
| `docs/plans/plan-note-01.md` | `docs/archive/2026-09/plans/plan-note-01.md` |
| `docs/plans/plan-note-02-feedback.md` | `docs/archive/2026-09/plans/plan-note-02-feedback.md` |
| `docs/plans/plan-note-02.md` | `docs/archive/2026-09/plans/plan-note-02.md` |
| `docs/plans/plan-note-03.md` | `docs/archive/2026-09/plans/plan-note-03.md` |
| `docs/plans/plan-note-04.md` | `docs/archive/2026-09/plans/plan-note-04.md` |
| `docs/review.md` | `docs/archive/2026-09/exploration/review.md` |
| `docs/xpi-memo-architecture-exploration.md` | `docs/archive/2026-09/exploration/xpi-memo-architecture-exploration.md` |
| `docs/xpi-memo-evolution-exploration-handoff.md` | `docs/archive/2026-09/exploration/xpi-memo-evolution-exploration-handoff.md` |
