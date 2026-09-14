# 问题3
Q: 关于你的DesignDeck 4张slides的选型建议:
四张卡片逐一裁决。先说结论：**1、2、4 的推荐项都对，照选；第 3 张我推翻推荐，改选 2**。

## 1/4 MEMORY.md 数据源切换 —— 改选「方案 C（混合方案）」

卡片推荐的是 A（L0 事件剔除止血），**但按你自己 ai-memory 阶段的标准，C 才是最优**：

- **方案 A 的问题**：它把正确性寄托在"每个删除路径都要记得发 `memory_deleted` 事件"上——这和 forget 当初漏发事件的根因是同一个模式（调用点各自努力）。止血有效，但下一种变更（supersede、mechanical sleep 去重）又会漏一次。
- **方案 B 的问题**：一步到位切 bank 状态重建是对的终态，但现在切会让 ai-memory 接入前的闸门 A 工作量变大，且导出器要新写"从 bank 拉全量"的路径，测试面扩大。
- **方案 C 的正确性**：止血逻辑（`memory_deleted` 剔除）先修住当前缺陷，同时把"切换 bank 重建"写成显式 TODO 锚点进代码（截图里 C 的注释已经包含 L2 切换计划）。**关键是：C 的止血件不需要完美，因为它注定被 L2 的根治替换——这降低了本轮的验收风险，又没放弃终态。**

ai-memory 的闸门 A 要求的是"导出语义正确"，C 的止血版已经满足（已删除记忆不再出现在 MEMORY.md）；根治版随 L2 做，和"SQLite 可重建/Markdown 真相源"打包。**选 C，不选 A。**

## 2/4 Track B 验证 —— 选「立即启动真实验证」（推荐项正确）

这是连续三轮的空白项，**没有资格再延期**。配置里的预算参数（maxExecutionsPerSession: 1 / maxCharsPerSession: 5000）画得保守合理，符合"验证期间临时启用、默认保持关闭"的原则。选 1。

唯一补充：验证会话结束后**记得把 `enabled` 改回 `false`**——这是临时验证，不是默认开启。

## 3/4 孤儿 Bank 生命周期 —— 选「init --revoke 联动归档」

推荐项是"doctor 检测+提示"，**我改推荐 2**，理由：

- "仅检测"（选项 3）等于把上轮的问题原样留着——doctor 提示了但没人会定期跑 doctor 看一眼；
- "doctor 检测+提示"（选项 1/推荐）只完成了"看得见"，没完成"能处理"——用户看到提示后依然要手动 `rm -rf`，这正是上轮报告批评的"手动清理不可持续"；
- **选项 2 把处理动作收进已有的工具面**：`xpi_memo_init` 已经有工具了，加 `revoke` 参数让 agent/用户都能"撤销身份并归档 bank"，闭环完整。归档（重命名为 `banks/_archived/<bank>-<date>/`）而非删除，符合"不自动删历史数据"的铁律。

注意选项 2 的实现细节要做对一点：**revoke 只归档，不删除**；doctor 检测项可以随后补（不在本轮）。

## 4/4 ai-memory 接入准备 —— 选「关闭两个闸门后开工」（推荐项正确）

左图的流程画得对：闸门 A（导出层）+ 闸门 B（Track B 验证）→ 分支决定分工/接管 → 再写接入规格。右图"边修边接"的风险正是我之前警告的：把已删除记忆同步进跨 harness wiki，删除失效从本地瑕疵升级为跨工具泄漏。**选 1，不选 2。**

---

## 汇总（按这个顺序做）

| 顺序 | 决策卡 | 选择 |
|---|---|---|
| 1 | Track B 验证（2/4） | 选项 1：立即启动，临时启用 |
| 2 | MEMORY.md 数据源（1/4） | **选项 C（混合方案）**——推翻推荐 |
| 3 | 孤儿 Bank（3/4） | **选项 2（init --revoke 联动归档）**——推翻推荐 |
| 4 | ai-memory 接入（4/4） | 选项 1：闸门关闭后开工 |

执行顺序的微调：Track B 验证最先做（一次会话就有答案），它的结果决定 ai-memory 规格怎么写；MEMORY.md 用 C 方案止血（工作量最小）；孤儿 Bank revoke 和 MEMORY.md 根治都排进 L2 大包，不挤占本轮。

---

# 问题4
`xpi-memo`是构建在`mnemosyne`和`pi-memory`基础上的, 那么他们是如何解决当前这个困局的?
参考:
https://github.com/mnemosyne-oss/pi-mnemosyne(https://github.com/mnemosyne-oss/mnemosyne)
https://github.com/jayzeng/pi-memory

先查一下这两个项目当前的实际做法，再回答。
好问题——答案会让你松一口气，也会让你更确信自己的方向：**他们两个都没有"解决"这个困局，因为他们从架构上就绕开了它。你遇到的困局恰恰是你比他们多走的那段路（治理+证据链+多bank）所固有的代价。**逐层拆开说。

---

## 一、先看两个上游各自怎么"解"

### pi-memory：根本不治理，所以根本没有困局

pi-memory 的模型简单到没有困局可发生：

| 你的困局 | pi-memory 的答案 |
|---|---|
| 自动捕获 0 产出 | **不捕获**——没有 activation loop，全靠用户说"记住这个"（`memory_write` 显式调用） |
| 双闸门（agent调用+用户确认） | **无候选、无确认**——写了就写了，MEMORY.md 直接改 |
| MEMORY.md 删除不回溯 | **不存在这个问题**——`memory_forget` 直接编辑 Markdown 文件本体（Markdown 即真相源，不是投影），删除 = 从文件里删掉那段文本；恢复走 `recovery/<id>.json` 完整副本 |
| 注入语言错配 | **不查询注入**——默认 KV-cache 稳定快照：整个 MEMORY.md（截断到 4K）原样塞进 system prompt，不做检索，自然没有"查询和记忆语言不匹配"的问题 |
| Track B 生死 | **无 Track B**——唯一的 LLM 调用是退出摘要（exit summary），且可关 |

**pi-memory 的哲学：Markdown 文件就是全部，没有数据库、没有治理、没有自动捕获。** 它把"记忆"简化成了"agent 可读写的一个文本文件"，复杂度为零，困局为零，能力上限也为零。

### mnemosyne（pi-mnemosyne 扩展）：单层数据库，无治理

mnemosyne 是 SQLite 单库 + 语义检索，pi-mnemosyne 扩展只是五个薄工具（remember/recall/forget/stats/sleep）。它对困局的答案：

| 你的困局 | mnemosyne 的答案 |
|---|---|
| 自动捕获 | **不做**——capture 靠 agent 自己判断调 `mnemosyne_remember` |
| 治理/确认 | **没有**——remember 即入库 |
| 多 bank 路由/孤儿 bank | **单库**（bank 是 mnemosyne 内部的 namespace 概念，但没有你的 git-hash 项目身份层，没有 bank 生命周期问题） |
| MEMORY.md 投影 | **没有人读层**——SQLite 是唯一真相，没有 Markdown 投影，自然没有投影失真 |
| forget | 直接删 SQLite 行——**数据库即真相，删除即时生效，无投影要同步** |

---

## 二、结论：困局不是"没解"，是"你选了更难的题"

把三者摆在一起看就清楚了：

```
pi-memory:    Markdown 真相源 + 无治理 + 无自动捕获 + 无投影
mnemosyne:    SQLite 真相源  + 无治理 + 无自动捕获 + 无投影
xpi-memo:     SQLite 真相源  + 治理(候选/证据) + 自动捕获(Track B) + Markdown 投影 + 多 bank
              └── 你的每一个困局都精确对应你多出来的那一列
```

你的五个连环困局，每一个都能映射到你多做的那件事：

| 困局 | 根源组件 | 上游为什么没有 |
|---|---|---|
| 零记忆稳态 | 候选治理双闸门 | 它们没有治理 |
| 意图提取漏捕获 | 自动捕获（Track A/B） | 它们没有自动捕获 |
| MEMORY.md 恒空/不回溯 | Markdown 投影层 | pi-memory 的 Markdown 是本体不是投影；mnemosyne 没有人读层 |
| 孤儿 bank | 多 bank + git-hash 身份层 | mnemosyne 单库；pi-memory 单目录 |
| forget 投影失真 | "SQLite 真相 + L0 投影"双轨 | 它们都是单一真相源 |

**所以"他们如何解决"的真实答案是：他们通过不建造这些子系统来回避了这些困局。** 这不是讽刺——这是一个重要的架构启示：**你正在解决的问题（受治理的、有证据链的、可投影的、分层的记忆）在 pi 生态里没有人做过，这就是 xpi-memo 的存在理由，也是它每一步都要自己趟路的原因。**

## 三、但有两个上游的做法你现在就该吸收

**1. pi-memory 的 `memory_forget` 恢复设计。** 它不是"删除即消失"——forget 前把完整条目复制到 `recovery/<id>.json`，返回 recovery ID，`memory_restore` 可恢复。这正好补上你 forget 链路的最后一个缺口：现在你的 forget 删完就没了，audit 只记动作不记内容。**成本极低**：forget 时把行内容写进 `recovery/`，和你已有的 audit 纪律完全兼容。这比"delete 事件回溯"更能解决人读层信任问题——删除可恢复了，"已删条目滞留 MEMORY.md"的焦虑等级就降了。

**2. pi-memory 的 KV-cache 稳定快照策略。** 它把"何时让注入的记忆块字节级变化"做成了显式状态机（session_start / compact / long_term_write / day-rollover 四个刷新点，daily/scratchpad 写入故意不刷新）。你的注入层如果未来要在本地模型（llama.cpp/vLLM）上跑，这个快照设计直接决定 token 成本——**现在不看，等成本账单来就晚了**。

## 四、一句话总结

**mnemosyne 和 pi-memory 没有解决你的困局——它们通过停在"单真相源 + 无治理 + 无自动捕获"的安全区里，从未走进困局。你的困局是你比它们多要的每一样东西（治理、证据链、人读投影、多 bank、自动捕获）的入场费。这不是后退的理由，而是提醒：你多要的每一样东西，都必须自己把对应的子系统做到位，因为上游没有现成答案可抄——除了两个例外：pi-memory 的 forget 恢复设计和 KV-cache 快照状态机，这两个直接拿走。**
