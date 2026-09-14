## Context

见 `proposal.md - Why`。本变更的形状由三个既有约束决定：

1. `AGENTS.md` 第 6 节与第 7 节把 `docs/GIT-WORKFLOW.md`、`docs/GITHUB-GUARD.md`、`docs/task-report/dev-<编号>/` 写成固定路径，`ARCHITECTURE.md`、`README.md`、`CONTEXT.md` 也各自固定引用一个 `docs/` 文件——这些路径不能动。
2. 用户明确要求"归档到独立目录，先不删除"，所以本变更的动作用 `git mv`，验收包含"零删除"。
3. `docs/` 下 68 个文件全部已被 git 跟踪（提交 `74ac81e`），因此全部移动都走 `git mv`，历史可追。

## Goals / Non-Goals

**Goals:**

- 让"当前口径"与"历史过程"在路径上可区分：`docs/` 根只留仍然生效的契约与目录，历史材料集中到 `archive/<年-月>/`。
- 保留全部文件的 git 历史，不删除任何内容。
- 提供一个索引，说明每组归档材料的性质、取代关系，以及旧路径到新路径的映射。
- 消除 `docs/GUIDE.md` 与根 `GUIDE.md` 的重名。

**Non-Goals:**

- 不改写任何历史文档的正文（包括其中指向旧路径的引用）。
- 不合并、不重写文档内容；这是结构整理，不是文档重写。
- 不把文件移出本仓库，不删除文件。
- 不触碰 `openspec/`、`src/`、根级 Markdown 的内容（除了 `TROUBLESHOOTING.md` 的一处链接）。
- 不顺带修正 `ARCHITECTURE.md` 中"350+ tests"之类的文案漂移——那属于另一个变更。

## Decisions

### D1: 归档轴用「按月 + 分类目」

目标结构为 `docs/archive/<YYYY-MM>/<category>/`，本轮的 category 为 `feedback/`、`plans/`、`exploration/`、`notes/`、`out-of-scope/`。

- **替代方案：纯分类（`archive/feedback/`、`archive/plans/` …）**。否决。反馈与计划是逐轮产生的，纯分类目录会随轮次无限增长，且无法从路径回答"这批属于哪一轮"。
- **替代方案：全部平铺进一个目录**。否决。46 个文件平铺后仍无法区分来源。

### D2: "该归档"的判据是「被取代或已完成」，不是「旧」

因此以下内容**必须留在原位**，并在验收中逐项确认：

| 留在原位 | 理由 |
| --- | --- |
| `COMPATIBILITY.md`、`GIT-WORKFLOW.md`、`GITHUB-GUARD.md`、`l0-contract.md` | 被根文档引用，且仍是当前口径 |
| `UPSTREAM-FOLLOWUPS.md` | 活跃的上游跟进记录 |
| `task-report/dev-1..8/` | `AGENTS.md` 第 7 节强制路径 |
| `evaluation-reports/`（整目录，含 2026-09-14 两轮） | 它是按日期排列的证据档案；09-14 两轮是下一步决策的基线，不是过时材料 |

- **替代方案：逐个文件判定是否过时**。否决。需要为 68 个文件分别作判断，判断本身还会再次过时；按"目录职责"判定更稳定。
- **替代方案：把 `evaluation-reports/` 里较老的四份也归档**。否决。会把这个目录拆成两半，反而需要读者记两处路径。

### D3: 移动一律 `git mv`，不复制、不删除

- **替代方案：`cp` 后删除原文件**。否决。丢历史，且一旦出错不可逆。
- **替代方案：只加索引、不改路径**。否决。`docs/` 根目录仍然与权威契约混杂，主问题没有解决。

### D4: 只修「活文档」的引用，历史记录靠映射表兜底

`TROUBLESHOOTING.md` 面向当下，必须把 `docs/GUIDE.md` 改为 `docs/RECOVERY.md`。`.pi/fast-fixes/archived/**`、`docs/task-report/**`、`openspec/changes/archive/**` 中指向旧路径的文字一律保持原样。

- **替代方案：全仓批量替换旧路径**。否决。那会把历史记录改写成"当时就是这样"，等于篡改快照；而且长文里出现同名字符串的地方会误伤。

### D5: `docs/GUIDE.md` 更名为 `docs/RECOVERY.md`，不与 `TROUBLESHOOTING.md` 合并

两份文档职责不同：前者是操作步骤（怎么恢复），后者是症状索引（哪里出错）。重名是问题，内容重叠不是。

- **替代方案：合并成一份**。否决。会把"怎么做"和"哪里出错"混在一起，且需要重写内容，超出结构整理的边界。
- **替代方案：保持原名，只在根 `GUIDE.md` 加提示**。否决。路径本身仍然误导按名字查找的读者。

### D6: 跨产品文档留在本仓，整体移入 `archive/2026-09/out-of-scope/`

该文档与它引用的 `assets/` 一同移动，保证 `![...](assets/...)` 相对链接继续有效。

- **替代方案：移出仓库到用户级笔记目录**。不采用，但保留为后续可选项——它是不可逆的外部动作，而用户要求"先不删除"。
- **替代方案：删除**。用户已明确排除。

### D7: 索引落在 `docs/README.md`

进入 `docs/` 第一眼即见地图，符合 README 的通用预期。索引必须包含四部分：当前有效条目及其职责、`archive/` 分组及每组性质、已归档条目的取代关系、旧路径到新路径的映射表。

- **替代方案：`docs/archive/README.md`**。否决。读者进入 `docs/` 时仍然不知道有什么。

## Risks / Trade-offs

- **46 个文件同时 rename，`git log --follow` 需要额外参数** → 在提交信息中列出完整映射表，索引里同样保留。
- **归档后仍有人按旧路径找文件** → 映射表放在 `docs/README.md` 顶层；路径映射与 git history 双保险。
- **误把仍在使用的文档归档** → D2 明确列出"必须留在原位"的五类，验收逐项检查。
- **移动后质量闸门波动** → 移动完成后重跑 `pnpm typecheck` / `pnpm -w run lint` / `pnpm test`；`docs/` 不参与运行时，预期不影响结果。
- **对本变更的价值质疑（"只是挪文件"）** → 真正的产出是路径语义与索引：读者能在 5 秒内判断一份文档是当前口径还是历史过程，而今天做不到。

## Migration Plan

1. 建立 `docs/archive/2026-09/{feedback,plans,exploration,notes,out-of-scope}/`。
2. 按组 `git mv`：`docs/feedback/**` → `archive/2026-09/feedback/`；`docs/plans/**` → `archive/2026-09/plans/`；10 个散落探索文档 → `archive/2026-09/exploration/`；`docs/notes/` 的 5 份笔记 → `archive/2026-09/notes/`；跨产品文档与其 `assets/` → `archive/2026-09/out-of-scope/`。
3. `git mv docs/GUIDE.md docs/RECOVERY.md`，并更新 `TROUBLESHOOTING.md` 的引用。
4. 写入 `docs/README.md`（职责、分组、取代关系、路径映射）。
5. 删除空的 `docs/archived/` 目录。
6. 验收：活跃引用逐一确认可解析；`git log --diff-filter=D` 确认本次提交零删除；三条质量闸门全绿。
7. 回滚：`git revert` 本变更的单个提交即可整体复原——全部是 rename，加上 `TROUBLESHOOTING.md` 的一行与新增的 `docs/README.md`。

## Open Questions

无。
