## 1. 验证声明与测试基线

- [x] 1.1 为离线提取 proposal 增加受限的 `repositoryFact` 归一化规则（相对路径、非空片段、可选 revision），并用单元测试验证有效声明被保留、越界/空/超长/非 `project_gene` 声明被安全丢弃。
- [x] 1.2 用真实候选形状补充验证器测试：验证指定文件片段、路径越界、缺失文件、revision 不匹配、注释行、超时和工具不可用均返回稳定有界 reason code，且不把候选正文写入审计。
- [x] 1.3 为既有 session context 与明确 preference/workflow 直接存储路径添加回归测试，验证移除 project fact 的 `shouldAutoStore` 分支不改变它们。

## 2. 统一候选准入决定

- [x] 2.1 在 candidate lifecycle 建立单一 admission decision，按内容策略、路由、kind policy、验证、证据升级和 rollout 顺序返回 pending、shadow 或 auto-stored；验证失败不得抛出工具可见异常，并用生命周期测试验证。
- [x] 2.2 删除 `shouldAutoStore` 中不可达的 `project_gene` / `project_constraint` 分支及其 `verified` 输入；验证所有 project fact 候选只由 admission decision 决定。
- [x] 2.3 将离线提取、`xpi_memo_remember` 与 repository reimport 接到同一 admission decision；验证无仓库事实声明的后两者仍安全待审，不新增公开工具参数或直存旁路。
- [x] 2.4 限制证据升级为“通过声明的 `l0-conclusion`”；验证 `verified-tool-result` 永不被升级、永不触发升级异常，也不因此授权自动写入。

## 3. 验证器与 rollout

- [x] 3.1 以 repository-fact 声明验证 `project_gene`，停止使用候选正文最长行的全文搜索；验证成功仅返回有界定位和时间，失败保留候选。
- [x] 3.2 保留 `XPI_MEMO_AUTO_VERIFY=false|0` 总 kill switch，并增加 `XPI_MEMO_AUTO_ADMIT=true` 精确 opt-in；测试默认 shadow、显式 auto-admit、kill switch 优先和非 `true` 值的 fail-closed 行为。
- [x] 3.3 将 `project_constraint` 限制为 shadow，不允许自动写入；验证其他 kind 和保留的 `accumulate` 策略仍进入待审且不发生累积查询。

## 4. 可观察性与集成回归

- [x] 4.1 扩展 audit/L0 的有界准入元数据，记录 decision、reason、相对路径、可选行号、耗时桶和时间；测试成功 shadow、成功自动写入、失败均不记录正文、完整文件、未通过片段或绝对路径。
- [x] 4.2 为离线提取与 remember 写端到端集成测试，覆盖 shadow 默认、opt-in 后仅 gene 自动存储、失败/缺失声明待审和 Store/Later/Reject 回归。
- [x] 4.3 运行真实语料的只读 dry-run 汇总并记录 coverage、人工审核 precision proxy、延迟和 reason 分布；验证存量候选/记忆未被迁移或改写。

## 5. 契约、文档和质量门禁

- [x] 5.1 将本 change 的 4 份 delta spec 同步到主规范；验证所有 requirement 和场景完整保留，且主规范不再承诺默认自动写入或 project constraint 放量。
- [x] 5.2 合并更新 `docs/OPEN-GAPS.md` 与现有未提交内容：OG-5~OG-8 标注为本 change 处理，移除 `82 → 30` 等不可验证预测，并说明 shadow 默认、显式 opt-in 与不迁移存量。
- [x] 5.3 更新 README/GUIDE/COMPATIBILITY 的环境变量与 rollout 说明；验证不声称自动验证已降低队列，且明确回滚命令。
- [x] 5.4 对每个完成的 `##` 任务组写入 `docs/task-report/dev-<编号>/repo-task<编号>.md`，说明目的、作用、特点和边界，并验证报告不含密钥、候选正文或文件内容。
- [x] 5.5 运行候选准入、离线提取、remember、审计与配置相关测试，以及 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 和 `openspec validate stabilize-candidate-auto-admission --strict`；验证命令均退出 0。
