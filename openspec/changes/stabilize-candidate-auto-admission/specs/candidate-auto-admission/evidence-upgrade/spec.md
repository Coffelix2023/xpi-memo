## MODIFIED Requirements

### Requirement: 证据类型升级接口

候选生命周期 SHALL 仅在 `l0-conclusion` 携带通过的 repository-fact 验证结论时，将其升级为 `verified-repository-fact`。升级 MUST 保留原始 provenance、source、timestamp 和 confidence；验证依据作为独立的有界审计元数据记录，MUST NOT 由候选正文或工具输入来源推断。

#### Scenario: l0-conclusion 升级为 verified-repository-fact

- **WHEN** 候选初始证据类型为 `l0-conclusion`，且其 repository-fact 验证声明通过
- **THEN** 候选证据类型升级为 `verified-repository-fact`
- **AND** provenance/source/timestamp 不变
- **AND** 仅当 rollout 允许时，升级后的候选才可自动存储

#### Scenario: 升级后保留原始证据链

- **WHEN** 证据类型从 `l0-conclusion` 升级为 `verified-repository-fact`
- **THEN** 原始 `l0-conclusion` 的 provenance 保留
- **AND** audit.json 记录候选 ID、验证声明的有界定位和验证时间
- **AND** 事后可追溯“此记忆来自离线提取，经仓库事实验证后获得升级”

#### Scenario: 验证失败不升级证据类型

- **WHEN** repository-fact 验证失败、超时、不可用或声明无效
- **THEN** 候选保持原始证据类型
- **AND** 不满足自动存储条件，进入待审队列
- **AND** audit.json 记录有界失败原因，不记录升级事件

### Requirement: 证据类型白名单

证据类型升级 SHALL 仅支持预定义的安全路径：`l0-conclusion` → `verified-repository-fact`。`verified-tool-result` MUST 保留其来源语义；系统 MUST NOT 从 `explicit-user-statement`、`verified-tool-result` 或任意其他证据类型转换为 `verified-repository-fact`，也不得降级 `explicit-user-statement`。

#### Scenario: 仅支持 l0-conclusion 升级

- **WHEN** 候选初始证据类型为 `verified-tool-result`
- **THEN** 即使工具检查通过，候选证据类型也不变
- **AND** 候选按其原证据类型的治理路径处理
- **AND** 验证结果不会单独授权自动存储

#### Scenario: 不支持 explicit-user-statement 降级

- **WHEN** 候选证据类型为 `explicit-user-statement`
- **THEN** 治理层 MUST NOT 将其降级为其他类型
- **AND** 用户陈述的证据强度始终高于模型推导
