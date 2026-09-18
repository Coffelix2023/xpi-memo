## ADDED Requirements

### Requirement: Settings MUST expose the admission preferences as tunable fields

面板的 Settings 视图 MUST 呈现准入偏好，使用户能在不手工编辑配置文件的前提下收紧或放宽自动准入。每个偏好 MUST 显示当前生效值，且当该偏好被环境变量固定时 MUST 阻止用户在面板内修改它。

#### Scenario: 查看与修改准入偏好

- **WHEN** 用户展开准入偏好分组
- **THEN** 每个偏好字段 MUST 显示其标签与当前生效值
- **AND THEN** 用户可修改未被环境变量固定的字段
- **AND THEN** 修改结果 MUST 写回配置文件并在后续准入判定中生效

#### Scenario: 准入偏好被环境变量固定

- **WHEN** 某个准入偏好由环境变量固定
- **THEN** 该行 MUST 显示对应环境变量名
- **AND THEN** 用户 MUST NOT 能在面板内修改它
- **AND THEN** 该行显示的 MUST 是实际生效值，而不是配置文件里的值
