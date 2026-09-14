## Context

`forget` 的当前路径是：先经 `getMemoryById` 做存在性确认，而该实现把 hex 编号当作语义搜索 query 交给 `mnemosyne recall`，编号与正文零重叠，于是稳定返回 0 结果，删除从未发起。见 `proposal.md - Why`。

实施前已核实的上游事实（mnemosyne 3.15.1，`AxDSan/mnemosyne`）：

| 事实 | 位置 |
| --- | --- |
| CLI 有 `store` / `recall` / `update` / `delete` / `export` / `bank` …，**没有** `get` | `<site-packages>/mnemosyne/cli.py` 的 `COMMANDS` 字典 |
| `delete <id>` 直接调用 `mem.forget(id)`，**不做预读**，自带 not-found 判定 | `cli.py` 的 `cmd_delete` |
| Python core 有精确读取：`Memory.get(memory_id)`、模块级 `get(memory_id, bank=None)` | `core/memory.py` |
| bank 选择仍由 `MNEMOSYNE_BANK` 环境变量决定 | `cli.py` 的 `_resolve_bank_name` |

即："必须先精确读取"是本项目附加的约束，不是上游限制。

## Goals / Non-Goals

**Goals:**

- 让 `forget` 在缺少精确读取能力时仍然完成删除，恢复"用户能删"这一底线能力。
- 保持精确读取能力可用时的 recovery 前置流程，并把能力判定变成可诊断、可自动升级的运行时事实。
- 消除"能力缺失"与"拒绝删除"之间的错误绑定，同时不放松审计与 scope 语义。

**Non-Goals:**

- 不实现直接读取 Mnemosyne SQLite（schema 耦合，且既有变更已否决）。
- 不调用 mnemosyne 的 Python 环境（把跨语言环境路径引进 Node 扩展）。
- 不使用全库 `export` 扫描或语义 `recall` 代替精确读取。
- 不向上游提交补丁；只在文档中记录 follow-up。
- 不改动 `xpi_memo_forget` 的公共签名、bank 尝试顺序、候选生命周期或内容策略。

## Decisions

### D1: 能力缺失时执行删除，而不是拒绝

adapter 判定精确读取不可用时，删除路径直接调用 backend delete，把 backend 的 not-found 结果作为"目标不存在"的判定依据。

- **替代方案 A（保持 fail-closed，现状）**：否决。代价是删除功能在所有 bank 上不可用，实测 3/3 失败；这是记忆系统的底线需求，不是可接受的降级。
- **替代方案 B（SQLite 只读）**：否决。需要耦合上游表结构，且上一个变更已明确排除。
- **替代方案 C（调用 Python core 的 `get`）**：否决。要求 Node 扩展定位并驱动一个 Python 环境，路径与版本一变就失效，是把脆弱性引入删除路径。
- **替代方案 D（全库 `export` 扫描）**：否决。无界读取不能放在破坏性操作之前。

### D2: 能力判定做成运行时探测，结果进程内缓存

探测"adapter 是否具备稳定精确读取能力"（子命令存在性 + 输出可解析性），结果按进程缓存，风格与既有 `which` 缓存一致。判定结果进入 status / doctor 与 forget 的结果元数据。

- **替代方案：配置开关**。否决。用户不应该为了删除能用而理解 adapter 能力。
- **替代方案：每次调用现场试探**。否决。同一进程内重复探测没有新信息。

关键方向性：**探测失败必须落到"能力不可用，直接删除"，而不是"能力不确定，拒绝删除"**。fail-closed 的正确边界是"不伪造 recovery 成功"，不是"不删除"。

### D3: 无 recovery 时必须显式声明，且审计语义不变

能力不可用时的工具结果与 audit 都必须显式表达"未写 recovery"，禁止沉默。审计仍只在删除成功后记录 `memory-deleted-by-user`，并标明实际 bank；not-found 与 backend 失败都走失败路径。

### D4: 保留单参数兼容与 bank 顺序

`xpi_memo_forget(memoryId)` 签名不变；project bank → default bank 顺序不变，首次成功后停止。

## Risks / Trade-offs

- **删除不可恢复（无快照）** → 能力可用时自动回到 recovery 路径；工具结果显式标注 `recovery: none`；文档说明恢复只能依赖用户自身的备份或仓库导出。
- **上游将来加了 `get` 但输出格式不稳** → 探测必须验证输出可解析，解析失败按"不可用"处理（继续能删），而不是拒绝删除。
- **与既有 `memory-consistency` 的 recovery 要求冲突** → 已由本变更的 delta 显式改为能力门控，避免主 spec 与实现互相矛盾。
- **误删风险上升** → 这是本次取舍的核心代价：删除不再有前置存在性证明。缓解是 backend 自带 not-found 判定、审计完整、且恢复能力在上游支持后自动回归。

## Migration Plan

无数据迁移。

- 部署：单纯代码替换，无配置项改动。
- 回滚：revert 提交即回到 fail-closed 行为；已删除的记忆不受影响（本变更不改变删除的破坏性语义）。
- 文档同步：`TROUBLESHOOTING.md` 的 "Forget fails closed" 章节与 `docs/GUIDE.md` 的恢复章节必须同步新口径。

## Open Questions

- 上游是否已在未文档化的位置暴露精确读取命令：实施时对照 `COMMANDS` 字典核实一次。核实结果只影响探测实现，不影响本设计的路径分流。
