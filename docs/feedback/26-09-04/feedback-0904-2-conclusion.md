# 针对`docs/feedback/26-09-04/feedback-0904-2.md`报告的评审意见

这份报告和前两份（9-04 上午的"手动便签本"报告、plan-update-0904-1）放在一起看，结论很明确：**证据链修复已实机生效，xpi-memo 从"手动便签本"毕业了——但毕业的同时，它暴露出两个"成年后的新问题"，其中一个（死路提示）是典型的"修好了 A 面、暴露了 B 面"**。逐项评审。

---

## 一、先确认这次验证了什么：上两轮手术全部成功

| 历史问题 | 本轮证据 | 状态 |
|---|---|---|
| forget 删不掉项目记忆（缺陷 A） | 两次删除即时生效，audit 有 `memory-deleted-by-user` | ✅ 根治 |
| recall 无 id（缺陷 C） | 删除后同 query 返回空，id 可用 | ✅ 根治 |
| `t1_memory_write` 事件缺失 | L0 事件流显示完整类型链，含 `t1_memory_write` | ✅ 根治——证据链闭合 |
| 注入查询英文错配 | audit 显示**双路注入**（英文模板 + 中文查询），`injectedCount: 2` | ✅ 多查询注入已上线 |
| 治理路由五种分支 | stored/candidate/rejected/project-identity-required/secret 拦截全部命中预期 | ✅ 含密钥拦截这种此前从未实测过的路径 |
| 幂等 | fingerprint 防重生效 | ✅ |

特别值得点名的是**密钥拦截实测**：含 API key 的内容被拒、audit 只记 `prohibited-content:secret` 不落内容拷贝——这条安全约束从"设计承诺"变成了"实测事实"，是记忆体可信度的基石。

**xpi-memo 的骨架和血肉现在都通了。** 从第一次实测的"零记忆稳态"到今天"九次调用全部符合设计预期"，四轮迭代走完了别的记忆工具一年走的路。

## 二、两个新问题的性质判断

### 问题 1（死路提示）：这是"修复的副作用"，不是新问题

仔细因果链：上一轮修复了"错误信息诚实化"（`Memory write failed.` → `project-identity-required`，附赠 `Run /xpi-memo-init` 指引）。但指引指向的是一个 **TUI slash command，而报错发生的场景是 agent 工具调用路径**——agent 收到这个错误后无法执行 slash command，用户如果在非 TUI 环境（RPC/print 模式）连输入 `/xpi-memo-init` 的地方都没有。

这正是我在 Papyrus 评估时提过的原则：**错误信息不仅要诚实，还要给接收者一条它能走的自救路径**。agent 收到的错误应该包含 agent 可执行的方案，用户可见的错误应该包含用户可执行的方案——两者混在一条字符串里，就是现在的死路。

**修复建议**（低成本，下个小版本）：
1. 错误响应结构化：`reason: project-identity-required` + `recovery: {tui: "/xpi-memo-init", cli: "echo '{...}' > .pi/xpi-memo/project.json", agent: "xpi_memo_init tool"}` 三通道；
2. 更彻底的做法：**给 xpi-memo 加一个 `xpi_memo_init` 工具**（agent 可调用，创建 `.pi/xpi-memo/project.json`），让 agent 在收到 `project-identity-required` 后能自主完成初始化——这才是"被拒 → 自救"闭环的正确形态。slash command 留给 TUI 用户，工具留给 agent。

### 问题 2（MEMORY.md 脱节）：验证了我上轮的一个担忧，且暴露了配置哲学的漏洞

上轮评审 plan-update-0904-1 时我要求补"存量 backfill"——本轮报告证实：`t1_memory_write` 事件链已修通，但 **MEMORY.md 依然空白，因为 `AUTO_EXPORT` 默认关闭**。

这里有一个设计哲学问题需要直说：**一个"人读层"视图默认不同步，等于不存在**。MEMORY.md 的价值定位是"用户随时打开就能看到记忆体记住了什么"——它是信任界面。用户不可能记得"每次写完记忆要跑一次 export"；于是实际体验就是"记忆体说存了 8 条，但 MEMORY.md 说一条都没有"——**这正是消耗信任的那种不一致**（类比：第一次实测里"候选静默堆积"）。

**修复建议**：
1. **`XPI_MEMO_AUTO_EXPORT` 默认改为 true**——导出是纯本地、确定性、低成本操作（从 L0 派生 Markdown），没有理由默认关闭。fail-closed 的原则适用于"对外有副作用"的操作（sleep 调 LLM、Track B 烧 token），不适用于"把本地数据换个人读的格式写出来"。**建议把默认值的判断标准明确写进设计原则：凡本地确定性操作默认开启，凡消耗外部资源/不可逆操作默认关闭。**
2. **触发点挂在确认路径上**：每次 `t1_memory_write` 成功后增量更新 MEMORY.md（或 debounce 到 session 边界批量更新）——这就是上轮 plan 里"导出由 L0 派生，不在确认路径直接编辑"的正确落地：不直接编辑，但**事件驱动导出**。
3. 存量 backfill 仍然要做（上轮评审条件 2），本轮报告再次证实它没发生。

### 问题 3（bank 残留目录）：低优先级，但记入 doctor

8 个 project bank + 嵌套 `banks/` 残留——这是历史版本迁移的化石。处理原则沿用既有约束"不自动删除历史数据"：doctor 增加 `orphan_bank` / `legacy_structure` 提示项（上轮已建议），清理动作永远是用户显式触发。

## 三、本次报告的两个测量盲点（下次实测要补）

公平地指出这份报告没覆盖到的——不是批评，是为了下轮更准：

1. **自动捕获仍然是黑箱**。报告 §5 标题是"自动捕获回路"，但内容只验证了"手动 remember 的事件链完整"和"recall 注入发生了"——**25887 事件 0 自动捕获（上轮数据）之后，本轮没有任何关于 Track B / activation loop 真实产出的数据**。止损线的三个条件（证据链闭合 ✅ / 自动捕获产出 ❓ / MEMORY.md 非空 ❌）目前只确认了一条。**下一轮实测的核心议程必须是 Track B：开 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true`，跑一个真实会话，验证 shutdown 边界是否真的产出候选、五态诊断是否可见。**
2. **注入质量未验证**。`injectedCount: 2` 证明注入发生了，但没验证注入的内容是否与会话相关——双查询修好后，召回的相关性（而非召回率）成为下一个未知数。

## 四、当前状态全景与下一步排序

```
写入链 ✅（含密钥拦截、幂等、治理路由）
删除链 ✅
证据链 ✅（t1_memory_write 贯通）
注入链 ⚠️（双查询已通，质量未验证）
人读层 ❌（MEMORY.md 脱节 = 信任界面缺失）
自动捕获 ❓（Track B 从未被真实验证）
sleep   🔒（fail-closed 正常，mechanical 待落地）
```

**下一步优先级排序**：

| 优先级 | 事项 | 理由 |
|---|---|---|
| P0 | Track B 真实验证（开启 → 跑会话 → 验证候选产出 + 五态诊断） | 止损线的最后一块拼图；如果 Track B 管道是坏的，越早知道越好 |
| P0 | AUTO_EXPORT 默认 true + 事件驱动导出 + 存量 backfill | 人读层是信任界面，当前状态在消耗信任 |
| P1 | `xpi_memo_init` 工具化（agent 可自救） | 死路提示在非 TUI 场景是硬阻塞 |
| P1 | 注入相关性验证（真实会话中注入内容 vs 会话主题） | 召回"有"之后的下一个问题是召回"对" |
| P2 | doctor 增加 `orphan_bank` / `legacy_structure` | 运维卫生 |

## 五、一句话总结

**xpi-memo 的"管道工程"已经完工——写、删、查、审计、拦截、注入全部实测通过；现在欠的是最后两米：让人读层自动反映真相（而不是等用户记得按开关），以及证明 Track B 真的能在无人干预时产出一个候选。前者是默认值的哲学修正，后者是这个记忆体是否配得上"自动"二字的最终审判。下轮实测如果 Track B 产出为零，按计划启动 ai-memory 外挂评估——这是我们说好的纪律。**
