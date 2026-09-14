## Why

实测报告显示，xpi-memo v1.0 在非 Git、非 TUI 和未配置 sleep model 的真实环境中存在静默失效：项目记忆与 `session_context` 可能无法路由，真实错误被压缩为通用提示，路由拒绝不进入 L0 事件链，自动捕获尚未完成最差环境验收。与此同时，项目记忆的可移植性需要提升，但将 SQLite 数据库放入项目目录会破坏 worktree 共享、Git 合并和隐私边界，因此需要建立 post-release hardening 变更。

## What Changes

- 增强运行时边界处理，使非 Git 目录的行为显式、可预测，并为 project identity 缺失提供明确的初始化或受控降级策略。
- 将路由拒绝、降级写入和配置禁用等失败状态纳入 L0/audit 可观测链路，保留不含正文和敏感数据的有界诊断信息。
- 向 `xpi_memo_remember`、recall、status 和 doctor 返回可行动的原因，区分路由失败、策略拒绝、候选排队、存储失败和搜索范围受限。
- 修正 `session_context` 的存储语义，使其不再必然依赖 Git 项目身份；统一 global、project、session 的 scope 元数据语义。
- 完成非 TUI、非 Git、跨 session 的 activation loop 验收，确保自动捕获、候选生命周期、幂等和后续 recall 可验证。
- 为 sleep 增加能力透明度和显式执行模式；支持经用户授权的可控 fallback，不能把 fallback 伪装成 dedicated model 执行。
- 增加项目内 Markdown 记忆导出与回流：可读文本进入 `.pi/memory/`，机器态 SQLite 继续留在全局 xpi-memo 数据目录。
- 为项目导出提供稳定文件、memory ID 锚点、幂等重导、`repo-export` 来源和 orphan bank 只提示不自动删除的治理规则。
- 保持已有 T1 工具、候选审核、Git worktree 共享 bank、默认隐私边界和 L0 事件源不被破坏。

## Capabilities

### New Capabilities

- `runtime-boundary-hardening`: 非 Git/非 TUI 环境的记忆路由、失败反馈、L0/audit 诊断、`session_context` 语义、scope 一致性、activation loop 验收和 sleep 能力降级。
- `repository-memory-export`: 全局机器态 SQLite 与项目内可读 Markdown 的分层存储、项目导出、幂等锚点、跨机器回流和 orphan bank 检查。

### Modified Capabilities

- None. 本 change 不修改已完成 change 的历史 delta；上述行为以新的能力契约承载。

## Impact

- 运行时与路由：`src/index.ts`、`src/routing.ts`、`src/kinds.ts`、`src/identity.ts`、`src/operations.ts`。
- 生命周期与观测：`src/memory-activation.ts`、候选生命周期、L0/audit、`src/doctor.ts`、`src/status.ts`、recall 与 sleep 模块。
- 导出与迁移边界：现有 Markdown export、项目路径解析、repo-export 回流和 orphan bank 检查。
- 用户可见 API：`xpi_memo_remember`、`xpi_memo_recall`、`xpi_memo_sleep`、status/doctor 输出；保持现有工具名称和基本调用兼容。
- 测试：增加真实 hook/非 TUI/非 Git/跨 session 验收，以及 Git worktree、隐私、幂等和失败可观测回归覆盖。
- 不引入新的数据库、Web 框架或外部在线服务；不把 SQLite、WAL 或 SHM 文件放入项目仓库。
