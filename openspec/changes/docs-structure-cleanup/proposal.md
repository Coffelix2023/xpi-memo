## Why

`docs/` 已经涨到 68 个文件、约 1.2 MB，其中大部分是**历史过程记录**（五轮实测反馈、四版计划、早期探索稿、会议式长文），却与仍然生效的契约文档混在同一层。具体危害：

- 10 个早期探索文档散落在 `docs/` 根目录，与 `l0-contract.md`、`GIT-WORKFLOW.md` 这些权威契约平级，读者无法从路径判断哪个是当前口径。
- 计划目录里 `plan-note-01` / `plan-note-02` 与 `plan-note-03` / `plan-note-04` 同级，但前者已被后者取代；`plan-note-02` 的「明确不做」清单甚至包含后来被实测推翻的「禁止模型提取」。
- `docs/GUIDE.md` 与仓库根的 `GUIDE.md` 同名但内容完全不同（前者是 Recovery Guide，后者是 User Guide），按名字找文档会拿到错的那份。
- `docs/notes/pi-创作Agent平台架构方案.md` 及其 4 张插图（合计约 626 KB，占 `docs/` 体积的 57%）描述的是**另一个产品**，本仓库不实现它。
- `docs/archived/` 是一个空目录，有人起头未完成，反而暗示这里已经在做归档。

同时，`docs/` 里确实有必须**留在原位**的东西：被根文档引用且仍然生效的契约（`l0-contract.md`、`GIT-WORKFLOW.md`、`GITHUB-GUARD.md`、`COMPATIBILITY.md`、`UPSTREAM-FOLLOWUPS.md`）、`AGENTS.md` 第 7 节强制要求的 `docs/task-report/dev-*/`，以及最新一轮证据（`docs/evaluation-reports/track-b-*-2026-09-14.md` 是下一步决策的基线，不是过时材料）。

因此需要的是**结构分离**，不是删除：让"当前口径"和"历史过程"在路径上可区分，并留下一个索引说明去向。

## What Changes

- 在 `docs/` 下建立 `archive/2026-09/`，按类别归入四组历史材料：`feedback/`、`plans/`、`exploration/`、`notes/`；另一个产品的设计稿与插图单独归入 `archive/2026-09/out-of-scope/`（文档与其 `assets/` 一同移动，保持相对链接有效）。
- 把 10 个散落在 `docs/` 根的早期探索文档移入 `archive/2026-09/exploration/`，使根目录只剩仍然生效的契约。
- `docs/GUIDE.md` 更名为 `docs/RECOVERY.md`，消除与根 `GUIDE.md` 的重名，并同步更新仍然生效的引用（`TROUBLESHOOTING.md`）。
- 新增 `docs/README.md` 作为目录地图：说明每个条目做什么、哪一组已归档及其取代关系、以及旧路径到新路径的映射。
- 所有移动使用 `git mv`，保留文件历史；**本变更不删除任何文件**。
- 移除空的 `docs/archived/` 目录。
- 明确不改写历史记录正文：`.pi/fast-fixes/archived/**` 与 `docs/task-report/**` 中指向旧路径的文字保持原样，路径映射由索引承担。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- 无。

本变更是纯文档结构整理：不改变任何运行时行为、接口、数据格式或配置，因此不产生 spec delta，改以 `.openspec.yaml` 的 `skip_specs: true` 声明。

## Impact

- 文件系统：`docs/` 下 47 个文件的路径变更（46 个移动 + 1 个改名），另有 21 个文件保持原路径，合计 68 个；0 个文件删除。
- 引用更新：`TROUBLESHOOTING.md` 中指向 `docs/GUIDE.md` 的一处链接必须改为 `docs/RECOVERY.md`。
- 不受影响的引用：`ARCHITECTURE.md`（`docs/l0-contract.md`）、`CONTEXT.md` 与 `AGENTS.md`（`docs/GIT-WORKFLOW.md`、`docs/GITHUB-GUARD.md`、`docs/task-report/`）、`README.md`（`docs/COMPATIBILITY.md`）指向的文件都保持在原位。
- 历史引用：`.pi/fast-fixes/archived/**`、`docs/task-report/dev-*/**`、`openspec/changes/archive/**` 中指向 `docs/feedback/**`、`docs/plans/**`、`docs/GUIDE.md` 的文字将不再解析到真实路径，由 `docs/README.md` 的映射表兜底，不改写原文。
- 不涉及代码、依赖、构建或测试；质量闸门只需确认仍然全绿。
