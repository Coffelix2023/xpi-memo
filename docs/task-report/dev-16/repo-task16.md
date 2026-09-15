# Task Report: evolve-memory-runtime task 3.x(续轮)

## 完成范围

本次完成 Section 3(Preference profile projection)全部 4 个任务,进度从 6/21 推进到 10/21。

### 目的

用户的显式偏好目前以离散记忆行存储,Agent 需要逐一召回才能使用。本节把 governed global_preference / global_workflow 记忆提升为可追溯、可纠正、有界的派生画像(Profile),在用户纠正后旧值自动退出注入,而历史证据永不丢失。

### 作用与特点

- **确定性投影**:同一组 T1 行两次投影结果完全一致(内容 key 哈希 + 确定性排序)。
- **零新存储**:profile.ts 是纯函数模块;输入是 recall 形状的行,输出带 sourceRef 指回 T1 行。没有第二个事实库,没有 ungoverned 编辑路径。
- **关系语义**:supersededBy 链接使旧值标记为 superseded 并退出注入;同 key 重复行标记 conflict 且两侧来源都保留;不静默选边。
- **不可变证据**:投影只读,历史行永不修改(测试断言 JSON 快照不变)。

### 边界

- 冲突检测按相同内容 key;语义级矛盾(不同文本互斥)需要显式纠正(4.x)驱动。
- session_context / project_* kinds 不参与 global Profile 投影;session/task 级临时要求天然不覆盖 global 值(scope 隔离沿用现有 routing)。

## 各任务实现要点

| 任务 | 实现 |
|------|------|
| 3.1 确定性投影 | `src/profile.ts` `projectProfile`:scope eligibility → superseded 排除 → conflict 标记 → kind 权重排序 → item(12)/summary(120 字符)预算;`meta` 报告 conflicts/pending/superseded/omittedOverBudget |
| 3.2 关系处理 | supersededBy 单链为"纠正"不是冲突;同 key 重复为 conflict,conflictsWith 保留另一侧 id;被省略项经 status/meta 可诊断 |
| 3.3 有界注入 | `renderProfileInjection`:仅 active 项,700 字符硬预算,`<user-preference-profile>` 包裹;挂在 `recallForContext` 自动注入路径,与 recall 块拼接 |
| 3.4 治理复用 | Profile 无写路径;唯一输入是现有 governed recall 行,写入/删除/候选仍走 remember/forget/candidate 流程 |

## 验证

- `pnpm typecheck` ✓
- `pnpm -w run lint` ✓ 0 warning
- `pnpm test` ✓ 725 passed(新增 `profile.test.ts` 12 条)

## 修复过程中的一个真 bug

初版把"被指向的赢家"也标成 superseded(supersededIds 按 id 反查误伤),导致纠正后新旧值全部退出注入。已改为仅当行自身的 supersededBy 链接存在时才标记,并补测试锁定。

## 回滚

删除 `src/profile.ts`、还原 `recallForContext` 的 profile 拼接与 import 即回到 2.x 状态;T1/L0 数据与既有工具行为不变。
