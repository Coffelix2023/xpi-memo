# Proposal

## Why

Pi 官方运行时已发布 `1.0.1`，而 xpi-memo 仍锁定在 `0.87.1`，并且当前锁文件存在两份 `@earendil-works/pi-tui`。升级可以获得官方维护的运行时版本，但 Pi 1.0 同时收紧了工具上下文类型并将 TUI 默认模式改为 fullscreen，因此必须把依赖升级与兼容性验证作为一个可回滚变更处理。

## What Changes

- 将 `@earendil-works/pi-coding-agent` 及其 Pi 相关依赖统一升级到 `1.0.1`。
- 显式整理 `@earendil-works/pi-tui`，确保升级后只存在一个物理版本。
- 保持 `typebox` 为 `1.3.27`，不跟随 registry 最新版本升级。
- 更新 pnpm release-age 豁免，使目标 Pi 包可以按仓库安装策略解析。
- 适配受 Pi 1.0.1 `ExtensionToolContext` 收窄影响的集成测试夹具。
- 验证生产源码、类型检查、测试、物理依赖单例状态，以及 regular/fullscreen TUI 行为。
- 提供依赖升级失败时的锁文件与源码回滚路径。

## Capabilities

### New Capabilities

- `pi-runtime-compatibility`: 保证扩展在受支持的 Pi 运行时版本下加载、注册工具和使用终端 UI，并通过依赖拓扑与运行时回归验证维持兼容性。

### Modified Capabilities

<!-- No existing user-facing capability requirements change. -->

## Impact

- 依赖清单、pnpm workspace 安装策略和锁文件。
- `src/live-rpc.integration.test.ts` 与 `src/real-cli.integration.test.ts` 的工具执行测试夹具。
- Pi 扩展注册、工具执行上下文、自定义 overlay、键盘输入、Glimpse/terminal fallback 的验证面。
- 不改变 T1/L0 数据模型、记忆路由、mental-model 业务行为或用户级配置路径。
- `src/mental-model-runner.ts` 中已发现的 timeout/signal 问题不属于本变更，单独跟踪。
