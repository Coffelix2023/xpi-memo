# Task 52 Report — 验收

- 关联任务:`openspec/changes/retire-stale-root-docs/tasks.md` §5(5.1–5.5)
- 涉及文件:本 change 的全部改动面
- 日期:2026-09-18

## 目的

在提交前用可复现的命令证明三件事:没有改坏代码、没有删掉任何文件、索引里没有残留的旧路径。

## 作用

1. 质量门禁(任务 5.1):
   - `pnpm typecheck` → exit 0
   - `pnpm -w run lint` → exit 0,biome 检查 167 个文件
   - `pnpm test` → exit 0,**836 passed / 8 skipped**,82 个测试文件通过、4 个跳过——与 v1.7.0 发布时完全一致,说明本次改路径没有引入回归
   - `src/l0-boundary.test.ts` 三条测试全部通过(它是本 change 唯一触碰的测试文件)
2. 变更校验(任务 5.2):`openspec validate retire-stale-root-docs --strict` → valid;`skip_specs: true` 下 specs artifact 报告为 `skipped`,不是缺失。
3. 零删除自检(任务 5.3):`git diff --cached -M --diff-filter=D --name-only` 输出为空,证明只有 rename、没有删除。暂存面的 `--summary` 也确认四个文件都被识别为 rename(三个 100%,`OPEN-GAPS.md` 92%)。
4. 按 `AGENTS.md` 第 7 节写分组报告(任务 5.4):`dev-48`~`dev-52` 五份,对应五个 `##` 任务组。
5. 提交信息记录完整映射表(任务 5.5)。

## 特点

- lint 首次失败过一次:`src/l0-boundary.test.ts` 里被我拆成多行的 `new URL(...)` 超过 biome 的单行偏好阈值。修正为单行后通过——这是格式问题,不是逻辑问题。
- 测试数与前一个已发布版本逐字相同(836/8),这是"只换位置不改行为"最直接的证据。
- 零删除自检用的是 `--diff-filter=D` 而不是人工读 diff,避免漏看。

## 边界

- 验收只覆盖本 change 触及的面(路径引用、索引文字、测试读取路径)。
- 既存缺陷不在验收范围:`.gitignore` 对 `docs/archive/`、`docs/task-report/`、`docs/evaluation-reports/` 的规则与"这三棵目录共 116 个文件已入库"之间的矛盾,由独立 change 处理。
