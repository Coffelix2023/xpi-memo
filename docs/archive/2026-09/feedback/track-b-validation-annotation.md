# Track B 验证标注

- 日期: 2026-09-05
- 扩展版本: `e462767`
- 运行环境: Pi 0.85.0
- 数据源: `~/.pi/agent/xpi-memo/audit.json`

## 配置与样本

验证期间将 `~/.config/xpi-memo/config.json` 的 `offlineExtractionEnabled` 临时设为 `true`；所有样本结束后已恢复为 `false`。每个会话设置 `XPI_MEMO_PAUSED=true`，避免验证语句进入 T1。

共运行 5 个独立真实 Pi 会话，包含以下自然表达类别：

| 类别 | 应捕获语义 | 会话数 |
| --- | --- | --- |
| 偏好 | 行为改动先写失败测试 | 1 |
| 工作流 | 发布前检查与禁止未授权历史重写 | 1 |
| 项目决策 | 注入可见性通过 L0 ID 和 bank 反查 | 1 |
| 项目约束 | 交互仅使用 `ctx.ui` | 1 |
| 项目经验 | forget 后追加 `memory_deleted` | 1 |

## 审计结果

5 个 `session_shutdown` 均写入 extraction 审计记录：

| 状态 | 次数 | proposalsTotal | validProposals | storedCount | candidateCount |
| --- | ---: | ---: | ---: | ---: | ---: |
| `unavailable` | 5 | 0 | 0 | 0 | 0 |

候选队列为空。每个 session 的 extraction ledger 记录 `executions: 0`、`proposals: 0`。

## 标注与根因

应捕获样本数为 5，但没有产生可标注的 proposal，因此不能计算有意义的漏捕获率。这不是自然语言分类或治理拒绝导致的漏捕获，而是抽取执行器从未可用。

根因分类：`infrastructure-unavailable`。

生产入口只将 `dependencies.offlineExtractionRunner` 传给离线提取生命周期；Pi 0.85.0 没有向扩展注册入口注入该依赖。启用开关后 shutdown 钩子正常运行并审计 `unavailable`，不会调用模型、生成候选或伪造记忆。

## show_injected 验收

未通过，原因是没有 Track B 提取出的记忆可注入。该项不影响 `xpi_memo_show_injected` 的单元与集成覆盖，但无法作为 Track B 的端到端证据。

## ai-memory 角色决策

选择 **接管 offline extraction 执行**，而非与 Track B 分工。

依据：当前 Track B 在生产中没有 runner，五个会话都停在 `unavailable`，不存在可分工的提取能力。ai-memory 的最小职责是提供一个受控、可审计、带超时和预算约束的 `OfflineExtractionRunner`，输出仍必须经过现有的 `l0-conclusion` 规范化、内容策略、路由和候选治理。

重新评估条件：runner 接入后，再用至少 10 个真实会话测量可计算的漏捕获率、误捕获率和治理结果；届时再决定是否保留分工模式。
