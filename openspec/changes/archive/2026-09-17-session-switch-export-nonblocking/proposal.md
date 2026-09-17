## Why

pi 的 `/new`、`/resume`、`/fork` 生命周期(`session_before_switch → session_shutdown → session_start`)中,宿主会完整 `await` 旧会话的 `session_shutdown` handler(pi 源码 `agent-session-runtime.js:106`)。xpi-memo 的 shutdown handler 同步 `await exportMarkdown(...)`(`autoExport`/`l0Enabled` 默认均开启),把整个导出时长叠加进会话切换路径。实测:无增量导出约 520ms;会话含 `t1_memory_write`/`memory_deleted` 事件时触发 MEMORY.md projection 全量重读(1424 个 session、约 14.2 万条事件、61MB JSONL)约 2.2s,另有 mnemosyne CLI bank-state 读取约 400ms。结果是每次切换会话都要等待秒级卡顿。

## What Changes

- `src/index.ts` 的 `session_shutdown` handler 中,`await exportMarkdown(...)` 改为 fire-and-forget(`void exportMarkdown(...).catch(...)`)——导出在后台继续,不再阻塞会话切换与退出
- 主 spec `markdown-export` 的 "Automatic export on session end" requirement 相应修订:会话结束时导出改为"发起但不等待",并明确会话切换(`/new`/`/resume`/`/fork`)不得被导出延迟
- 并发语义确认:`exportMarkdown` 的 `export-state.json` 写入已有 tmp+rename 原子性,增量导出幂等,与 `scheduleAutoExport` 的防抖导出并发时最多重复导出一次,无数据损坏风险

不改变:
- 导出内容、增量算法、MEMORY.md projection 逻辑均不动
- "best-effort、失败不影响会话"的既有语义不变(失败静默吞掉,已有 catch)
- `before_agent_start` 等待启动召回(~0.4-0.8s,mnemosyne CLI ×2)的时序问题不在本 change 范围(记录为 Non-goal)

## Capabilities

### New Capabilities

(无)

### Modified Capabilities

- `markdown-export`: "Automatic export on session end" requirement 的时序语义从"shutdown 完成前完成导出"改为"shutdown 时发起、后台执行、不延迟会话切换",新增会话切换不被导出延迟的 scenario

## Impact

**直接影响**:
- `src/index.ts`:`session_shutdown` handler 一处,`await exportMarkdown({...})` → `void exportMarkdown({...}).catch(() => {})`,其余逻辑(offline extraction 分支、footer 清理)不动

**副作用**:
- 会话切换耗时从 0.5-2.2s+ 降为宿主自身开销,消除秒级卡顿
- 用户秒退(切换后立即关闭进程)时,后台导出可能未完成——增量状态未落盘,下次导出幂等重做,无数据丢失(事件源 JSONL 不受影响)
- 与 `scheduleAutoExport`(500ms 防抖 fire-and-forget)并发时,最多重复导出一次,结果幂等

**兼容性**:
- 向后兼容:`autoExport`/`l0Enabled` 开关语义不变,导出产物格式不变
- 无新依赖,无 API 变更
