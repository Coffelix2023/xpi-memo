# Task 44 Report — stabilize §3 验证器与 rollout

- 关联任务:`openspec/changes/stabilize-candidate-auto-admission/tasks.md` §3(3.1–3.3)
- 涉及文件:`src/tool-verification.ts`、`src/kind-routing.ts`、`src/types.ts`
- 日期:2026-09-17

## 目的

用结构化声明验证取代"候选最长行 rg 固定串匹配"(OG-8 的 0/32 根因),并建立 fail-closed 的双开关放量。

## 作用

1. 验证器重写(任务 3.1):删除 rg/EXCLUDED_GLOBS/最长行启发式;改为读取声明指定文件(根内路径校验)、逐字查找 excerpt、1-based 行号定位、按文件类型的注释行拒绝;revision 提供时与 `git rev-parse HEAD` 比对(超时/缺失 git 有稳定 reason code)。
2. rollout 双开关(任务 3.2):`XPI_MEMO_AUTO_VERIFY=false|0` 总 kill switch 保留;新增 `autoAdmitEnabled`——`XPI_MEMO_AUTO_ADMIT` 必须精确为 `true` 且 kill switch 未启用,否则一律 shadow。非 `true` 值与缺失值 fail-closed。
3. constraint shadow(任务 3.3):`project_constraint` 保留验证器注册(注册不启用自动存储),admit 中 auto-stored 仅限 `project_gene`;constraint 验证通过也只产生 shadow 审计。

## 特点

- 验证不再有 rg 子进程依赖;子进程 seam 保留用于 git revision 检查(可注入测试)。
- 默认 shadow 是可观察行为:`tool-verified` 审计 + `tool_verification_shadow` L0 事件(新类型),不是静默跳过。

## 边界

- 不放量 `project_constraint`;不动 `XPI_MEMO_AUTO_VERIFY` 的既有语义。
