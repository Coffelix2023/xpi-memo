## 1. 配置与偏好解析

- [x] 1.1 在 `config.ts` 定义 `admissionPreferences`（kinds / minConfidence / evidenceFloor / sourceScope / maxAgeDays）与归档保留期的默认值、类型、`WRITABLE_KEYS` 与 `ENV_KEYS` 条目；验证 `pnpm test src/config.test.ts` 覆盖默认值与环境变量覆盖
- [x] 1.2 在 `kind-routing.ts` 导出偏好解析，按 kill switch → 显式环境变量 → 配置文件 → kind 默认策略四级顺序解析，并让 `autoAdmitEnabled` 复用同一解析；验证 `pnpm test src/kind-routing.test.ts` 的四级优先级用例通过
- [x] 1.3 让非法偏好取值回退到该字段默认值并进入 `ignoredKeys`，不因单个非法键拒绝整份配置；验证 `pnpm test src/config.test.ts` 新增的非法值用例通过
- [x] 1.4 把 kind 默认策略改为自动准入（`KIND_ADMISSION_POLICIES` 保留为偏好缺省值来源）；验证 `pnpm test src/kind-routing.test.ts src/auto-admission.integration.test.ts` 全绿

## 2. 准入判定链

- [x] 2.1 在 `admit()` 内插入硬底线判定（内容策略、未解冲突、空内容），命中即拒绝且不进入偏好判定；验证 `pnpm test src/candidate-lifecycle.test.ts` 新增用例证明全自动偏好也无法放行
- [x] 2.2 插入纯内存的偏好判定（kind 启用、置信度、来源范围、时效窗口），早于仓库事实验证执行；验证新增用例覆盖每一项拒绝路径
- [x] 2.3 把仓库事实验证的结论从准入条件改为证据增强：验证失败、缺少声明、工具不可用都不再阻止准入；验证 `pnpm test src/candidate-lifecycle.test.ts src/auto-admission.integration.test.ts src/tool-verification.test.ts`
- [x] 2.4 让未升级的 `l0-conclusion` 也可按偏好准入（证据类型不再是必要条件），同时保留 `l0-conclusion` → `verified-repository-fact` 的白名单升级路径；验证 `pnpm test src/evidence-upgrade.test.ts`
- [x] 2.5 为自动准入的写入在 audit 与 L0 上记录可筛的 `auto` 决定标记；验证新增断言检查标记存在且不含候选正文

## 3. 归档与到期清理

- [ ] 3.1 把 `PendingCandidate.status` 从字面量扩展为 `"pending" | "archived"`，增加 `archivedAt` 与 `expiresAt`，读取时缺失字段按 `pending` 处理；验证旧格式 `candidates.json` 夹具读取用例通过
- [ ] 3.2 实现归档写入路径，并让 `list()` 只返回 `pending` 候选；验证用例证明归档候选不再出现在待审列表
- [ ] 3.3 实现恢复操作（`archived` → `pending` 并重算保留期）；验证用例覆盖保留期内恢复与恢复后重新出现在队列
- [ ] 3.4 实现到期清理，只删除 `archived` 且 `expiresAt` 已过的条目，删除前写审计；验证用例覆盖到期删除、未到期不删、待审与已准入状态不受影响
- [ ] 3.5 在扩展加载与重扫命令处惰性触发到期清理（不判定任何候选准入）；验证 `pnpm test src/index.test.ts` 用例证明加载时清理发生且不触发重扫

## 4. 重扫命令

- [ ] 4.1 注册 `/xpi-memo-rescan` 命令；验证 `pnpm test src/index.test.ts` 用例覆盖命令注册与有界输出
- [ ] 4.2 实现重扫：遍历全部 `pending` 候选、逐条复用 `admit()`、按候选自带的 `targetBank`/`targetScope` 写入；验证集成用例覆盖跨项目候选写回各自 bank
- [ ] 4.3 保证幂等：连续两次重扫第二次零新增写入；验证用例断言第二次汇总为全跳过
- [ ] 4.4 输出只含写入/归档/跳过汇总且不含候选正文，并为每条处理写含候选 ID 与有界 reason code 的审计；验证用例断言输出与审计不含正文

## 5. 面板

- [ ] 5.1 在 `SETTINGS_FIELD_SPECS` 注册准入偏好分组与 11 个字段（7 个 kind 勾选 + 4 个标量），同步 `console.test.ts` 的全覆盖断言；验证 `pnpm test src/console.test.ts` 全绿
- [ ] 5.2 让偏好行显示实际生效值，且被环境变量固定时显示变量名并禁止面板内修改；验证 `pnpm test src/console.test.ts` 新增用例
- [ ] 5.3 让新增分组默认折叠，不使默认视图超出面板 body 行数预算；验证既有面板布局用例通过

## 6. 文档与端到端验证

- [ ] 6.1 更新 `GUIDE.md` 与 `README.md`，说明新的默认全自动行为、可勾选偏好与 `/xpi-memo-rescan`；验证文档中出现该命令与默认值表述
- [ ] 6.2 端到端验证：在隔离数据目录构造多 kind、多项目、多状态的待审夹具，跑一次重扫，确认写入、归档与汇总符合 spec；验证断言落库数量与归档数量
- [ ] 6.3 跑通 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 三条门禁；验证三者全部通过
- [ ] 6.4 按 `AGENTS.md` §7 为每个已完成的 `##` 任务写 `docs/task-report/dev-<编号>/repo-task<编号>.md`；验证报告文件存在且说明了目的、作用、特点与边界
