# 总结`xpi-memo-git-analysis.md`与`xpi-memo-test-report.md`的顾问评审结论
两份报告我读完了。先说结论：**这次实测最大的发现不是"非 git 不能用项目记忆"这个设计——那是有意的——而是它暴露了三个此前只在纸面上讨论、现在被实证放大的问题，其中最关键的一个是：整个"非 git 目录"场景恰好复现了 xpi-memo 最初的"零记忆稳态"，而你们的测试流程本身踩进了自己设计的治理陷阱。**

---

## 一、暴露的核心问题（按严重度排序）

### 🔴 P1：测试本身验证了"零记忆"根因，且流程上自证了治理缺陷

这是最值得注意的一点。报告 1 的实验 1 里，`global_preference` 从 `candidate_created` (position 21) 到 `candidate_confirmed` (position 22) 只隔了一条事件——**说明测试时直接走了"即存即确认"的最短路径**。但回顾我们之前对 xpi-memo 的诊断：正常 TUI 交互里，candidates 会堆在 `candidates.json` 里等用户确认 Store，而**非 TUI / 自动化场景里没人按确认键**。

你们这次的测试环境（Pi Coding Agent v0.84.4，非 TUI）**恰好就是那个"非 TUI 候选堆积"场景**。测试之所以能成功，是因为你们手动补了确认动作。这反向证明：**如果真实用户以 print/RPC 模式跑 pi，xpi-memo 依然会回到零记忆状态**——这个问题在 v1.0.0 里没有被根治，只是被测试者绕过了。

> 印证：报告 1 的"待验证"列表里明确有"测试激活循环 (activation loop) 的自动捕获"——说明自动捕获路径还没跑通，所有成功案例都是手动 remember。

### 🔴 P1：非 git 目录 = 记忆能力的"二等公民区"

实测数据很硬：

| 能力 | 非 git 目录 |
|---|---|
| 写 `global_*` | ✅ |
| 写 `project_*` / `session_context` | ❌ 全部报错 |
| recall | 只搜 `default` bank，**即使之前存过 project banks 也搜不到** |
| L0 事件 | 路由失败时**不记录任何失败事件**（报告 2 第 92-94 行） |

三个连带问题：

1. **`session_context` 被误绑到 project bank**——"当前会话上下文"本质上和 git 无关，把它和 `project_gene` 一起扔给 project bank 是设计错位。在非 git 目录里，连"记住这轮对话在干嘛"都做不到。
2. **错误信息说谎**——返回 `"Memory write failed."` 而不是 `"Project memory requires a git repository"`（报告 1 第 212 行自己点名了）。对 agent 来说，通用错误 = 无法自我修正，它只会反复重试同样的调用。
3. **失败不可观测**——路由阶段的失败不产生 `routing_decision` 或 `candidate_created` 事件，L0 事件溯源在这里断链。这意味着：**你没法从日志里统计"有多少记忆因为非 git 被丢弃"**，doctor 的 `WRITE_FAILED` 状态也覆盖不到这种前置失败。

### 🟡 P2：`scope: "global"` 标签与物理路由矛盾

报告 2 的路由表暴露了一个语义 bug：

| Kind | Target | Scope |
|---|---|---|
| `project_constraint` | project | **global** |
| `project_decision` | project | **global** |

物理上这些记忆存在 `project-{hash}/mnemosyne.db`，但元数据 scope 标成 `global`。这会导致：将来做"全局级召回排序"或"跨项目聚合"时，scope 字段无法信任。要么 scope 应该反映物理位置（project），要么路由表的设计意图需要重新澄清——目前的组合是**既隔离了又假装没隔离**。

### 🟡 P2：sleep / 合并功能形同虚设

实验 6 很直白：`xpi_memo_sleep(authorized=true)` 返回 `"dedicated-sleep-model-unsupported"`，原因是没配 `XPI_MEMO_SLEEP_MODEL`。问题不在"需要配置"，而在：

- **没有降级路径**——不配模型就完全不工作，没有"用当前会话模型凑合"或"只做机械合并不做语义合并"的 fallback；
- **配置缺口不在 doctor 覆盖范围**——`NEVER_CALLED/PENDING/WRITE_FAILED/RECALL_EMPTY` 四个状态没有一个是"功能因配置缺失而禁用"。这违反了你自己的可观测性设计原则。

### 🟢 P3：架构优点得到实测确认

公平地说，这次测试也验证了几个设计是对的：

- **物理隔离真实生效**：8 个 project banks + 1 个 global bank 各自独立 SQLite，无交叉污染；
- **项目身份稳定**：git common-dir hash 跨 worktree 共享，报告 1 第 91 行确认；
- **L0+audit 双写**：成功路径下事件链完整（candidate_created → confirmed → tool_result）。

---

## 二、问题之间的关联——一张图看清

```
非 git 目录
    │
    ├─→ resolveProjectIdentity() = null
    │       │
    │       ├─→ routeMemoryKind() throw ──→ 通用错误 "Memory write failed."
    │       │       │
    │       │       └─→ L0 无失败事件 ←── 不可观测，无法统计丢失率
    │       │
    │       └─→ context.projectBank = null
    │               │
    │               └─→ recall scope = "global" ──→ 只搜 default bank
    │                       │
    │                       └─→ 即使别的项目存过相关记忆也搜不到
    │
    └─→ 结果：非 git 目录 ≈ 只有全局记忆的"残血模式"
            │
            └─→ 但没有任何机制告诉用户/agent "你现在处于残血模式"
```

这和最初的"零记忆"是**同一族问题**：系统安静地降级，没人知道能力缺失了。

---

## 三、修复建议（并入之前的计划 v3）

| 优先级 | 动作 | 针对问题 |
|---|---|---|
| P0 | **路由失败也写 L0 事件**：`routing_rejected {kind, reason: "no-git"}`，doctor 增加 `ROUTING_REJECTED` 计数 | 失败不可观测 |
| P0 | **错误信息透传**：把 `"Project memory requires a recognized Git project"` 原样返回给 agent，不要吞成通用错误 | agent 无法自我修正 |
| P0 | **`session_context` 改路由到 global bank**（或独立的 ephemeral bank），与 git 解绑 | 设计错位 |
| P1 | **scope 字段语义修正**：project bank 里的记忆 scope 统一标 `project`；如需"跨项目可见"语义，新增 `visibility` 字段，不要复用 scope | 元数据矛盾 |
| P1 | **非 git 目录的 project 记忆降级策略**：要么 fallback 到 `global` bank 并打 `degraded: true` 标签，要么提供 `xpi_memo_init_project(path)` 让用户显式为非 git 目录建立身份 | 残血模式无提示 |
| P1 | **sleep 功能降级路径**：无专用模型时，允许 `XPI_MEMO_SLEEP_MODEL=session` 使用当前会话模型；doctor 增加 `SLEEP_DISABLED` 状态 | 功能形同虚设 |
| P2 | **激活循环（自动捕获）实测**——这是报告里最大的空白，也是"零记忆"问题的最终验收标准 | 自动记忆未验证 |

最后一点最关键：**这两份报告里所有的成功写入都是手动 `xpi_memo_remember`**。自动捕获（activation loop）至今没有一次成功实测。在"有价值捕获率 × 有效召回率"这个核心指标上，目前分子仍然是零。建议下一次测试专门在非 TUI、非 git 的"最差环境"里跑激活循环——那才是真实用户最容易待的地方。
