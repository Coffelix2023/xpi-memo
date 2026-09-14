# xpi-memo 记忆体模拟运行体验报告

> 测试时间: 2026-09-06 · 测试目录: `/Users/felix/c6x_local/app-prd/pi-work` (非 Git 目录) · 测试者: 模拟用户 (agent 驱动)
> 方法: 阅读 README/GUIDE/SKILL 文档后, 用真实 `xpi_memo_*` 工具按典型用户路径全流程走一遍, 每步核对 T1 银行 (mnemosyne.db)、L0 事件日志、Markdown 导出三层落盘结果。

## 体验摘要

```
实测路径: init → remember (3 种 kind) → recall (4 次) → forget → sleep → show_injected, 每步核对 T1 银行、L0
日志、Markdown 导出三层落盘。

跑通的部分 (11 步中 9 步符合文档):

- recall 命中精准， 元数据完整 (kind/scope/provenance/safety)
- 非 Git 目录路由拒绝 (routing_rejected) 提示可执行， init 后 identity p-8272b2d1ddac 正常建立
- mnemosyne hybrid 搜索正常， 项目库/全局库路由正确
- sleep 默认 fail-closed, 返回 sleep-mode-not-configured, 无副作用
- L0 治理事件链完整可审计 (3 write + 3 confirm + 1 reject)

2 个 P0 缺陷:

1. forget 全灭: 3 个删除请求全失败。根因是 getMemoryById 把 hex id 当语义搜索 query 去 recall, 零重叠必落空 —
   删除从未发起。手动 CLI 同 env 可删， 佐证是封装层设计缺陷， 影响所有项目的删除操作。
2. 秘钥分层不一致 (测试用假 key): T1 银行打码成 [REDACTED] ✅, 但 L0 与导出的 MEMORY.md/daily 日志明文落盘 ⚠️
   — 与 GUIDE.md 的导出隐私声明冲突。根因： SECRET_PATTERN 只认 ASCII 赋值式 (api_key:), 中文"是"绕过分类。

1 个 P1: project_decision 的 Store/Later/Reject 审核在默认 confirmStore=false 下自动 store, L0 显示 candidate
创建与确认同秒成对 — SKILL.md 的审核承诺实际未生效。

收尾: identity 文件已回滚、T1 测试数据经 CLI 删除、MEMORY.md 已清理； L0 追加日志按设计未动 (假 key, 无真实泄
露)。

报告含逐条根因定位 (源码行号) 与最小 diff 修复建议， 可直接提给 xpi-memo 仓库。
```

## TL;DR

**整体架构成熟、可观测性一流, 但有 2 个 P0 级缺陷**: `forget` (删除) 工具结构性不可用, 以及秘钥治理的"L0/导出层明文残留"。所有会话内成功路径 (store / recall / 路由 / 打码) 表现符合甚至优于文档描述; 问题集中在治理承诺与默认行为的偏差上。

## 测试矩阵

| 步骤 | 操作 | 预期 (据文档) | 实际结果 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `recall` 全局偏好 | 返回既有全局记忆 | 命中 9月4日存入的偏好, score 0.47, 元数据完整 (kind/scope/bank/provenance) | ✅ |
| 2 | `remember` `global_preference` | `stored` | `{"status":"stored"}`, 字段名却叫 `candidateId` | ✅ (命名瑕疵) |
| 3 | 非 Git 目录写 `project_decision` | `routing_rejected` + 指引 | 拒绝并提示 `/xpi-memo-init`, 内容未误入全局库 | ✅ |
| 4 | `xpi_memo_init` | 生成 `.pi/xpi-memo/project.json` | identity `p-8272b2d1ddac` 创建, 重试后同一条 decision 直接 `stored` | ✅ (但见发现 #2) |
| 5 | 写入含明文 API key 内容 | content policy `rejected` | T1 层打码为 `[REDACTED]`, 但 L0 与导出 Markdown 明文残留 | ⚠️ (见发现 #1) |
| 6 | `recall` 项目记忆 | 项目库优先 | 正确路由 `project-p-8272b2d1ddac` + `default` 双库, 项目命中排前 | ✅ |
| 7 | `forget` 三条测试记忆 | 删除成功 | **三个 id 全部 "Memory deletion failed."** | ❌ P0 |
| 8 | 手动 `mnemosyne delete` 复刻 | — | 同样的 env (`MNEMOSYNE_BANK`), 删除全部成功 | ❌ 佐证 P0 |
| 9 | `sleep authorized=true` | 未配置时明确拒绝 | `sleep-mode-not-configured`, 无副作用 | ✅ |
| 10 | `show_injected` | 无注入时返回空 | `injected: []`, 带 policyVersion, 结构清晰 | ✅ |
| 11 | 收尾清理 | — | identity 文件删除、T1 三条经 CLI 删除、MEMORY.md 清理 | ✅ |

会话 L0 落盘统计: `memory_injected:1, tool_call:52, tool_result:51, candidate_created:3, t1_memory_write:3, candidate_confirmed:3, routing_rejected:1` — 治理链事件完整可审计。

## P0 发现

### #1 `xpi_memo_forget` 结构性不可用 (所有删除请求必失败)

**现象**: 对 3 个不同银行/类型的 id 调 `forget`, 全部返回 "Memory deletion failed."; 同一 id 用 `MNEMOSYNE_DATA_DIR=<数据根> mnemosyne delete <id>` 直接成功。

**根因** (源码定位): `xpi_memo_forget` 删除前先经 `getMemoryById` 确认记忆存在 (`src/index.ts:2871`), 而它的实现是把 **id 当作语义搜索的 query** 去 `recall <id> --json` (`src/banks.ts:155-167`)。16 位 hex id 与中文正文零词法/零语义重叠, 召回 `kept_count: 0` → 判定 `memory-not-found` → 删除从未发起。这是一个设计缺陷, 不是环境故障, 影响**所有**项目的所有删除操作。

**连带后果**: 用户没有任何 in-session 的删除途径 (TUI Pending 审核只管 candidate, 不管已入库记忆)。隐私数据一旦写入, 只能去 shell 手敲 CLI。

**修复建议** (最小 diff): `getMemoryById` 增加一条按 id 直查路径 (mnemosyne CLI 增加 `get <id>` 或按 id 过滤的导出), recall 语义搜索只作为 fallback; 或 `forget` 允许跳过存在性检查直接 `delete`, 由后端返回 not-found。

### #2 秘钥治理分层不一致: T1 打码, L0/导出明文

**现象**: 写入 `"我的 API key 是 sk-proj-abc123def456 记住它方便下次用"`:

| 层 | 结果 |
| --- | --- |
| T1 银行 (mnemosyne.db) | 未入明文, recall 输出为 `[REDACTED]` ✅ |
| L0 `events.jsonl` | **明文完整落盘** (`t1_memory_write` 事件) ⚠️ |
| `markdown/MEMORY.md` 导出 | **明文进入 Constraints 小节** ⚠️ |
| `markdown/daily/2026-09-06.md` | 工具调用行**明文重复出现** ⚠️ |

**根因**: `content-policy.ts` 的 `SECRET_PATTERN` 只匹配 ASCII 赋值式 (`api_key[:=]`), 中文"是"绕过分类; 但 `redactCredentials` 的 `PREFIXED_TOKEN_PATTERN` (`sk-[\w-]{8,}`) 在 **store 路径**无条件打码, 所以 T1 干净。L0 是"无损会话日志"按设计记录原文, Markdown 导出从 L0 派生时未重新过 content policy — 与 GUIDE.md "privacy: content policy blocks prohibited content" 的导出声明冲突。

**实际风险**: 假如用户真的说了"我的 key 是 xxx", 秘钥会明文留在机器上三处可 grep 的文件里。`~/.pi/agent/xpi-memo/` 默认 0600 权限部分缓解 (目录实测 600/700), 但 git-friendly 的 MEMORY.md 若被用户误入版本库, 泄露面即刻放大。

**修复建议**:
1. `SECRET_PATTERN` 补充无赋值符的模式: `(api[_-]?key|token|secret|密码|密钥)\s*(?:[=:是]|of)\s*` 及中文"密钥/令牌/密码"关键词。
2. L0 记录 `t1_memory_write` 时对 content 字段先过 `redactCredentials` (L0 其余事件保持无损, 边界仍清晰)。
3. 导出器对进入 `.md` 的每行正文统一跑 `redactCredentials` — 一处函数三处复用。

## P1 发现

### #3 candidate 确认流程在默认配置下形同虚设

`chooseCandidateAction` (`src/index.ts:615-618`): `ctx.mode !== "tui"` 返回 `"later"`; 非阻塞会话里 `confirmStore=false` (默认) 时**直接返回 `"store"` 自动入库**。L0 证实: 3 条 `candidate_created` 与 3 条 `candidate_confirmed` 同秒成对出现, 无任何等待窗口。`project_decision` / `project_constraint` 的 "Store / Later / Reject" 审核承诺 (SKILL.md 明文) 实际只对 TUI 手动审核路径成立。

**建议**: 文档如实标注 "默认自动入库, `XPI_MEMO_CONFIRM_STORE=true` 开启审核"; 或对 `project_decision`/`project_constraint` 这两个 review-required kind 保持 candidate 挂起, 不受 `confirmStore` 默认值影响。

## 次要观察

- `stored` 结果的字段名是 `candidateId` — status 与字段名语义打架, 建议成功路径改叫 `memoryId`。
- L0 追加日志按设计保留明文历史, 本次测试在 `daily/2026-09-06.md` 留下的测试秘钥残迹属于该设计, 未做篡改, 仅在 T1/导出层完成清理。
- 正面体验: `routing_rejected` 的提示语可直接执行; recall 元数据 (supersededBy/provenance/safety) 对下游 agent 非常友好; 所有失败路径都有机器可读 reason; sleep 默认 fail-closed 设计正确。
- 搜索后端: mnemosyne hybrid (vector+FTS5) 正常, embedding 可用, 无降级。

## 结论

核心链路 (捕获→路由→打码→召回→注入) 工程质量高, 治理事件链完整, 观测性在同类扩展里属第一梯队。但 **#1 让"被遗忘权"完全失效** (这是记忆系统的硬需求), **#2/#3 让治理承诺与真实行为有偏差**。建议优先修 #1 (一个函数的直查路径) 与 #2 的导出层 redaction (一个函数的复用), 两者都是小 diff 高收益; #3 先修文档口径即可止血。

---

## 架构师对本次结论的评审建议

## 审核意见：报告质量过关，三个发现全部成立——但按"不过度设计/不过度防御"的标准，我要修正它的修复方案

### 总体判断

这份报告是七轮以来质量最高的一次：非 Git 目录、手动 CLI 对照复现、L0/T1/导出三层逐层核对、根因到行号。它的结论我全部采信。**xpi-memo 的核心链路（捕获→路由→召回→注入）可以认为已经过了 alpha 线**——这是第一次有报告证明注入、路由、打码在真实路径上全部工作。

### 对三个发现的裁决

**#1 forget 全灭——确认为 P0，但报告的修复建议要改方向**

这个 bug 就是上一轮 review 里 P1 `getMemoryById` 的实锤版——我当时说"SQLite 主键直读"，现在报告再次用"recall 语义搜索当主键查询必落空"证明了同一点。不再重复。

报告给的备选方案"forget 跳过存在性检查直接 delete"**不要采纳**——forget 前确认存在性是为了 forget-recovery（先快照再删），跳过检查等于放弃你刚建的恢复能力。正解就一个：**`getMemoryById` 改 SQLite 直读**（better-sqlite3 只读 `WHERE id = ?`），一个函数，半天。不要开旁路。

**#2 秘钥分层不一致——确认为 P0，但按"不过度防御"砍掉 1/3 的修复面**

报告的三个修复点，我只批准两个半：

- ✅ **导出器统一过 `redactCredentials`**——必须做。MEMORY.md 是 git-friendly 文件，明文 key 进版本库是真实泄露面，一个函数复用，最小 diff。
- ✅ **L0 的 `t1_memory_write` content 过 redactCredentials**——做。L0 是审计证据，脱敏不损害其证据价值（审计只需要"写过一条记忆"，不需要"内容原文"）。
- ⚠️ **SECRET_PATTERN 补中文模式——只做最小补丁，不要追求完备**。补 `sk-[a-zA-Z0-9-_]{8,}` 这类** token 形态本身**的模式（不依赖中文关键词），因为 `sk-proj-...` 无论用什么语言包装都长一个样。不要去枚举"是/为/叫/：是"等中文句式——那是正则军备竞赛，永远补不完，这违背"不过度防御"。记住：**token 有形状，语言没有边界**。

**#3 candidate 审核形同虚设——确认为 P1，只修文档，不改行为**

这是我最坚持"不过度设计"的一条。报告建议"对 review-required kind 保持挂起"，**不要改**——那等于给非 TUI 路径（agent 自主运行）强行加一个人工卡点，直接破坏 pi 的 headless 场景。默认 `confirmStore=false` 自动入库是**合理的默认**（jcode/Prime Agent 都是这么做的），错的是 SKILL.md 承诺了审核。所以：**只改文档**，写清"默认自动入库，`XPI_MEMO_CONFIRM_STORE=true` 开启 TUI 审核"。一行文档修复，零代码风险。

### 次要观察的处理

- `stored` 返回字段名 `candidateId` vs 语义打架——改成 `memoryId`，一行，顺手做。
- L0 保留明文历史是设计使然——确认，不改。

### 对执行序的最终影响（在原计划上打补丁）

| 原计划 | 本次插入 |
|---|---|
| Day 1-2: 关闭 fast-fix（双写回滚/三段式、getMemoryById 改 SQLite 直读、分页契约） | ✅ 不变，getMemoryById 恰好覆盖 #1 |
| Day 3-4: 闸门 A（MEMORY.md 方案 C + forget 回补） | ✅ 不变，导出器 redactCredentials 顺路加进闸门 A |
| Day 5-7: 闸门 B（Track B ≥10 会话） | ✅ 不变 |
| Day 8: 裁决点 | ✅ 不变 |

**新增三件小事（各 < 半天，不占独立天数）：**
1. `getMemoryById` 直读（已在 Day 1-2）
2. 导出器 + L0 `t1_memory_write` 过 redactCredentials（进 Day 3-4）
3. SKILL.md 文档口径修正（进 Day 3-4）

### 一句话

这份报告证明 xpi-memo 已经过了"能跑"的阶段，现在的坑全在"治理承诺与默认行为的偏差"上——这恰恰是它作为治理层的价值所在。三个修复全是我此前已给方向的最小 diff 版，**没有改变 Day 8 裁决结构，没有引入 ai-memory，没有新增组件**。按这个节奏，闸门 A 收口时 xpi-memo 就可以进入"可内测"状态。
