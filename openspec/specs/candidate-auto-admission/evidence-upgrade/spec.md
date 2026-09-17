# candidate-auto-admission/evidence-upgrade Specification

## Purpose

支持候选证据类型升级——`l0-conclusion` 经验证后可升为 `verified-repository-fact`,满足自动存储前提,打通离线提取到自动入库的路径。

## Requirements

### Requirement: 证据类型升级接口

候选生命周期 SHALL 提供证据类型升级接口,允许治理层在工具验证通过后将 `l0-conclusion` 升级为 `verified-repository-fact`,而不改变候选的其他元数据(provenance/source/timestamp)。

#### Scenario: l0-conclusion 升级为 verified-repository-fact

- **WHEN** 候选初始证据类型为 `l0-conclusion`(离线提取产生)
- **THEN** 工具验证通过后,证据类型升级为 `verified-repository-fact`
- **AND** provenance/source/timestamp 不变
- **AND** 升级后的候选满足 auto-store-policy 的 gene/constraint 自动存储条件

#### Scenario: 升级后保留原始证据链

- **WHEN** 证据类型从 `l0-conclusion` 升级为 `verified-repository-fact`
- **THEN** 原始 `l0-conclusion` 的 provenance 保留
- **AND** audit.json 记录升级事件,关联验证依据
- **AND** 事后可追溯"此记忆来自离线提取,经工具验证后自动入库"

#### Scenario: 验证失败不升级证据类型

- **WHEN** 工具验证失败
- **THEN** 候选保持 `l0-conclusion` 证据类型
- **AND** 不满足自动存储条件,进入待审队列
- **AND** audit.json 记录验证失败,不记录升级事件

### Requirement: 证据类型升级不绕过治理

证据类型升级 SHALL 仅作用于已进入候选生命周期的候选,MUST NOT 绕过内容策略、scope 路由、provenance 验证等既有治理边界。

#### Scenario: 升级前先过内容策略

- **WHEN** 候选进入工具验证前
- **THEN** 内容策略已执行,禁止性内容已被拒绝
- **AND** 证据类型升级仅处理通过内容策略的候选
- **AND** 升级不重新检查内容策略

#### Scenario: 升级不改变 scope 路由

- **WHEN** 候选 scope 已路由到 project bank
- **THEN** 证据类型升级后,scope 不变
- **AND** 自动存储写入原 scope 对应的 bank
- **AND** global 候选不会因升级而误入 project bank

### Requirement: 证据类型白名单

证据类型升级 SHALL 仅支持预定义的安全升级路径(`l0-conclusion` → `verified-repository-fact`),MUST NOT 支持从 `explicit-user-statement` 降级或任意证据类型转换。

#### Scenario: 仅支持 l0-conclusion 升级

- **WHEN** 候选初始证据类型为 `verified-tool-result`
- **THEN** 工具验证不修改证据类型
- **AND** 候选按原证据类型的治理路径处理

#### Scenario: 不支持 explicit-user-statement 降级

- **WHEN** 候选证据类型为 `explicit-user-statement`
- **THEN** 治理层 MUST NOT 将其降级为其他类型
- **AND** 用户陈述的证据强度始终高于模型推导
