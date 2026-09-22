# Proposal: add-typesafe-decision-hooks

## Why

三处已实测/已定性的病需要"窄判断 + 校准置信度"才能治:①第一轮实测 recall 被常驻噪声记忆挤占 top5,粗排之后缺一道精排;②"重复 N 次算不算稳定偏好"是规则判不了的语义死结;③记忆 `confidence` 目前是模型拍脑袋的数字而非校准值。用 LLM 做这类封闭判断又贵、又慢、又过自信;TypeSafe 的 System One 模型 Jev(`docs/references/jev/`)正是此类判断的专用模型——但接入必须默认关、可拔插、失败即回退,方符合本仓库 fail-closed 性格。

## What Changes

- 新增 provider-neutral 决策 runner 边界:`XPI_MEMO_DECISION_RUNNER` 类配置默认 **off**;API key 仅经环境变量;出站内容先过 `prepareExternalContent` 脱敏,无法确认安全拒绝外发;入站回答回筛(注入/可持久化判定)后按 untrusted 处理;调用有界可中止;任何失败 MUST fail-open 到既有行为(不是 fail-closed 阻塞会话)。
- recall 门控式精排(rerank):仅当粗排头部分差 ≤ 阈值(结果"接近难分")才调用 runner;精排只重排、不增删、预算不变;开关关闭或调用失败时,recall 输出与现状逐字节一致。
- 重复 prompt 稳定性判定:L0 确定性计数同义重复(默认 N≥3,不调模型)→ 达阈值才问 Noul"这是稳定偏好吗"→ 概率 ≥ 阈值生成**待审候选**(绝不自动入库),低于阈值丢弃并留有界计数;runner 不可用则不生成候选。
- 置信度校准标注:候选 `confidence` 可来自校准输出并标明来源(区别于模型推导/用户陈述);既有 `admission-preferences` 的"最低置信度"偏好直接消费该值——准入政策、`shouldAutoStore`、evidence-upgrade 白名单**零改动**。
- Modified `memory-activation-loop`:新增两条需求(可选门控精排的有界 fail-open 契约;重复信号产生候选的治理契约),既有需求不改。

## Capabilities

### New Capabilities

- `typesafe-decision-hooks`: provider-neutral 决策 runner 边界(配置门控、密钥与出站安全、入站回筛、有界可中止、fail-open 诊断、可观测计数)与置信度校准标注契约。

### Modified Capabilities

- `memory-activation-loop`: 以 ADDED requirements 方式新增 ①recall 可选门控精排 ②重复 prompt 经稳定性判定后生成待审候选;既有需求内容不变。

## Impact

- 代码:新增 `src/decision/` 模块(runner 装配、三类问题封装、门控逻辑);`src/search/` 精排位;`src/l0/context-derivation` 重复计数;`config.ts` 新增配置项(默认关);`memory-safety.ts`/`content-policy.ts` 复用;observability/doctor 计数。
- 网络与密钥:新增唯一出网点(默认关闭),`TYPESAFE_API_KEY` 类环境变量,不落代码/日志/文档。
- 政策:不修改 `shouldAutoStore`、`autoConfirm`、evidence-upgrade 白名单、kind 枚举;不触碰 `sleep`/心跳边界。
- 依赖:TypeSafe 官方 SDK(或裸 HTTP)一个,版本锁 devDependencies 之外按既有 peer 约定处理;`docs/references/jev/` 已留存评估用文档快照。
- 供应商风险:Jev 处于 early access,停服/排队不构成功能故障——关闭开关即回到现状。
