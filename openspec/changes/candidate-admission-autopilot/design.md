## Context

xpi-memo 当前状态:82 条离线提取产生的候选 100% 积压在待审队列,全局记忆库仅 5 条。根因是证据类型断层——离线提取产出 `l0-conclusion` 证据,而 `auto-store-policy.ts` 仅接受 `explicit-user-statement` 自动存储。

现有治理边界保留:
- 候选生命周期(`candidate-lifecycle.ts`)已有三态机制(Store/Later/Reject)
- `auto-store-policy.ts` 已实现 kind 级自动存储判据(preference/workflow 自动存,decision 待审)
- `offline-extraction.ts` 已产生归一化的 `l0-conclusion` 候选

约束:
- 不绕过内容策略、scope 路由、provenance 验证
- 不改变 `explicit-user-statement` 的既有自动存储路径
- 工具验证失败必须回退到待审队列,不丢失候选

动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**
- 为 `project_gene` 和 `project_constraint` 建立工具验证自动存储路径,将待审队列从 82 降至约 30
- 为 `l0-conclusion` 证据类型提供升级接口,经验证后升为 `verified-repository-fact`
- 按 kind 路由候选处理——gene/constraint 走工具验证,preference 走累积证据(未来),decision 保持人工确认
- 保持审计完整性——工具验证通过的自动存储同样记录 L0 事件和 audit.json

**Non-Goals:**
- 本轮不实现 `global_preference` 的累积证据路径(预留接口,spec 已定义,但任务列表不包含实现)
- 不修改 `explicit-user-statement` 的治理逻辑
- 不自动迁移存量 82 条候选(下次离线提取时新候选走新路径)
- 不实现通用的证据类型转换机制(仅支持 `l0-conclusion` → `verified-repository-fact` 单向升级)

## Decisions

### Decision 1: 工具验证模块独立封装

**选择**: 新建 `src/tool-verification.ts`,封装文件读取/grep/类型检查等验证逻辑,按 kind 注册验证器函数。

**理由**:
- 候选生命周期(`candidate-lifecycle.ts`)职责单一,不应混入验证细节
- 未来新增可验证 kind(如 `project_constraint`)时,只需注册新验证器,不修改核心流程
- 测试隔离——验证逻辑可独立单测,不依赖完整候选生命周期

**备选方案**:
- 方案 B: 在 `candidate-lifecycle.ts` 内联验证逻辑 → 职责混杂,未来扩展需修改核心流程
- 方案 C: 每个 kind 单独一个文件(`tool-verification-gene.ts`) → 过度拆分,3 个 kind 共享读文件/grep 逻辑,重复代码

### Decision 2: 证据类型升级在候选生命周期内完成

**选择**: `candidate-lifecycle.ts` 的 confirm 流程调用 `tool-verification.ts`,验证通过后调用证据升级接口,再存储。

**理由**:
- 证据类型升级是治理决策,不是离线提取的职责
- `offline-extraction.ts` 保持归一化输出 `l0-conclusion`,不预判哪些会被验证通过
- 升级后的 `verified-repository-fact` 立即满足 `auto-store-policy.ts` 的自动存储条件,流程顺畅

**备选方案**:
- 方案 B: 在 `offline-extraction.ts` 内直接调用工具验证 → 离线提取职责膨胀,且阻塞会话关闭
- 方案 C: 证据升级单独作为一个异步任务 → 增加状态机复杂度,候选在"已验证待升级"中间态停留

### Decision 3: 验证失败回退到待审队列,不阻断流程

**选择**: 工具验证返回 `{ verified: boolean, evidence?: VerifiedFact }`,验证失败时候选保持 `l0-conclusion` 证据类型,进入待审队列。

**理由**:
- 工具验证是启发式的,假阳性(grep 误判)比丢失候选更可接受
- 用户可在待审队列手动确认,保留最后一道人工防线
- 验证失败事件记录到 audit.json,事后可分析验证器改进点

**备选方案**:
- 方案 B: 验证失败直接 Reject 候选 → 丢失有价值的候选,过于激进
- 方案 C: 验证失败时重试 3 次 → 文件不存在/grep 无匹配是确定性失败,重试无意义

### Decision 4: kind 级准入策略通过 Map 注册,不硬编码

**选择**: `src/kind-routing.ts` 导出 `KindAdmissionPolicy` Map,key 为 kind,value 为策略枚举(`ToolVerify | Accumulate | ManualConfirm`)。

**理由**:
- 新增可验证 kind 时,只需在 Map 添加一行,不修改 switch-case
- 测试友好——可注入 mock 策略 Map
- 配置化路径清晰——未来可从 `.pi/xpi-memo.yaml` 加载策略覆盖

**备选方案**:
- 方案 B: switch-case 硬编码 → 每次新增 kind 需修改多处,易遗漏
- 方案 C: 策略存在数据库 → 过度设计,6 个 kind 的策略不需要动态加载

### Decision 5: auto-store-policy 扩展支持 verified-repository-fact

**选择**: `auto-store-policy.ts` 的 `shouldAutoStore()` 函数增加判据:证据类型为 `verified-repository-fact` 且 kind 为 `project_gene` 或 `project_constraint` 时自动存储。

**理由**:
- 最小改动——只需在现有 `explicit-user-statement` 判据旁增加新分支
- 语义清晰——"经验证的仓库事实"与"显式用户陈述"平级,都满足自动存储条件
- 不影响现有路径——`explicit-user-statement` 的判据不变

**备选方案**:
- 方案 B: 新建 `auto-store-policy-verified.ts` → 重复现有 scope 路由逻辑,维护两套策略文件
- 方案 C: 在 `candidate-lifecycle.ts` 跳过 policy 检查,直接存储 → 绕过治理层,未来 policy 变更时易遗漏

## Risks / Trade-offs

### Risk 1: 工具验证假阳性导致错误记忆入库

**风险**: grep 匹配到注释或测试代码中的"约束",将其误判为真实 gene,自动存储错误记忆。

**缓解**:
- 验证器实现阶段增强上下文检查(排除注释行、test 目录)
- audit.json 记录验证依据(匹配行、文件路径),用户发现错误时可追溯并删除
- 首轮推出时,仅对 `project_gene` 启用自动验证,观察一段时间后再扩展到 `project_constraint`

### Risk 2: 文件读取/grep 阻塞候选确认流程

**风险**: 大仓库中 grep 耗时较长,导致候选确认流程延迟。

**缓解**:
- 工具验证设置 500ms 超时,超时视为验证失败,候选进入待审
- 优先用 ripgrep(`rg`)而非 `grep`,速度快 10 倍
- 验证失败回退机制保证流程不卡死

### Risk 3: 证据类型升级逻辑与治理层解耦不足

**风险**: 未来新增证据类型时,升级路径需要同步修改多处。

**缓解**:
- 在 `src/evidence-upgrade.ts` 集中定义允许的升级路径(白名单 Map)
- 不允许的升级路径在编译时类型报错(TypeScript literal types)
- 单测覆盖所有已知证据类型的升级/不升级场景

### Risk 4: 存量 82 条候选不自动迁移,仍需人工处理

**权衡**: 自动迁移风险大(批量误操作),选择下次离线提取时新候选走新路径。

**缓解**:
- 提供 `/xpi-memo batch-verify` 命令(任务列表不包含),用户可选择性对存量候选批量验证
- 文档明确说明存量候选仍需人工审核或等待下次提取

## Migration Plan

**部署步骤**:
1. 合并 PR 后,首次离线提取产生的新候选走新路径
2. 观察 1 周,检查 audit.json 中 `tool-verified` 事件的验证依据是否合理
3. 1 周后若无误报,在文档说明存量候选可安全忽略(已过时)

**回滚策略**:
- 配置 `XPI_MEMO_AUTO_VERIFY=false` 关闭自动验证,全部候选回退到待审队列
- 已自动存储的记忆保留(audit.json 记录可追溯),人工审查后可用 forget 删除

**兼容性**:
- 向后兼容——`explicit-user-statement` 路径不变,存量记忆不受影响
- 前向兼容——未来扩展累积证据路径时,只需增加 `Accumulate` 策略,不修改工具验证逻辑

## Open Questions

无。kind 级策略、验证器接口、证据升级路径均已在 spec 定义,实现路径清晰。
