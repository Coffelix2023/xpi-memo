## Context

现状(动机见 proposal.md - Why):
- `src/index.ts` 的 `session_shutdown` handler 内 `await exportMarkdown({...})`,被 pi 宿主在会话切换流程中同步等待
- `scheduleAutoExport`(记忆写入触发的防抖导出)已是 fire-and-forget + 500ms 防抖模式,与本 change 目标形态一致
- `exportMarkdown` 内部:daily 文件按日 append(单文件 tmp+rename 原子写),`export-state.json` 在导出内容写完后落盘(tmp+rename),MEMORY.md projection 全量重读后整文件原子重写

约束:
- 不修改 `exportMarkdown` 的导出算法与产物格式
- 保持 "best-effort、失败静默" 的既有治理语义
- 仅一处调用点(`session_shutdown`),不引入新模块

## Goals / Non-Goals

**Goals:**
- 会话切换(`/new`/`/resume`/`/fork`)与进程退出不再等待导出完成
- 保持导出最终一致:进程存活时后台导出照常完成,进程死亡时下次导出收敛到正确状态

**Non-Goals:**
- 不处理 `before_agent_start` 等待启动召回的延迟(mnemosyne CLI ×2,~0.4-0.8s)——独立关注点
- 不重做 MEMORY.md projection 的全量重读算法(性能优化独立立项)
- 不为导出引入进程内队列/Worker/锁——现有并发面足够简单

## Decisions

### Decision 1: shutdown 处 fire-and-forget,不迁移调用点

**选择**: `session_shutdown` 中 `await exportMarkdown({...})` 改为 `void exportMarkdown({...}).catch(() => {})`,并留注释说明天花板。

**理由**:
- 一行改动,删除的是唯一的阻塞点,不动其他生命周期逻辑
- `scheduleAutoExport` 已验证 fire-and-forget 模式在本代码库可行(幂等、原子写)

**备选方案**:
- 方案 B: 复用 `scheduleAutoExport` 的防抖入口 → 防抖计时器在进程退出场景可能直接被丢弃,导出反而不执行;shutdown 场景应立即发起
- 方案 C: 把导出移到下一个会话的 `session_start` → 跨会话耦合,首会话(无前驱)需要特殊分支,复杂度更高
- 方案 D: 独立 Worker 线程 → 单次导出 ~0.5-2.2s、低频,worker 生命周期管理成本大于收益

### Decision 2: 立即发起,不加防抖

**选择**: shutdown 时直接发起导出,不经过 500ms 防抖。

**理由**: 防抖的目的是合并高频写入触发;shutdown 是每个会话至多一次的终点事件,防抖只会增加"进程已退出、导出从未启动"的概率。

**备选方案**:
- 方案 B: 与 `scheduleAutoExport` 共享防抖 → 见 Decision 1 方案 B

### Decision 3: 并发不加锁,接受重复导出

**选择**: shutdown 导出与 `scheduleAutoExport` 防抖导出可能并发,不做互斥。

**理由**:
- 两者的写目标均为原子写(tmp+rename),单文件粒度不会损坏
- `export-state.json` 最后落盘,并发交错的最坏结果是其中一次的 positions 被另一次覆盖 → 下次导出重做已导出事件,产物幂等
- 锁文件/互斥量是为不存在的损坏模式加防护(YAGNI)

**备选方案**:
- 方案 B: 进程内互斥(模块级 promise 链) → 需要跨调用点共享状态,为一个概率极低的重复导出增加同步代码

## Risks / Trade-offs

### Risk 1: 进程在导出中途退出,daily 日条目可能重复

**风险**: daily 文件先 append、`export-state.json` 后落盘;进程在两者之间死亡,下次导出从旧 position 重读并再次 append,当日文件出现重复条目。

**权衡**: 该窗口今天已存在(手动 kill、`scheduleAutoExport` 后台导出路径),本 change 仅轻微提高触发概率(导出不再被 await 完成)。MEMORY.md projection 为整文件原子重写,自愈无此问题。

**缓解**: 记录为已知天花板;若实际发生且影响使用,再立项"按 state 重写 daily"(独立 change),本轮不做。

### Risk 2: 用户感知不到导出失败

**权衡**: fire-and-forget 后导出失败完全静默。既有语义本就是"失败不影响会话"(spec 与实现一致),且 `exportMarkdown` 返回值当前也未被消费。不改。

## Migration Plan

**部署步骤**:
1. 合并后无需迁移:开关、数据、产物格式均不变
2. 观察:会话切换恢复即时;`markdown/daily/` 无异常增长(重复条目信号)

**回滚策略**:
- 单文件单处改动,git revert 即可
