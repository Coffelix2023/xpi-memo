# Task 40 Report — harden §3 规范和缺口登记同步

- 关联任务:`openspec/changes/harden-local-identity-and-align-admission-spec/tasks.md` §3(3.1–3.3)
- 涉及文件:`openspec/specs/candidate-auto-admission/kind-routing/spec.md`、`openspec/specs/runtime-boundary-hardening/spec.md`、`docs/OPEN-GAPS.md`
- 日期:2026-09-17

## 目的

主规范此前承诺的能力(`auto_verify_kinds` 项目覆盖、preference 累积自动存储、`accumulation-timeout`/`verification-unavailable` 事件)代码没有实现——规范与实现漂移会让下游按错误契约开发。本组把规范收口到已交付、可测试的行为。

## 作用

1. kind-routing 三条 requirement 用 delta 整段替换:gene/constraint 验证通过自动存储(现状);`accumulate` 为保留策略(交付前 MUST 进待审);项目级覆盖明确 MUST NOT 读取;失败审计统一为 `tool-verification-failed` + 有界 reason;Purpose 行同步。
2. runtime-boundary-hardening 首条 requirement 替换:增加 trust 门控、自证校验、未信任/不自证元数据按未初始化处理、Git 身份继续优先;5 个场景(含 3 个新增安全场景)。
3. OPEN-GAPS.md:OG-1~OG-4 各加处理结果注记(保留原分析可追溯),汇总表 4 行更新,引导语标注已处理;OG-5~OG-8 保持未解决,归 `stabilize-candidate-auto-admission`。

## 特点

- 同步只替换 MODIFIED requirement 正文,Purpose/其余 requirement 不动,保持 spec 历史连续。
- 范围验证:`auto-store-policy.ts`/`tool-verification.ts`/`evidence-upgrade.ts`/`kind-routing.ts` 四个准入代码文件零 diff(3.3)。
- OPEN-GAPS.md 同时含有规划阶段预先存在的 OG-5~OG-8 登记段(未提交内容),随本次一并入库并在 commit message 注明归属。

## 边界

- 规范收口不隐式承诺 OG-5~OG-8 的自动准入治理;未来实现累积/项目配置须开独立 change。
