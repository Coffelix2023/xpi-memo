## Why

`xpi-memo` 已具备 L0 会话追踪、T1 治理记忆、Mnemosyne 召回、Markdown 投影和 Pi 生命周期接入，但中文语义检索、关系召回与“越用越懂用户”的派生进化能力仍需要通过可验证评估补足。现在直接接入 `ai-memory` 或候选记忆库会造成重复捕获、双重事实权威和生命周期冲突，因此需要先固定 T2 派生增强层边界与评估协议，再决定是否做 adapter（适配器）PoC（概念验证）。

## What Changes

- 定义 T2 派生增强层：保留 `xpi-memo` 作为唯一事实权威，外部能力只能读取 L0/T1 并生成派生检索索引或候选提案。
- 建立四个候选项目的静态评估矩阵，重点检查本地可回滚、中文语义、自我进化、证据追踪和零热路径开销。
- 设计真实中文场景评测，覆盖用户偏好、项目连续性、中英混合技术和中文多跳语义。
- 评估无 embedding、本地 embedding、云端 embedding 三种模型部署档位。
- 规定轻量证据图只作为可选召回/重排信号，不替代原文、L0 provenance（来源追踪）或 T1 状态。
- 设计每次记忆动作的短暂流光状态提示，以及候选确认、失败降级和审计查询边界。
- 将 `ai-memory` 暂定为架构参照和未来跨 Agent/远程共享候选，不进入当前运行时，不作为并行后端。
- 本变更只生成评估与接入计划，不安装候选、不修改生产代码、不改变现有存储格式。

## Capabilities

### New Capabilities

- `t2-memory-evaluation`: 规定 T2 派生记忆增强能力的评估维度、中文场景、模型档位、证据链、通过门槛和候选排序流程。
- `memory-action-visibility`: 规定记忆捕获、候选、确认、拒绝和失败的短暂状态提示与可配置显示等级。

### Modified Capabilities

- `memory-activation-loop`: 增加派生 T2 提案必须复用现有 L0/T1 证据、候选生命周期和幂等边界的要求。
- `pluggable-search`: 增加外部派生检索 adapter 的隔离、降级、低权重融合和不得改变 T1 主权的要求。

## Impact

- 主要涉及后续设计与评估文档，以及未来的 `src/search/`、`src/memory-activation.ts`、状态提示和配置边界。
- 当前阶段不新增运行时依赖，不安装 `memvid`、`memU`、`Memori`、`agentmemory` 或 `ai-memory`。
- 未来若进入实现，可能新增可选 adapter、评测脚本、测试夹具、配置项和状态面板字段；默认必须保持现有 Mnemosyne/ripgrep/qmd 回退链不变。
- 兼容性要求：现有 T1 数据、L0 日志、Markdown 投影、精确删除、审计和 `XPI_MEMO_PAUSED` 行为不能被候选系统接管或破坏。
