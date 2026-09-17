# Task 51 Report — 清理临时目录

- 关联任务:`openspec/changes/retire-stale-root-docs/tasks.md` §4(4.1–4.2)
- 涉及文件:`docs/.trash/`(移除)
- 日期:2026-09-18

## 目的

清掉 `docs/.trash/` 这个既没入库、也没被忽略、还和正本重复的临时目录,让 `git status` 只剩本 change 的预期改动。

## 作用

1. 删除前逐项核验(任务 4.1):
   - `git log --all -- docs/.trash` 为空 → 该目录从未进入任何提交,删除不动 git 历史。
   - 四份文档的正本已在 `docs/archive/2026-09/{retired,contracts}/` 就位,逐文件 `-f` 存在性检查通过。
   - 目录内实际 5 个文件:四份是正本的冗余副本,第五个 `OPEN-GAPS-notes.md`(13.8K)是该目录独有的对话转录。
2. 移除方式是移动到系统回收站 `~/.Trash/xpi-memo-docs-trash-20260918-075327/`,而不是 `rm -rf`。
3. 复核工作区(任务 4.2):只剩 4 个 rename、4 个内容修改与 1 个未跟踪的 change 目录,无遗留未跟踪目录。

## 特点

- 未跟踪文件一旦 `rm` 就无法从 git 恢复,因此改用移入系统回收站——保留"可回滚"这一条项目纪律。
- 冗余副本与独有转录在删除前被显式区分并记录,不靠"看着像重复"直接清掉。

## 边界

- 只清 `docs/.trash/` 本身;不动 `docs/archive/` 下已入库的 46 个文件。
- 不在 `.gitignore` 里为 `docs/.trash/` 补规则:它本该不复存在,补规则等于承认它是长期目录。
