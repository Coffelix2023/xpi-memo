# Task 49 Report — 三份文档退休(git mv)

- 关联任务:`openspec/changes/retire-stale-root-docs/tasks.md` §2(2.1–2.6)
- 涉及文件:`docs/archive/2026-09/retired/`、`docs/archive/2026-09/contracts/`
- 日期:2026-09-18

## 目的

把三份使命已结束的根层文档移出 `docs/` 可见面,让"当前口径"与"历史过程产物"从路径上就能区分;同时给仍是当前契约的 `l0-contract.md` 换一个位置,而不动它的内容。

## 作用

1. 新建两个目标目录 `docs/archive/2026-09/retired/` 与 `docs/archive/2026-09/contracts/`(任务 2.1),确认存在且为空。
2. 四个 `git mv`(任务 2.2–2.5):
   - `OPEN-GAPS.md` → `retired/`
   - `CHANGE-EXECUTION-ORDER.md` → `retired/`
   - `xpi-memo-value-assessment.md` → `retired/`
   - `l0-contract.md` → `contracts/`
3. 逐文件用 `git hash-object` 比对移动前后的 blob(任务 2.5):四个全部一致,证明移动没有夹带内容改写。`OPEN-GAPS.md` 的改名检测为 92%,因为它在本 change 第 1 组已被有意修改过;另外三个为 100%。

## 特点

- 全部走 `git mv`,记录为 rename 而非 delete + add;`git diff --cached -M --diff-filter=D` 输出为空,零删除。
- 目标目录落在 `.gitignore:26`(`docs/archive/`)的覆盖范围内,因此入库需要 `git add -f` ——与 `dev-38`~`dev-46` 报告入库时的既有手法一致。这不是本 change 引入的摩擦,是既存规则与"归档目录实际已入库 46 个文件"之间的不一致。
- 逐文件 blob 校验是本组的主要安全网:rename 检测只保证内容相似度,blob 相等才证明内容未变。

## 边界

- 只换位置,不删不改。四份文件的内容字节全部保留(唯一例外是 `OPEN-GAPS.md`,其内容改动发生在第 1 组,与本组无关)。
- 不修 `.gitignore` 对 `docs/archive/` 的规则;那处缺陷由独立 change 处理。
