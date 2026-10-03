# Tasks

## 1. Dependency Resolution

- [x] 1.1 Update the Pi runtime dependency declarations to the approved `1.0.1` package set, retain `typebox@1.3.27`, and update the relevant pnpm release-age exclusions; verify the manifest and workspace policy contain no unintended package changes.
- [x] 1.2 Regenerate `pnpm-lock.yaml` using the repository's frozen-install-compatible workflow; verify `pnpm install --frozen-lockfile --ignore-scripts` succeeds.
- [x] 1.3 Verify the resolved dependency topology with `pnpm why @earendil-works/pi-tui` and `pnpm why typebox`, then inspect the installed package paths; verify each target package has exactly one physical version and the Pi family resolves to `1.0.1`.

## 2. API Compatibility Tests

- [x] 2.1 Update the tool execution helper in `src/live-rpc.integration.test.ts` to provide the Pi `1.0.1` `ExtensionToolContext` contract; verify `pnpm typecheck` no longer reports the helper error and the targeted live RPC test remains behaviorally unchanged.
- [x] 2.2 Update the tool execution context in `src/real-cli.integration.test.ts` without weakening the type boundary through blanket casts; verify `pnpm typecheck` passes and the targeted real CLI integration test preserves its existing result and governance assertions.
- [x] 2.3 Run the relevant integration tests and document any environment-gated or skipped suites; verify failures are classified as code regressions versus unavailable external/runtime prerequisites.

## 3. Runtime UI Verification

- [x] 3.1 fullscreen 模式：用户已在真终端按 `verification-tui.md` A1-A5 人工确认通过（overlay 渲染 / 键盘 / 关闭 / 焦点恢复正常）。
- [x] 3.2 regular 模式：同上，B1-B2 人工确认通过。
- [x] 3.3 Glimpse 不可用 fallback：C1-C5 人工确认通过；全程未绑定 8010。

## 4. Acceptance Checks

- [x] 4.1 `pnpm typecheck` 通过；`pnpm exec biome check` 改动路径通过；workspace 全量 lint 仅剩 `src/index.ts` 两条既有 info（exit 0，非本次引入）。
- [x] 4.2 相关集成测试通过（real-cli 4 passed、live-rpc 1 passed），全量 `pnpm test` 119 passed / 4 skipped（123 文件，1259 用例）；跳过的 4 个文件是环境门控（`XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION` 等），已单独以 `=1` 跑通。
- [x] 4.3 diff 仅含：依赖清单（package.json）、pnpm-workspace.yaml 发布龄期豁免、pnpm-lock.yaml、两个测试夹具的 `ExtensionToolContext`、本变更的验证文档与 tasks.md。未改 `src/mental-model-runner.ts`，未采纳 MCP/codemode/虚拟模型/renderer 等未使用的 Pi 1.0 API。`AGENTS.md` 的改动是本次会话之前就存在的，不属于本变更。回滚 = 一起还原这 5 个文件 + 删除 `verification-tui.md`。
