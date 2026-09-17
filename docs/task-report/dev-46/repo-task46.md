# Task 46 Report — stabilize §5 契约、文档和质量门禁

- 关联任务:`openspec/changes/stabilize-candidate-auto-admission/tasks.md` §5(5.1–5.5)
- 涉及文件:`openspec/specs/` 四份主规范、`docs/OPEN-GAPS.md`、`README.md`、`docs/COMPATIBILITY.md`、本 report 与 dev-42~45
- 日期:2026-09-17

## 目的

让主规范、用户文档与缺口登记反映 shadow rollout 的最终契约,并通过全部质量门禁。

## 作用

1. 主规范同步(任务 5.1):kind-routing 三条、evidence-upgrade 两条、tool-verified-storage 三条、t1-governance 一条 requirement 按 delta 整段替换——统一 admission decision、shadow 默认、双开关、声明验证契约全部成为主规范要求。
2. OPEN-GAPS(任务 5.2):OG-5~OG-8 各加处理结果注记(方案取舍与落地方式),dry-run 报告链接;OG-1~OG-4 的 harden 注记保持。
3. 用户文档(任务 5.3):README 环境变量表(双开关语义)、COMPATIBILITY 配置表与 shadow rollout 段重写(含回滚命令与存量不迁移声明);不声称自动验证已降低队列。
4. task reports(任务 5.4):dev-42~46 覆盖五个 `##` 任务组。

## 特点

- 规范同步用"整段替换 MODIFIED requirement"保持与 harden 轮相同的演进方式;最终主规范以本 change delta 为准(执行顺序文档预期行为)。
- CHANGE-EXECUTION-ORDER.md 定义的"步骤 1 → 同步 → 步骤 2 → 同步"流程完整走通。

## 边界

- 不放量 `project_constraint`;preference 累积与项目级配置仍未实现(独立 change)。

## 门禁(任务 5.5)

`pnpm typecheck` / `pnpm -w run lint`(biome,167 files)/ `pnpm test`(836 passed / 8 skipped)/ `openspec validate stabilize-candidate-auto-admission --strict` → valid。
