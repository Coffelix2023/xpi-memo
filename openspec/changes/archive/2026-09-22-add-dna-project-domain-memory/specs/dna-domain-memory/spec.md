## Purpose

为项目级 `.pi/DNA.yaml` 域记忆提供单一真相源:承载 `art`(前端视觉设计细节)与 `write`(写作/创意习惯)两个"人味"域,以 fail-closed schema 校验、信任门控与全量注入交付替代不可靠的记忆检索,并与 T1 记忆库按域分家、互不替代。

## ADDED Requirements

### Requirement: DNA 文件结构固定为单文件双域且允许为空

系统 MUST 将项目级 DNA 记忆存储为单一文件 `.pi/DNA.yaml`,仅包含 `art` 与 `write` 两个域;两域 MUST 允许为空,文件本身 MUST 允许缺省。文件缺省、未信任或解析失败时,系统 MUST 视该能力为关闭,且 MUST NOT 静默创建文件或回退到其他存储。

#### Scenario: 项目没有前端与写作内容

- **WHEN** 项目缺少 `.pi/DNA.yaml` 或其 `art`/`write` 两域均为空
- **THEN** DNA 注入不发生任何上下文输出
- **AND THEN** 系统不创建文件、不报错阻塞会话

#### Scenario: 文件存在且含条目

- **WHEN** 受信任项目存在合法的 `.pi/DNA.yaml` 且至少一个域含条目
- **THEN** 该文件是这两个域的唯一真相源
- **AND THEN** 系统 MUST NOT 为相同内容另建 T1 记录或派生副本

### Requirement: DNA 条目写入前必须通过 schema 校验

每条 DNA 条目 MUST 经既定 typebox schema 校验方可落盘,校验 MUST fail-closed:未知字段、缺失必填字段或类型不符的条目 MUST 被拒绝,且拒绝时原文件 MUST 保持不变、只返回有界诊断(不含条目正文以外的敏感内容)。条目 MUST 携带语义描述、`source`(来源)与 `confidence`(置信)标注。

#### Scenario: Agent 提交非法条目

- **WHEN** Agent 写入的条目缺少必填字段或类型不符
- **THEN** 该写入被拒绝,文件内容不变
- **AND THEN** 返回有界错误诊断,可指出违规字段路径

#### Scenario: 合法条目带来源标注

- **WHEN** 一条合法条目被写入
- **THEN** 其 `source` MUST 标明来源类别(用户手编 / Agent 归纳 / Agent 翻译并经用户确认)
- **AND THEN** 其 `confidence` MUST 为显式值而非缺省猜测

### Requirement: DNA 写入必须经安全筛查且不覆盖用户手编内容

所有 DNA 写入(含 Agent 主写与用户编辑被采纳)MUST 先经既有的外部内容安全边界筛查,命中禁止性内容 MUST 拒绝。写入 MUST 按条目身份合并(upsert),MUST NOT 以整文件重写方式丢弃用户手编的其他条目;同一条目冲突时 MUST 保留用户版本并返回有界冲突诊断。

#### Scenario: Agent 写入命中内容策略

- **WHEN** 待写条目包含凭据、令牌或禁止性内容
- **THEN** 写入被拒绝且文件不变
- **AND THEN** 拒绝记录仅含有界元数据,不复制被拒正文

#### Scenario: Agent 追加条目时文件已有用户编辑

- **WHEN** Agent 写入新条目而文件中存在用户手编的既有条目
- **THEN** 既有用户条目与格式 MUST 保持原样
- **AND THEN** 仅目标条目按身份新增或更新

#### Scenario: 同一条目用户与 Agent 冲突

- **WHEN** Agent 试图更新用户已手编覆盖的同身份条目
- **THEN** 用户版本被保留
- **AND THEN** 系统返回有界冲突诊断供用户裁决

### Requirement: DNA 交付采用全量注入而非检索

DNA 记忆 MUST 通过全量注入交付:在会话启动或判定当前任务涉及前端设计/写作时,系统 MUST 将对应域的完整内容注入上下文,并受既有注入约束(有界、可移除、空闲不注入)。DNA MUST NOT 接入 `xpi_memo_recall` 检索路径,recall 结果 MUST NOT 因 DNA 存在而改变。

#### Scenario: 前端任务注入 art 域

- **WHEN** 会话被判定涉及前端页面设计且 `art` 域非空
- **THEN** `art` 域全部条目以有界块注入上下文
- **AND THEN** 注入内容标注为项目文件上下文

#### Scenario: 写作任务仅注入 write 域

- **WHEN** 会话被判定涉及写作创作且 `write` 域非空
- **THEN** 仅 `write` 域被注入,`art` 域不注入
- **AND THEN** 与 DNA 无关的会话不注入任何 DNA 内容

#### Scenario: recall 不感知 DNA

- **WHEN** 用户或系统执行 `xpi_memo_recall`
- **THEN** 查询范围仍仅限既有 T1 banks
- **AND THEN** DNA 条目不出现在 recall 结果中

### Requirement: DNA 仅在受信任项目生效且与 T1 按域分家

DNA 的读取、注入与写入 MUST 仅在受信任项目(Project Trust)中生效;未信任项目 MUST 视同文件缺省。`art`/`write` 域内容 MUST NOT 写入 T1、MUST NOT 新增或借用 T1 kind;T1 既有 kind 枚举、banks 与治理路径 MUST 保持不变,CODE/工程类习惯 MUST 继续走 T1 既有路径。

#### Scenario: 未信任项目中的 DNA 文件

- **WHEN** 未受信任项目存在 `.pi/DNA.yaml`
- **THEN** 系统不读取、不注入、不写入该文件
- **AND THEN** 会话与 T1 行为不受该文件影响

#### Scenario: art 条目不会串入 T1

- **WHEN** `art` 域成功写入一条条目
- **THEN** T1 banks 中不出现该内容的记录
- **AND THEN** T1 kind 枚举与既有候选治理不受影响
