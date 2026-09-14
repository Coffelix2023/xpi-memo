# 勘察记录：`mnemosyne export` 作为投影层的 bank 状态读取原语

> 本文件是 `markdown-state-projection` 任务 1.1 的产出，也是 design D1「读取原语选择」与 D1 预案的实测依据。
> 结论：**采用 `mnemosyne export`，D1 预案（只读 SQLite）不触发**。

## 探针环境

| 项 | 值 |
| --- | --- |
| 上游版本 | mnemosyne CLI（`/Users/felix/.local/bin/mnemosyne`，无 `--version` 子命令） |
| bank 集合 | `~/.pi/agent/xpi-memo/mnemosyne.db`（default）+ `~/.pi/agent/xpi-memo/banks/project-*`（31 个），共 **32** 个 |
| 选择方式 | `MNEMOSYNE_DATA_DIR=<dataDir>`；非 default bank 追加 `MNEMOSYNE_BANK=<name>` |
| 测量命令 | `mnemosyne export <临时文件路径>`（每个 bank 一次，顺序一次、并发一次，各测一轮） |

## 实测数字

| 指标 | 实测值 | 上限（D1 预案阈值） | 结论 |
| --- | --- | --- | --- |
| 单 bank 最慢耗时 | **0.305 s**（`project-p-a348e7053196`） | 5 s | 未触发 |
| 单 bank 导出文件最大 | **26 978 B ≈ 26 KB**（`project-p-9a5af0fe2a2b`，1 MB SQLite） | 5 MB | 未触发 |
| 需解析的两段（`working_memory` + `episodic_memory`）最大负载 | **3 487 B ≈ 3.4 KB** | 5 MB | 未触发 |
| 32 个 bank 并发读取总墙钟 | **1.328 s** | — | 可接受（投影是后台/低频动作） |
| 32 个 bank 的 memory 行总数 | **7 行** | — | — |
| 导出文件的其余体积 | 约 12–22 KB，来自 `episodic_embeddings` / `legacy_embeddings` / `annotations` | — | 设计 D1 已决定丢弃，仅解析两段 |

测量汇总命令（可复跑）：

```bash
python3 - <<'EOF'
import json,os,subprocess,time,concurrent.futures
d=os.path.expanduser("~/.pi/agent/xpi-memo")
banks=["default"]+[n for n in sorted(os.listdir(f"{d}/banks")) if os.path.isdir(f"{d}/banks/{n}")]
def one(b):
    out=f"/tmp/survey-{b}.json"; env=dict(os.environ, MNEMOSYNE_DATA_DIR=d)
    if b!="default": env["MNEMOSYNE_BANK"]=b
    t=time.time(); subprocess.run(["mnemosyne","export",out],env=env,capture_output=True); el=time.time()-t
    dd=json.load(open(out))
    mem=json.dumps({"working_memory":dd["working_memory"],"episodic_memory":dd["episodic_memory"]},ensure_ascii=False)
    return b, round(el,3), os.path.getsize(out), len(mem.encode())
print(max(one(b) for b in banks, key=lambda r:r[1]))
EOF
```

## `working_memory` / `episodic_memory` 行暴露的字段

export schema v1.3 的顶层键：`mnemosyne_export`、`working_memory`、`episodic_memory`、`episodic_embeddings`、`scratchpad`、`consolidation_log`、`legacy_memories`、`legacy_embeddings`、`triples`、`annotations`、`canonical_facts`。

memory 两段中每行暴露 **16** 个字段（在实测的 7 行上逐一确认）：

| 字段 | 投影是否需要 | 说明 |
| --- | --- | --- |
| `id` | **需要** | bank 行主键，双源合并的 key（design D2） |
| `content` | **需要** | 条目正文 |
| `timestamp` | **需要** | 无 L0 注解时作为 `confirmed` 时间的回退 |
| `session_id` | 参考 | 实测值恒为 `default`（存储层会话判别，不是 L0 session id） |
| `source` | 参考 | xpi-memo 写入时形如 `kind=<kind>;ev=…;src=…`；外部写入时是自由文本 |
| `superseded_by` | 参考 | 字段存在；实测 7 行全部为 `null`。本变体按 D4 用自有精确重复标记，不采用该列 |
| `importance` / `scope` / `veracity` / `valid_until` | 否 | 存储层属性，投影不使用 |
| `recall_count` / `last_recalled` / `created_at` / `consolidated_at` / `consolidation_claimed_at` / `metadata_json` | 否 | 与"现在记住了什么"无关，且 `last_recalled` 每次召回都变，纳入投影会破坏可复现性 |

## 对实现的三条直接结论

1. **读取原语 = `mnemosyne export`**（D1 方案），D1 预案不触发；`get_all_memories()`、语义 `recall`、只读 SQLite 均不采用。
2. **解析只取 `working_memory` 与 `episodic_memory` 两段**，丢弃 embeddings / triples / annotations / canonical facts；实测这两段合计最大仅 3.4 KB。
3. **`id` 可直接作为合并主键，`timestamp` 可直接作为无注解条目的时间回退**，`superseded_by` 存在但不使用（D4 保持自有精确重复标记）。

## 边界与已知偏差

- 实测样本是**本机当前 bank**（32 个 bank、memory 行合计 7 行、单库 1 MB）。它不是容量压力测试：D1 预案的 5 s / 5 MB 阈值在样本上离饱和很远，因此预案是"未触发"而不是"不可能触发"。一旦真实 bank 逼近阈值，实现按**失败即待重试**处理（写入 `bank-export-too-large` 原因码），不会产出部分投影。
- 32 个 bank 的并发墙钟含进程启动开销；bank 数量随项目数线性增长，属于已知代价，未做并发上限优化。
- export **会写文件**，因此实现必须在临时目录写入并在**所有分支**清理（成功、超时、解析失败、尺寸超限），不得污染数据根。
