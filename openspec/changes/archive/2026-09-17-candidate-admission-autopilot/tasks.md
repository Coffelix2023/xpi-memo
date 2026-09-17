## 1. 基础设施与类型定义

- [x] 1.1 在 `src/types.ts` 新增 `VerificationResult` 类型和 `KindAdmissionPolicy` 枚举,验证 `pnpm typecheck` 通过
- [x] 1.2 在 `src/types.ts` 新增 `verified-repository-fact` 证据类型到 `EvidenceType` 联合类型,验证现有类型守卫编译通过
- [x] 1.3 创建 `src/evidence-upgrade.ts`,定义证据升级白名单 Map(`l0-conclusion` → `verified-repository-fact`),验证单测覆盖不允许的升级路径抛错

## 2. Kind 级准入策略路由

- [x] 2.1 创建 `src/kind-routing.ts`,导出 `KindAdmissionPolicy` Map(gene/constraint → ToolVerify, decision → ManualConfirm, preference → Accumulate),验证单测覆盖 6 个 kind 的策略查询
- [x] 2.2 在 `src/kind-routing.ts` 实现 `getAdmissionPolicy(kind)` 函数,验证返回正确策略枚举
- [x] 2.3 在 `src/kind-routing.ts` 实现配置覆盖逻辑(读取 `XPI_MEMO_AUTO_VERIFY` 环境变量),验证 `false` 时全部 kind 返回 `ManualConfirm`

## 3. 工具验证模块

- [x] 3.1 创建 `src/tool-verification.ts`,定义 `VerifierFn` 类型签名(`(candidate) => Promise<VerificationResult>`),验证类型定义编译通过
- [x] 3.2 在 `src/tool-verification.ts` 实现 `verifyProjectGene()` 函数(读取相关文件、ripgrep 匹配候选内容、500ms 超时),验证单测覆盖验证通过/失败/超时三场景
- [x] 3.3 在 `src/tool-verification.ts` 实现验证器注册 Map(`project_gene` → `verifyProjectGene`),验证单测覆盖未注册 kind 返回验证失败
- [x] 3.4 在 `src/tool-verification.ts` 实现 `verifyCandidateIfNeeded()` 函数(查策略路由,调用对应验证器),验证单测覆盖 ToolVerify/ManualConfirm 两条路径

## 4. 证据类型升级接口

- [x] 4.1 在 `src/evidence-upgrade.ts` 实现 `upgradeEvidence(candidate, verificationResult)` 函数,验证单测覆盖升级成功返回新证据类型,失败保持原证据类型
- [x] 4.2 在 `src/evidence-upgrade.ts` 保留原始 provenance/source/timestamp,验证单测确认元数据不变
- [x] 4.3 在 `src/evidence-upgrade.ts` 增加类型守卫防止 `explicit-user-statement` 降级,验证单测覆盖降级尝试抛错

## 5. 候选生命周期集成

- [x] 5.1 在 `src/candidate-lifecycle.ts` 的 `confirmCandidate()` 函数增加工具验证分支(验证通过后调用证据升级,再存储),验证单测覆盖自动存储路径
- [x] 5.2 在 `src/candidate-lifecycle.ts` 实现验证失败回退逻辑(保持 `l0-conclusion`,进入待审队列),验证单测确认候选未丢失
- [x] 5.3 在 `src/candidate-lifecycle.ts` 增加 L0 事件记录(`candidate_auto_verified` 和 `candidate_confirmed`),验证单测确认事件已写入
- [x] 5.4 在 `src/candidate-lifecycle.ts` 调用 `verifyCandidateIfNeeded()`,根据 kind 策略决定是否验证,验证单测覆盖 gene/decision 两条路径

## 6. Auto-store policy 扩展

- [x] 6.1 在 `src/auto-store-policy.ts` 的 `shouldAutoStore()` 增加 `verified-repository-fact` 判据(gene/constraint 自动存),验证单测覆盖新分支返回 true
- [x] 6.2 确认 `explicit-user-statement` 判据不变,验证单测覆盖现有路径仍通过
- [x] 6.3 验证 `project_decision` 的 `verified-repository-fact` 不自动存(返回 false),单测覆盖此边界

## 7. 审计与 L0 事件记录

- [x] 7.1 在 `src/audit.ts` 新增 `tool-verified` 事件类型,包含验证依据字段(filePath/matchedLine/timestamp),验证单测覆盖字段序列化
- [x] 7.2 在 `src/audit.ts` 新增 `tool-verification-failed` 事件类型,包含失败原因字段,验证单测覆盖失败场景记录
- [x] 7.3 在 `src/candidate-lifecycle.ts` 工具验证成功后写 `tool-verified` 审计条目,验证单测确认 audit.json 包含验证依据
- [x] 7.4 在 `src/candidate-lifecycle.ts` 工具验证失败后写 `tool-verification-failed` 审计条目,验证单测确认 audit.json 包含失败原因

## 8. Offline extraction 集成

- [x] 8.1 在 `src/offline-extraction.ts` 确认产出的候选保持 `l0-conclusion` 证据类型(不预判验证结果),验证单测覆盖产出候选的证据类型为 `l0-conclusion`
- [x] 8.2 确认 `offline-extraction.ts` 不直接调用工具验证(治理层职责),验证代码审查无验证逻辑混入

## 9. 集成测试与端到端验证

- [x] 9.1 创建集成测试:离线提取产生 `project_gene` 候选 → 工具验证通过 → 自动存储到 project bank,验证 mnemosyne 包含该记忆且 audit.json 记录 `tool-verified`
- [x] 9.2 创建集成测试:离线提取产生 `project_gene` 候选 → 工具验证失败 → 进入待审队列,验证候选在 `candidates.json` 且 audit.json 记录 `tool-verification-failed`
- [x] 9.3 创建集成测试:离线提取产生 `project_decision` 候选 → 跳过工具验证 → 进入待审队列,验证候选在 `candidates.json` 且无 `tool-verified` 事件
- [x] 9.4 创建集成测试:配置 `XPI_MEMO_AUTO_VERIFY=false` → 所有候选进入待审,验证无自动存储发生

## 10. 文档与配置

- [x] 10.1 更新 `README.md` 或 `docs/` 说明新增的 `XPI_MEMO_AUTO_VERIFY` 环境变量,验证文档包含用法示例
- [x] 10.2 在 `docs/` 或 `CHANGELOG.md` 说明存量 82 条候选不自动迁移,需人工审核或等待下次提取,验证文档明确告知用户
- [x] 10.3 更新 `src/types.ts` 或独立文档说明 `verified-repository-fact` 证据类型的语义与升级路径,验证开发者可查阅到升级白名单

## 11. 最终验证

- [x] 11.1 运行 `pnpm typecheck`,验证无类型错误
- [x] 11.2 运行 `pnpm -w run lint`,验证无 lint 错误
- [x] 11.3 运行 `pnpm test`,验证所有单测与集成测试通过
- [x] 11.4 手动触发一次离线提取(或使用测试 fixture),验证新候选走新路径且待审队列数量下降
