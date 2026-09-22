# typesafe-decision-hooks Specification

## Purpose

为可选的 TypeSafe(System One/Jev)决策接入提供 provider-neutral 契约:配置门控默认关闭、密钥与出站安全、入站回筛、有界可中止、失败 fail-open,并定义校准置信度的标注方式,使窄判断(精排、稳定性判定、置信度校准)可在不改变既有行为的前提下按需启用。

## Requirements

### Requirement: 决策 runner 必须 provider-neutral 且默认关闭

系统 MUST 以 provider-neutral 边界装配决策 runner,默认状态 MUST 为关闭;关闭时系统 MUST NOT 发起任何决策类网络调用,所有消费方(精排、重复判定、校准)MUST 表现为与现状完全一致。runner 实现 MUST 可被注入替换,且 MUST NOT 绑定唯一供应商 SDK 于核心路径。

#### Scenario: 未配置 runner 时的 recall

- **WHEN** 决策 runner 未配置或处于关闭状态
- **THEN** recall 执行且不发起任何决策网络调用
- **AND THEN** 输出与关闭前行为一致

#### Scenario: 注入替代 runner

- **WHEN** 测试或宿主注入了替代 runner 实现
- **THEN** 系统使用注入实现
- **AND THEN** 默认实现 MUST NOT 被调用

### Requirement: 密钥与出站入站双向安全

API key MUST 仅经环境变量读取,MUST NOT 出现于代码、日志、诊断正文或落盘数据。出站 state MUST 先经既有外部内容安全边界脱敏,无法确认安全时 MUST 拒绝外发;入站回答 MUST 经既有内容安全回筛(注入判定、可持久化判定),不合格回答 MUST 被丢弃并按 untrusted 处理,原调用方回退到本地行为。

#### Scenario: 出站内容含凭据

- **WHEN** 待外发 state 命中已知凭据或令牌
- **THEN** 凭据被脱敏后才外发
- **AND THEN** 无法完成脱敏确认时外发被拒绝,本地行为继续

#### Scenario: 入站回答携带注入指令

- **WHEN** runner 返回的内容被注入判定命中
- **THEN** 该回答被丢弃且不进入任何持久化或注入路径
- **AND THEN** 调用方按 runner 不可用回退,并记录有界诊断

### Requirement: 调用必须有界、可中止且失败 fail-open

每次决策调用 MUST 有时间与字符预算、MUST 可中止;超时、限流、停服或任何供应商失败 MUST fail-open:消费方回到调用前的本地行为(不精排、不生成候选、保持原 confidence),会话 MUST NOT 被阻塞,失败 MUST 以有界计数可观测。

#### Scenario: 供应商超时

- **WHEN** 决策调用超出时间预算
- **THEN** 调用被中止,消费方采用本地回退结果
- **AND THEN** 会话不中断,状态/doctor 中失败计数 +1,不含请求正文

#### Scenario: 供应商停服

- **WHEN** 供应商返回持续错误
- **THEN** 所有消费方保持既有行为且功能可用
- **AND THEN** 用户可通过关闭开关显式停用,无需代码改动

### Requirement: 置信度校准值必须标注来源且准入政策零改动

校准输出写入候选 `confidence` 时 MUST 标注该校准来源(区别于模型推导与用户陈述),并 MUST NOT 伪装为 `explicit-user-statement`。校准值 MUST 仅被既有"最低置信度"准入偏好消费;系统 MUST NOT 因接入校准而修改 `shouldAutoStore`、`autoConfirm` 或 evidence-upgrade 白名单。

#### Scenario: 校准值参与准入判定

- **WHEN** 候选携带校准来源的 confidence 且 runner 已启用
- **THEN** 既有最低置信度偏好按该值判定排队或准入
- **AND THEN** 准入规则代码路径与开关关闭时相同

#### Scenario: 校准不可用

- **WHEN** runner 关闭或调用失败
- **THEN** 候选保持原 confidence 与来源标注
- **AND THEN** 不产生任何"已校准"标记

### Requirement: 决策调用必须可观测且有界

系统 MUST 在 status/doctor 中报告:开关状态、各消费方调用次数、fail-open 次数、门控命中次数;所有报告 MUST 有界且 MUST NOT 包含被判定内容正文、state 或回答正文。

#### Scenario: 请求决策接入状态

- **WHEN** 用户查看 status 或 doctor
- **THEN** 可见 runner 开关、调用/失败/门控计数
- **AND THEN** 报告不含任何记忆正文或外发 state
