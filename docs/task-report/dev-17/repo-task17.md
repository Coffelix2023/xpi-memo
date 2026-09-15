# Task Report: evolve-memory-runtime task 4.x

## 完成范围

本次完成 Section 4(Feedback and preference evolution)全部 4 个任务,进度从 10/21 推进到 14/21。上一轮已写好 feedback.ts 与 index.ts 接入主体,本轮补齐两处旧断言同步、4.4 缺失的 status/doctor 计数器测试,并验证三条命令全绿。

### 目的

记忆被召回/注入后,Agent 无法知道"这条偏好有用还是有害",错误偏好会永久占据召回结果。本节引入两条反馈通路:显式反馈(helpful/wrong/irrelevant,经治理工具)与被动使用反馈(recalled/injected,限速、只影响新鲜度/排序),并用显式纠正压制旧行,让偏好可演化而历史证据不丢。

### 作用与特点

- **单一治理面**:feedback 只写 audit log(`action: "feedback"`),不新增存储,不经 L0 写路径,evidence type 与 provenance 完全不变。
- **强弱分层**:passive "used" 每条记忆 60 秒限速、每次仅 +0.02;explicit helpful +0.1、wrong -0.25、irrelevant -0.15、correction -0.5,调整上限 clamp 到 ±1。显式纠正永远强于被动信号。
- **纠正不删证据**:`supersedes` 链让旧行带 `supersededBy` 退出主导注入(被 3.x Profile 投影排除),行本身保留可追溯。
- **body-free 计数器**:status 与 doctor 暴露 conflicts/explicit/helpful/irrelevant/passive/supersessions/wrong 七个有界计数(≤999),不含任何记忆内容。

### 边界

- 被动反馈不能直接创建或确认任何持久记忆,只调排序分。
- 语义级矛盾(不同文本互斥)仍需显式纠正驱动;冲突计数只统计显式 correction/supersedes。
- 反馈调整只作用于本次 recall 会话内的结果投影,不回写 T1 行。

## 各任务实现要点

| 任务 | 实现 |
|------|------|
| 4.1 显式反馈操作 | `xpi_memo_feedback` 工具(helpful/wrong/irrelevant)+ `executeFeedback` 校验非法值即拒;audit 记录 feedback/feedbackMode/targetMemoryId |
| 4.2 被动使用反馈 | recall 与 auto-inject 成功后对有 id 的结果记 passive "used";`canRecordPassiveFeedback` 60s 限速;`feedbackAdjustment` 仅 +0.02;`applyFeedbackToRecall` 只投影分数 |
| 4.3 显式纠正优先 | remember 的 supersedes 路径记 "correction"(-0.5);旧结果标 `supersededBy` 指向新记忆;旧行保留但退出 Profile 注入 |
| 4.4 状态计数器 | `summarizeFeedback` 投影 audit → `MemoryStatus.feedback` 与 `doctor.evidence.feedback`(缺省全 0);新增 status/doctor 两条 body-free 测试 |

## 验证

- `pnpm typecheck` ✓
- `pnpm -w run lint`(biome)✓ 0 warning(修复了 4.x 新增文件的属性排序/导入序)
- `pnpm test` ✓ 732 passed(新增 status/doctor feedback 计数器 2 条;同步 audit 与 activation-loop 两处旧断言以纳入 feedback action)

## 旧断言同步说明

- `audit.test.ts`:`AUDIT_ACTIONS` 序列加入 `"feedback"`(action 列表事实来自 src/audit.ts)。
- `activation-loop.integration.test.ts`:recall 后的 audit 动作序列在两个 "recall" 之间多一条 passive "feedback",属 4.2 预期行为。

## 回滚

删除 `src/feedback.ts`、`src/feedback.test.ts`,还原 index.ts 中 applyFeedbackToRecall/passive 记录/feedback 工具注册,去掉 status.ts/doctor.ts 的 feedback 字段与测试,还原两处旧断言,即回到 3.x 状态;T1/L0/audit 数据不变(audit 中已有的 feedback 条目只是多出的 action 记录,不影响既有读取)。
