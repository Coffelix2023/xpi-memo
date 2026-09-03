# xpi-memo 用户体验实测报告(2026-09-04)

**测试环境**:macOS · Pi Coding Agent v0.84.4 · xpi-memo **v1.0.0-16-g73e25d0**(含 gated Track B 提取)
**测试目录**:`/Users/felix/c6x_local/app-prd/pi-work`(**非 git 目录**,`/xpi-memo-init` 未初始化)
**测试方式**:真实调用 `xpi_memo_remember` / `xpi_memo_recall` / `xpi_memo_sleep`,逆向 SQLite 与 L0 事件流,对照 2026-09 社区最佳实践。

---

## TL;DR

**不满足 2026 年 9 月社区最佳实践。** 写入→检索最小闭环可用(手动 remember 能存、能查),但记忆体的核心价值链——自动捕获、跨会话复用、睡眠合并、长期可读视图——全部断链或未配置。

| 测试项 | 结果 | 证据 |
|---|---|---|
| `remember` 全局偏好 | ✅ | 写入→确认→gist 落库→recall 命中(score 0.47) |
| `remember` 项目记忆 | ❌ | 非 git 目录报 `no project identity`;无 `/xpi-memo-init` 时无法写入 |
| 跨会话 recall 旧记忆 | ❌ | 只查 default bank;project bank 5 条记忆搜不到 |
| `MEMORY.md` 长期视图 | ❌ | 8 条 confirmed,仍显示 `_No confirmed memories yet._` |
| 自动提取 (activation loop) | ❌ | 25887 条事件仅 8 个候选,**全部手动 remember**,0 自动捕获 |
| `sleep` 合并/遗忘 | ❌ | `sleep-mode-not-configured`,无降级路径 |
| L0 事件 `t1_memory_write` | ❌ | 源码 index.ts:946 有发射点,事件流里 **0 条** |

---

## 一、实测过程与数据

### 1. 写入闭环(手动路径)

```
remember(global_preference, "用户喜欢用 zsh…") → {"status":"stored"}
remember(project_decision, "pi-work 使用 xpi-superplan…") → ❌ "Memory could not be routed:
  This directory has no project identity. Run /xpi-memo-init to initialize a non-Git project…"
```

落库验证:

| 库 | gists | memories | fts_episodes | memory_embeddings |
|---|---|---|---|---|
| default bank | **3** | 1 | **0** | — |
| project-p-9a5af0fe2a2b | **5** | 0 | 0 | — |
| 其余 7 个 project bank | 0 | 0 | 0 | 0 |

`gists` 8 条(3 global + 5 project)与 8 条 `candidate_confirmed` 事件**一一对应**,说明确认→落库路径可用。

### 2. 检索

```
recall("中文回复 结论优先 偏好") → 命中刚写入的 global_preference (score 0.47)
recall("测试偏好 中文回复") → 只命中新写入的 1 条,09-02 的旧记忆搜不到
```

- `queriedBanks: ["default"]`,project bank 从不被查询(非 git 目录无 project identity 传入 recall context)。
- 注意:召回结果里 `kind:"global_preference"` 的旧记忆只有 1 条(gist_9dcb1 测试偏好)未被召回——默认库 3 条 gist 只召回 1 条,召回率存疑(内容相近的 3 条偏好仅 1 条返回)。

### 3. 事件流审计(25887 条)

```
tool_call 12788 · tool_result 12786 · user_message 374 · candidate_created 8
candidate_confirmed 8 · compaction 1 · routing_rejected 1 · t1_memory_write 0
```

**`t1_memory_write` 事件为 0**,但 `src/markdown-export/memory-generator.ts:66` 只认该事件类型生成 MEMORY.md —— 直接导致:

> MEMORY.md 显示 `_No confirmed memories yet._`,8 条已确认记忆对用户不可见。

### 4. 源码取证

- `src/index.ts:516` `chooseCandidateAction`:非 TUI mode 直接 `return "later"` —— **候选排队,无人确认**;
- `src/index.ts:946` `runtime.l0.record("t1_memory_write", …)`:存在发射点,但实际 store 路径未产生该事件(事件流为 0,而 gist 已落库)—— 确认/存储路径与 L0 事件发射**脱钩**;
- `src/markdown-export/memory-generator.ts:66`:仅消费 `t1_memory_write` 事件;
- `src/recall.ts:238-266`:recall 先查 project bank(存在时),再查 global;非 git 目录无 project bank → 只查 default。

### 5. sleep / 工具面

```
xpi_memo_sleep(authorized=true) → "Sleep not executed: sleep-mode-not-configured."
```

未配置 `XPI_MEMO_SLEEP_MODEL` 时**完全禁用**,无"机械合并"降级。

---

## 二、与社区最佳实践差距(2026-09 标准)

| 实践 | 社区现状 | xpi-memo 实测 |
|---|---|---|
| 自动提取 | Claude Code 2.1.59+ 默认 auto-memory;Mem0/LangMem 自动从对话抽取 | ❌ 0 自动捕获,全靠手动 remember |
| 分层记忆 | working/episodic/semantic 分层,episodic 存不可变时间戳事件 | ⚠️ 表结构在,`episodic_memory`/`memory_events` **全空** |
| 主动合并 | RecMem / LycheeMemory: recurrence/segment 级 consolidation | ❌ sleep 未配置即全禁用 |
| 遗忘与冲突修正 | ICML 2026 综述:遗忘是必要操作(频率衰减/去重/剪枝) | ⚠️ `supersededBy` 字段存在但从未触发(3 条重复偏好共存) |
| 检索分层 | 最近 tier 优先 + recency/frequency/relevance 评分 | ⚠️ 混合检索可用,但 project bank 记忆不可达 |
| 人类可读视图 | Claude Code MEMORY.md 启动即加载 | ❌ MEMORY.md 恒空,export 断链 |

---

## 三、结论

### 已确认可用的部分

1. **手动写入→确认→落库→检索**闭环真实可用(非 TUI 下全局偏好 1 次调用即 stored);
2. **物理隔离生效**:8 个 project bank + 1 个 default 各自独立 SQLite,无交叉污染;
3. **错误信息诚实**:非 git 目录返回具体原因(`no project identity`),优于 09-02 报告记录的通用 `Memory write failed.`(该问题已修复)。

### 核心断链(按优先级)

| 优先级 | 问题 | 影响 |
|---|---|---|
| P0 | `t1_memory_write` 事件缺失 → MEMORY.md 恒空 | 长期记忆对用户不可见,export 功能名存实亡 |
| P0 | activation loop 自动提取 0 命中 | 记忆体名存实亡,全靠手动 |
| P1 | project bank 记忆 recall 不可达(非 git 目录) | 跨项目复用失效 |
| P1 | sleep 无降级路径 | consolidation/遗忘功能需配置才能用 |
| P2 | 重复偏好未去重/合并 | supersededBy 机制空转 |

### 一句话

> **xpi-memo 当前是"手动便签本",不是"记忆体"。** 最小写入检索闭环成立,但自动提取、长期视图、合并遗忘三个记忆体的核心能力全部断链,与 2026-09 社区最佳实践差距显著。建议优先修复 P0 两条:确认路径补发 `t1_memory_write` 事件(最小改动),以及让 activation loop 真实产出候选。
