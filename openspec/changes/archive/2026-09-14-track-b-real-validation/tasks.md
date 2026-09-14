## 1. Platform assumption check

- [x] 1.1 Prove in a real session that an async `session_shutdown` handler can still reach `ctx.modelRegistry` / `ctx.model` before the session is disposed, and record the observed evidence (command plus result) in `docs/evaluation-reports/`; verify the record contains the observed evidence rather than the type declaration alone
  - 证据：`docs/evaluation-reports/track-b-shutdown-context-2026-09-14.md`；可回归探针 `src/shutdown-model-context.integration.test.ts`。实测 shutdown 内 `await` 后 `ctx.modelRegistry` 存活（`getAvailable()` = 50），并可在处理器内完成一次真实 `complete()`（857 ms，`stopReason: "stop"`）。
- [x] 1.2 If the shutdown path proves unusable in practice, restrict the default runner to the `session_before_compact` path only, record that limitation, and keep the spec contract unchanged; verify the recorded limitation names the affected event and the fallback
  - N/A：条件未触发。关闭路径实测可用，因此不施加该限制，spec 契约保持不变（见同一证据文件「对 task 1.2 的影响」）。

## 2. Default runner and assembly

- [x] 2.1 Add the default runner module that accepts the existing `OfflineExtractionRunnerInput`, calls the model through `modelRegistry.complete` with a bounded timeout and an abort signal, and normalises the result into the existing proposal shape; verify unit tests with a fake registry cover success, timeout, thrown error, and no model
  - `src/offline-extraction-runner.ts` + `src/offline-extraction-runner.test.ts`（6 项：成功、代码围栏/坏引用、解析失败、超时+abort、抛错、无模型）。
- [x] 2.2 Wire the default runner in `index.ts` as a fallback only when no runner was injected; verify tests assert that an injected runner is used and that the default runner is used only when the injection is absent
  - `sessionModelRunnerFor()`；`runner: dependencies.offlineExtractionRunner ?? sessionModelRunnerFor(ctx)`；`src/index.test.ts` 断言注入优先（模型 0 调用）与兜底生效（1 次调用，审计 `completed`）。
- [x] 2.3 Enforce the three enablement conditions (explicit flag, active model, remaining budget) and keep the existing budget rule that any attempt consumes the execution budget; verify the model call count is 0/0/0/1 across the disabled, no-model, exhausted-budget, and enabled cases
  - `src/index.test.ts`：开关关闭 = 0、无活跃模型 = 0（审计 `unavailable`）、预算耗尽后追加 = 0、启用 = 1。
- [x] 2.4 Verify the rollback path: with `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` unset or `false` after a successful run in the same session, no further model request is issued
  - `src/index.test.ts`：`false` 与 unset 两种形态各断言调用数不增；对照组先删除预算账本证明停止来自开关。

## 3. Governance, safety and diagnostics

- [x] 3.1 Route default-runner proposals through the existing governance pipeline, keeping the model-derived evidence type and never labelling them as explicit user statements; verify an integration test asserts the evidence type and the candidate behaviour for review-required kinds
  - `src/activation-loop.integration.test.ts`：默认 runner 的两条提案（`project_decision`、`project_constraint`）都只进候选（未直存），证据类型均为 `l0-conclusion`，且“用户陈述”标记仅属于显式捕获那一行。
- [x] 3.2 Keep outbound content on the existing redaction path and refuse to send when safety cannot be confirmed; verify a test with credential-bearing input asserts the external payload is redacted or the request is not sent
  - `src/index.test.ts`：可脱敏凭证 → prompt 含 `[REDACTED]` 且原文不出现；未闭合私钥 → 模型调用 0 次且审计 `refused`。
- [x] 3.3 Make audit and status distinguish runner-unavailable, executed-with-proposals, and executed-without-proposals, keeping bodies and raw model output out of both; verify observability and status tests assert the three states and the absence of body text
  - `offlineExtractionOutcome()` + 审计 `outcome` + status `offlineExtraction.lastOutcome` + observability `activation.extractionOutcome`；测试见 `src/observability.test.ts`、`src/index.test.ts`。

## 4. Real validation and record

- [x] 4.1 Run at least one real session with `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` and verify the audit trail contains an extraction record with a distinguishable outcome state
  - 5 个真实会话：审计 5 条 extraction，`outcome` 为 3× `executed-with-proposals` / 2× `executed-without-proposals`；另有开关关闭对照会话零 extraction 记录。证据：`docs/evaluation-reports/track-b-validation-2026-09-14.md`。
- [x] 4.2 Produce the manual annotation table with missed-capture rate, accuracy, and root-cause categories for the missed cases; verify the table file exists with grouped counts and named categories
  - 标注表：漏捕获 40%（2/5）、类别精确率 75%（3/4）；根因分类 `bare-requirement-read-as-instruction`（2）与 `adjacent-kind-over-split`（1）。
- [x] 4.3 State the ai-memory role decision criteria (division of labour versus takeover) and the conclusion supported by the collected data, without integrating ai-memory in this change; verify the record names the criteria and quotes the measured numbers
  - 标准先于测量写下（漏捕获 ≤ 20%、精确率 ≥ 80%、零伪造）；实测 40% / 75% 均不达标 → **接管模式**，并写明复审条件。未接入 ai-memory。
- [x] 4.4 Run `pnpm typecheck`, `pnpm -w run lint` and `pnpm test`, and record the results; verify all three exit 0
  - 三条均为 exit 0（`684 passed / 7 skipped`）；记录见验证文档 4.4 节与本报告。
- [x] 4.5 Write the per-task-group report required by `AGENTS.md` section 7 into `docs/task-report/dev-<next-id>/`, stating purpose, effect, characteristics and boundaries for each `##` group; verify the file exists and covers all four elements
  - `docs/task-report/dev-7/repo-task7.md`，四个任务组各含目的/作用/特点/边界。
