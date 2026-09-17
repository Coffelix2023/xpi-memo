# Task 39 Report — harden §2 运行时 trust 接线

- 关联任务:`openspec/changes/harden-local-identity-and-align-admission-spec/tasks.md` §2(2.1–2.3)
- 涉及文件:`src/index.ts`、`src/index.test.ts`
- 日期:2026-09-17

## 目的

让 trust 结论在运行时边界统一提供,覆盖所有本地身份解析调用点,避免某条调用链绕过门控。

## 作用

1. `XpiMemoDependencies` 新增 `isProjectTrusted?: () => boolean` 测试注入点。
2. `trustFor(ctx, dependencies)` helper:注入优先 → 生产走 `ctx.isProjectTrusted()` → 保守默认 `false`(mock ctx 缺方法时不 crash)。
3. `createRuntime` 第 3 参、`statusForContext` 第 3 参显式接收 trust 结论;13 处 createRuntime 调用点、2 处 statusForContext、3 处直接 `resolveLocalProjectIdentity`(init/export/revoke)全部接线。
4. Git 身份优先逻辑不动:`gitProject ? null : resolveLocalProjectIdentity(cwd, trusted)`——Git 路由不依赖 trust。
5. 未信任本地项目的 project memory 走既有 `routing_rejected`(`project-identity-required`)+ audit rejection `identity: "none"` 语义,零新增审计格式;不写伪造 `id`/`root`/`label`。

## 特点

- 设计备选"每个调用点单独跳过解析"被否决(易遗漏新增入口),采用边界集中传结论。
- 测试:新增未信任拒绝测试(断言 details `routing_rejected` + audit `identity: "none"`);4 处既有测试更新 trust 注入(受信任路由、幂等 init、两个 revoke)。index.test 78/78 通过。

## 边界

- 不改变公开工具输入 schema;不新增 audit action 或存储字段。
- revoke 在未信任项目返回 not found(不通过伪造元数据触发删 bank)。
