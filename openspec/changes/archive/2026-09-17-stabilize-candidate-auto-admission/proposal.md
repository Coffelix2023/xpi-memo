## Why

当前自动准入把模型改写的自然语言候选作为 `rg -F` 固定字符串搜索词。真实语料回放为 `0/32` 验证通过，待审队列由 82 增至 95；同时离线提取、`xpi_memo_remember` 与导入路径没有共享一个完整的准入决定，`shouldAutoStore` 的 project fact 分支也不可达。直接扩大证据升级白名单或补接 `autoConfirm` 会混淆来源 provenance（来源链路）与仓库验证事实，并放大假阳性或异常风险。

本 change 将自动准入收敛为可复核、默认不写入的统一治理路径：先观察，再由显式开关放量。

## What Changes

- 为所有候选入口定义统一的准入决定：验证、证据升级、待审或自动存储只能由该入口确定；失败、超时、缺少验证声明或配置关闭时一律保留候选。
- 对可自动准入的 `project_gene` 引入结构化 repository fact（仓库事实）验证声明，至少绑定仓库内相对文件、非注释证据片段和可选 revision（修订版本）；不再用候选正文最长行猜测仓库证据。
- 保持 `verified-tool-result` 仅代表工具/代理来源，不将它升级为 `verified-repository-fact`；只有原始 `l0-conclusion` 经通过的仓库事实验证才可升级。
- 默认运行 shadow mode（影子模式）：执行验证并记录有界结果，但所有候选仍进入待审。仅在 `XPI_MEMO_AUTO_ADMIT=true` 且 `XPI_MEMO_AUTO_VERIFY` 未关闭时，允许通过验证的 `project_gene` 自动存储。
- `project_constraint`、无结构化验证声明的 `remember`、仓库导入和其他 kind 维持待审；不迁移存量候选。
- 为成功、失败、超时、不可用、注释/路径/revision 不匹配和 shadow 结果提供无正文审计指标；以覆盖率、人工抽样准确率、延迟和失败原因作为后续放量依据。
- **BREAKING**：原来默认可自动存储的离线 `project_gene` 变为默认待审，直至操作者显式启用 `XPI_MEMO_AUTO_ADMIT=true`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `t1-governance`: 所有候选入口遵循统一的、失败即待审的准入决定；shadow 与自动存储结果可观察。
- `candidate-auto-admission/evidence-upgrade`: 只允许有通过仓库事实验证的 `l0-conclusion` 升级，保持来源类型语义。
- `candidate-auto-admission/tool-verified-storage`: 验证结构化仓库证据、排除注释，并记录有界可复核依据。
- `candidate-auto-admission/kind-routing`: 明确 shadow 默认、双开关启用条件和 `project_constraint` 的人工确认边界。

## Impact

- 代码：候选生成入口、candidate lifecycle、离线提取规范化、`remember` 路径、验证器、准入策略、audit/L0 和测试。
- 配置：新增 `XPI_MEMO_AUTO_ADMIT=true` 作为自动写入的显式 opt-in（选择加入）；保留 `XPI_MEMO_AUTO_VERIFY=false` 总 kill switch。
- 数据：不迁移现有候选或记忆；新增审计字段和有界 reason code（原因码），不记录候选正文。
- 依赖：不新增依赖，使用 Node 标准库与现有 Pi 运行时。
