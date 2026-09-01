# xpi-memo 记忆体失效问题调研

> 调研日期:2026-09-01
> 状态:仅调研,未做任何修复/写库操作

## TL;DR

`xpi-memo`(Mnemosyne T1 记忆扩展)已正常注册并初始化,但**全部记忆表均为 0 条,从未成功写入任何记忆**,包括用户偏好。核心原因是 **CLI 与 MCP 扩展使用了不同的数据目录**,导致即使写入成功也无法通过 CLI 交叉验证;且所有 bank 库内容为空,写入链路疑似从未真正落盘。

## 一、可用工具盘点(agent 可直接调用的)

### MCP 工具(当前会话可用,共 4 个)
| 工具 | 说明 |
|---|---|
| `xpi_memo_remember` | 存储受治理的 T1 记忆(需证据路由) |
| `xpi_memo_recall` | 召回记忆(返回空,见失效问题) |
| `xpi_memo_forget` | 移除/取代记忆 |
| `xpi_memo_sleep` | 固化记忆(默认禁用,需显式授权) |

### Skill
- `memory-boundaries`(已注册于 available_skills)
  - 路径:`/Users/felix/.pi/agent/git/github.com/Coffelix2023/xpi-memo/skills/memory-boundaries/SKILL.md`
  - 定义 T1/L0/T2/T3 分层边界、写入/召回/sleep 策略

### CLI 命令
- `mnemosyne`(位于 `~/.local/bin/mnemosyne`,版本 3.15.1)
  - 支持:store / recall / update / delete / stats / sleep / diagnose / doctor / repair / export / import / bank list / reindex / backup / mcp 等
- 注意:CLI 无 `xpi-memo` 命令,只有 `mnemosyne`;`pi` 自身也无 memo 相关子命令

### 扩展源码位置
- `/Users/felix/.pi/agent/git/github.com/Coffelix2023/xpi-memo/`
- 关键文件:
  - `src/config.ts` — `DEFAULT_XPI_MEMO_CONFIG.dataDir = ~/.pi/agent/xpi-memo`(第 15 行)
  - `src/banks.ts` — bank 解析:global=`<dataDir>/mnemosyne.db`,project=`<dataDir>/banks/project-<id>/mnemosyne.db`
  - `src/index.ts` — MCP 工具注册、recall/search 后端链(mnemosyne → ripgrep → qmd)

## 二、数据目录拓扑(共 3 个相互独立的库)

| 路径 | inode | 大小 | 归属 | 记录数 |
|---|---|---|---|---|
| `~/.pi/agent/xpi-memo/mnemosyne.db` | 228430108 | 577KB | xpi-memo 扩展全局 bank(default) | 全部 0 |
| `~/.pi/agent/xpi-memo/banks/project-p-*.db`(6 个) | — | 577KB 各 | 各项目 bank(懒创建) | 全部 0 |
| `~/.hermes/mnemosyne/data/mnemosyne.db` | 225696958 | 995KB | CLI `mnemosyne` 默认库 | 全部 0 |
| `~/xpi-memo/mnemosyne.db` | 228426809 | 577KB | 疑似旧位置/备份 | 全部 0 |

注:`~/.pi/agent/xpi-memo/` 与 `~/xpi-memo/` 大小一致(577536B)但 inode 不同,疑为复制而非硬链接;两目录均有活跃 shm/wal 时间戳(21:21/21:23),说明 xpi-memo 扩展确实在写入,但写入的表均为空。

## 三、失效问题明细

### 1. CLI 与扩展数据目录不一致(最核心)
- xpi-memo 扩展默认读 `~/.pi/agent/xpi-memo/`(源码硬编码)
- `mnemosyne` CLI 却读 `~/.hermes/mnemosyne/data/`(独立库,`mnemosyne stats` 显示该路径)
- 结果:即使扩展写入成功,CLI 也查不到;`mnemosyne bank list` 只显示 `default`,看不到扩展的项目 bank
- 影响:CLI 无法作为扩展数据的诊断/交叉验证工具,除非指定同一 DB 路径或同步配置

### 2. 所有记忆表为 0 条(写入链路疑似失败)
- 直接 `sqlite3` 查库:`memories` / `working_memory` / `episodic_memory` / `memoria_preferences` / `memoria_persona` / `canonical_facts` / `consolidated_facts` / `memoria_facts` / `memoria_timelines` / `gists` / `memoria_instructions` 全部 0
- `xpi_memo_recall` 返回 `{"results":[],"queriedBanks":[],...}` — queriedBanks 为空数组,说明 recall 甚至未命中任何 bank(当前目录 `pi-work` 非 git 仓库 → projectBank=null,仅查 global bank)
- 审计佐证(已确认):`~/.pi/agent/xpi-memo/audit.json` 仅有 4 条 `recall` 记录,零条 `store`/`confirm` —— 从未发生受治理写入
- 可能原因待查:
  a) 写入需候选确认(auto-store 仅存明确稳定偏好/已验证事实;项目决策、歧义偏好需用户确认)——可能从未触发确认
  b) 写入路径有 bug
  c) 记忆确实从没被 remember 过

### 3. recall 返回空但 embedding 可用
- recall 返回 `embeddingAvailable: true, mode: hybrid, searchBackend: mnemosyne`
- 即检索基础设施正常,只是库无数据

## 四、下一步修复建议(供后续修改工具参考)

1. **统一数据目录**:确认扩展实际写入 `~/.pi/agent/xpi-memo/` 是否成功;若要 CLI 交叉验证,配置 CLI 指向同一 DB(`--db-path` 或修改 config)
2. **检查写入审计**:读 `~/.pi/agent/xpi-memo/audit.json`,确认是否有 store/confirm 事件
3. **试写验证**:用 `xpi_memo_remember` 存一条测试记忆,再用 sqlite3 直查确认是否落盘(本次未做,避免污染)
4. **清理冗余库**:`~/xpi-memo/` 与 `~/.hermes/mnemosyne/data/` 是否废弃需确认后处理
5. **skill/文档同步**:若修了数据路径,同步更新 `memory-boundaries` skill 与扩展 README

## 五、验证命令速查

```bash
# 库记录数(任一路径替换)
sqlite3 ~/.pi/agent/xpi-memo/mnemosyne.db "SELECT COUNT(*) FROM memories;"
# 全表统计
cd ~/.pi/agent/xpi-memo && for t in memories working_memory episodic_memory memoria_preferences memoria_persona canonical_facts consolidated_facts; do echo "$t: $(sqlite3 mnemosyne.db "SELECT COUNT(*) FROM $t;")"; done
# CLI 状态(注意读的是 hermes 库)
mnemosyne stats
# CLI doctor 只读报告
mnemosyne doctor --format markdown
# 扩展 audit 审计
cat ~/.pi/agent/xpi-memo/audit.json
```
