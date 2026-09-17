# Change 执行顺序:harden → stabilize

> 结论:**必须先执行 `harden-local-identity-and-align-admission-spec`,再执行 `stabilize-candidate-auto-admission`,严格串行,不可乱序、不可并行。**
>
> 依据:两个 change 都 MODIFIED 了 `candidate-auto-admission/kind-routing` 的同 3 个 requirement,且目标状态互斥;`harden` 的 proposal 已声明 OG-5~OG-8 由 `stabilize` 处理(隐式依赖顺序)。

## 一、执行顺序总览

```
步骤 1  harden-local-identity-and-align-admission-spec
          │  (身份 trust 门控 + 主规范收口到已实现现状)
          ▼
     [同步主规范: 2 份 delta → openspec/specs/]
     [更新 OPEN-GAPS.md: OG-1 ~ OG-4]
          │
          ▼
步骤 2  stabilize-candidate-auto-admission
          │  (统一准入决定 + shadow 默认 + 双开关 rollout)
          ▼
     [同步主规范: 4 份 delta → openspec/specs/]
     [更新 OPEN-GAPS.md: OG-5 ~ OG-8]
```

最终主规范状态:以 `stabilize` 的 4 份 delta 为准(shadow 模式语义)。

## 二、冲突面清单(为什么必须这个顺序)

两个 change 对同一 capability(`candidate-auto-admission/kind-routing`)的 3 个 requirement 均为 MODIFIED:

| # | Requirement | harden 目标状态 | stabilize 目标状态 | 冲突性质 |
|---|---|---|---|---|
| 1 | kind 级准入策略 | gene/constraint 验证通过后**自动存储**(对齐现状) | gene 仅 `XPI_MEMO_AUTO_ADMIT=true` 才存储;constraint **仅 shadow,永不自动存储** | **硬冲突**,目标状态互斥 |
| 2 | 策略路由可配置 | 单开关 `XPI_MEMO_AUTO_VERIFY` | 双开关:`XPI_MEMO_AUTO_VERIFY` kill switch + `XPI_MEMO_AUTO_ADMIT` opt-in | **硬冲突**,配置面不同 |
| 3 | 策略路由失败回退 | `tool-verification-failed` + 有界 reason;移除 `accumulation-timeout` | 同左,reason 分支更多 | 语义兼容,但后同步者整段覆盖先同步者 |

无冲突面(各自独占,不构成顺序约束):

- `harden` 独占:`runtime-boundary-hardening`(trust 门控、身份自证校验)
- `stabilize` 独占:`evidence-upgrade`、`tool-verified-storage`、`t1-governance`
- 代码分工:`harden` 不碰 `shouldAutoStore`/`autoConfirm`/`verifyProjectGene`/`upgradeEvidence`;`stabilize` 负责删除 `shouldAutoStore` 死分支
- 文档分工:`harden` 改 OPEN-GAPS 的 OG-1~OG-4;`stabilize` 改 OG-5~OG-8,互补

## 三、乱序风险(为什么不能颠倒)

若 `stabilize` 先执行并同步主规范,`harden` 再同步会把 gene/constraint 改回"验证通过自动存储":

- 主规范与 `stabilize` 已交付的 shadow 行为**直接矛盾**(规范倒退);
- `XPI_MEMO_AUTO_ADMIT` 开关契约被 harden 的单开关 delta 覆盖丢失。

## 四、逐项执行清单

### 步骤 1:harden-local-identity-and-align-admission-spec

1. 实现 tasks.md 第 1 组(本地身份 trust 门控与自证校验)
2. 实现 tasks.md 第 2 组(`ctx.isProjectTrusted()` 接线到运行时)
3. 同步 2 份 delta 到主规范(对应 tasks 3.1):
   - `specs/runtime-boundary-hardening/spec.md`
   - `specs/candidate-auto-admission/kind-routing/spec.md`
4. 更新 `docs/OPEN-GAPS.md`:OG-1~OG-4 状态(对应 tasks 3.2)
5. 确认 OG-5~OG-8 仍标记为 `stabilize` 的未解决范围(tasks 3.3)
6. 质量门禁:`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`、`openspec validate harden-local-identity-and-align-admission-spec --strict` 全部退出 0

### 步骤 1 完成后的检查点(进入步骤 2 前必须确认)

- [ ] 主规范 `kind-routing` 已不再承诺:`auto_verify_kinds` 项目覆盖、preference 累积自动存储、`accumulation-timeout` 事件
- [ ] 主规范 `runtime-boundary-hardening` 已包含 trust 门控要求
- [ ] 主规范与当前代码行为一致(gene/constraint 验证通过自动存储 = 现状)

### 步骤 2:stabilize-candidate-auto-admission

1. 实现前先重读 harden 同步后的主规范,确认 delta 措辞仍自洽(已预检:"accumulate 为保留策略""项目级覆盖不属于契约"等表述与 harden 一致)
2. 实现 tasks.md 第 1 组(repositoryFact 验证声明与测试基线)
3. 实现 tasks.md 第 2 组(统一 admission decision,删除 `shouldAutoStore` 死分支)
4. 实现 tasks.md 第 3 组(验证器改造 + `XPI_MEMO_AUTO_ADMIT` rollout 开关)
5. 实现 tasks.md 第 4 组(有界审计元数据 + 端到端集成测试)
6. 同步 4 份 delta 到主规范(对应 tasks 5.1):
   - `specs/t1-governance/spec.md`
   - `specs/candidate-auto-admission/evidence-upgrade/spec.md`
   - `specs/candidate-auto-admission/tool-verified-storage/spec.md`
   - `specs/candidate-auto-admission/kind-routing/spec.md`(覆盖 harden 版本,这是预期行为)
7. 更新 `docs/OPEN-GAPS.md`:OG-5~OG-8 归入本 change(对应 tasks 5.2)
8. 更新 README/GUIDE/COMPATIBILITY 环境变量与 rollout 说明(tasks 5.3)
9. 质量门禁:`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`、`openspec validate stabilize-candidate-auto-admission --strict` 全部退出 0

## 五、执行纪律

- 每完成一个 change 立即同步其主规范,**不要两个 change 都堆到最后一起同步**。
- 两个 change 都在 `src/index.ts` 邻近区域接线(`harden`: createRuntime/statusForContext;`stabilize`: 候选入口),禁止并行开发。
- 每个 change 的提交粒度按其 tasks.md 的 `##` 任务组切分,保持可回滚。
- 完成每个 `##` 任务组后,按 AGENTS.md 规范写 `docs/task-report/dev-<编号>/repo-task<编号>.md`(`stabilize` 的 tasks 5.4 已内置此要求)。
