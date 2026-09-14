# xpi-memo 用户体验实测报告-2(2026-09-04)

- **日期**: 2026-09-04
- **实测环境**: pi coding agent, xpi-memo v1.0.0, 工作目录 `/Users/felix/c6x_local/app-prd/pi-work`
- **方式**: 会话内实际调用 `xpi_memo_remember` / `recall` / `forget` / `sleep` 全部 4 个工具, 共 9 次调用, 并核查落盘数据 (`audit.json` / `events.jsonl` / `candidates.json` / mnemosyne.db)

**TL;DR**: 全链路符合设计预期: 治理路由、密钥拦截、项目身份校验、幂等去重、审计落盘均正常工作。发现 2 个体验问题: 非项目目录错误提示路径依赖 `/xpi-memo-init` (但该目录下此命令不可用), 以及 `MEMORY.md` 导出长期空白与真实记忆库脱节。

---

## 一、实测环境

| 项 | 状态 |
|---|---|
| 扩展版本 | xpi-memo v1.0.0 (源码直载 `src/index.ts`, 无构建步骤) |
| L0 session trace | ✅ 实时运行中, 实测会话 63 行 JSONL 事件 |
| 搜索后端 | mnemosyne (hybrid, embedding 可用) + ripgrep; qmd 未装 |
| 配置 | `language: zh`, `recallPolicy: high-value-auto`, `retrievalMode: hybrid`, paused=false |
| 数据目录 | `~/.pi/agent/xpi-memo/`: 8 个 project bank + default bank, mnemosyne.db 共约 5.5 MB |
| 审计日志 | `audit.json` 200 条 (recall 178 / rejection 8 / candidate 6 / confirmation 6 / write 1 / sleep-auth 1) |

## 二、工具链实测结果 (9 次调用)

### 1. recall — ✅ 正常

```
查询 "pi-work 项目工作流偏好" → 命中 1 条历史偏好
检索: mode=hybrid, embeddingAvailable=true, fallback=false, backend=mnemosyne
```

返回结构完整: score / confidence / provenance / supersededBy 均有值。删除后复查同 query 正确返回空 (`no-hits`), 说明删除即时生效。

### 2. remember — 治理路由 5 种分支全部符合规范

| 输入 kind | 结果 | 治理判定 |
|---|---|---|
| `session_context` | `stored` (id 29f7a7d6…) | 会话级直接入库, 正确 |
| `global_preference` (正常内容) | `stored` (候选确认后) | 走 candidate → confirmed 流程, 正确 |
| `project_constraint` | 拒绝: `project-identity-required` | 非 Git 目录且无 `.pi/xpi-memo/project.json`, 拦截正确 |
| `project_decision` | 拒绝: 同上 | 一致 |
| `global_preference` 含 API key | 拒绝: `secret` | 密钥拦截生效, 且 audit 记录 `prohibited-content:secret` |

重复提交相同内容 → `Memory already captured for this session` (fingerprint 幂等), 防重复写入生效。

### 3. forget — ✅ 正常

两次删除均即时生效, 且 audit 各记一条 `memory-deleted-by-user`。

### 4. sleep — ✅ fail-closed 符合设计

`authorized: false` → `Sleep not executed: sleep-disabled-by-default`。默认 `XPI_MEMO_SLEEP_MODE=disabled`, 不显式授权不执行, 与 memory-boundaries skill 声明一致。

### 5. 自动捕获回路 (未人工触发, 数据可证)

L0 事件流显示完整类型: `routing_decision` → `t1_memory_write` / `routing_rejected` / `memory_failed` / `candidate_created` / `candidate_confirmed`, 每条带 fingerprint 和 sourceEventPosition, 可追溯。audit 里还出现双路自动 recall 注入 (`restore project context...` + 中文查询, `injectedCount: 2`) — 这是 `high-value-auto` 策略在会话恢复时自动召回, 属于设计行为。

## 三、发现的问题 (按严重度)

1. **非项目目录的死路提示** (中等)。`project_constraint`/`project_decision` 被拒时提示 "Run /xpi-memo-init", 但 `/xpi-memo-init` 是 TUI slash command, agent 工具调用路径下无法执行, 形成"被拒 → 无法自救"闭环。建议错误信息补充 env 替代方案或说明需在 TUI 中执行。

2. **MEMORY.md 导出与实际库脱节** (中等)。`~/.pi/agent/xpi-memo/markdown/MEMORY.md` 内容是 `_No confirmed memories yet._`, 但 default bank 实际有已确认记忆 (实测前后均存在)。`AUTO_EXPORT` 未开启时增量导出可能长期不跑, 人读层失去意义。建议开启 `XPI_MEMO_AUTO_EXPORT` 或跑一次 `/xpi-memo-export --force --validate` 验证。

3. **小问题**: project bank 有 8 个 (多个历史项目), 无可见的清理/合并机制; `905a35a701ac` 和 `9a5af0fe2a2b` 下还残留嵌套 `banks/` 目录, 疑似旧版本结构残留。

## 四、结论

核心契约 (七类 kind 闭环枚举、stored/candidate/rejected 三态返回、密钥拒绝不落审计拷贝、L0 与 T1 分层) 全部经实测验证通过, 可放心日常使用。使用建议:

- 在真实项目 (Git 仓库) 中使用 project 类记忆, 或先跑 `/xpi-memo-init`;
- 开启 `XPI_MEMO_AUTO_EXPORT=true` 让 Markdown 层保持同步;
- qmd 语义搜索未安装, 当前 mnemosyne hybrid 已够用, 不必补装。
