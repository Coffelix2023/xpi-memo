## Why

xpi-memo 候选准入瓶颈:82 条离线提取产生的候选 100% 卡在待审队列,而全局记忆库只有 5 条。根因是证据类型断层——离线提取产生的 `l0-conclusion` 证据无法通过自动存储策略(仅接受 `explicit-user-statement`),导致有价值的项目事实和全局工作流积压,记忆系统名存实亡。

## What Changes

- 为 `l0-conclusion` 证据类型开通受控的自动入库路径,针对 `project_gene` 和部分 `global_preference` 候选,在工具验证后直接存储
- `auto-store-policy.ts` 扩展判据,区分可验证事实(gene/constraint)、可累积证据(preference)、必须人工确认(decision)
- `offline-extraction.ts` 保留 `l0-conclusion` 归一化,但支持后续治理层升级证据类型(经工具验证升为 `verified-repository-fact`)
- 候选生命周期新增"自动验证并存储"路径,与现有"用户确认"路径并存

不改变:
- 现有 `explicit-user-statement` 的自动存储路径不变
- `project_decision` 仍需用户确认
- 候选生命周期的三态机制(Store/Later/Reject)不变

## Capabilities

### New Capabilities

- `candidate-auto-admission/tool-verified-storage`: 为可工具验证的候选(如 `project_gene`)提供自动存储路径,通过读文件/跑 grep 等工具确认事实后直接入库,无需待审队列
- `candidate-auto-admission/evidence-upgrade`: 支持候选证据类型升级——`l0-conclusion` 经验证后可升为 `verified-repository-fact`,满足自动存储前提
- `candidate-auto-admission/kind-routing`: 按记忆 kind 路由——gene/constraint 走工具验证,preference 走累积证据,decision 保持人工确认

### Modified Capabilities

- `memory-activation-loop`: 修改离线提取产出的处理路径——不再 100% 进入待审,而是按 kind 分流:可验证的自动验证并存储,不可验证的保持待审
- `t1-governance`: 扩展候选生命周期,新增"自动验证并存储"终止态,与现有"用户确认存储"并列,保持治理边界

## Impact

**直接影响**:
- `src/auto-store-policy.ts`:新增 kind 级判据,支持 `verified-repository-fact` 证据类型的 gene/constraint 自动存储
- `src/offline-extraction.ts`:保留 `l0-conclusion` 归一化,但暴露升级接口给治理层
- `src/candidate-lifecycle.ts`:confirm 流程新增"验证后存储"分支,调用工具验证模块
- 新增 `src/tool-verification.ts`:封装文件读取/grep/类型检查等验证逻辑,返回 `verified-repository-fact` 或验证失败

**副作用**:
- 待审队列长度从 82 降至约 30(砍掉 23 条 gene + 部分 preference)
- 全局记忆库从 5 条增至约 20-30 条(补齐缺失的工作流和项目事实)
- 离线提取价值立即可见,不再积压
- 用户交互从"逐个审 82 条"降为"审约 30 条决策类候选"

**兼容性**:
- 向后兼容:现有 `explicit-user-statement` 路径不变,存量记忆不受影响
- 存量候选不自动迁移,下次离线提取时新候选走新路径
