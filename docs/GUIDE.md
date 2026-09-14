# xpi-memo Recovery Guide

## `forget` 的能力分流

`xpi_memo_forget` 只接受真实 T1 memory ID。adapter 是否具备**稳定的精确 ID 读取能力**决定删除走哪条路；判定结果是运行时事实，可用 `/xpi-memo-status` 的 `exactIdRead` 字段查看：

| `exactIdRead.available` | 删除路径 | 工具结果 |
| --- | --- | --- |
| `true` | 精确读取 → 写 recovery 快照 → `delete` | `status: deleted` + `recoverySnapshot: written` + `recoveryId` + 实际 `bank` |
| `false` | 直接 `delete`（由 backend 的 not-found 结果判定目标是否存在） | `status: deleted` + `recoverySnapshot: none` + 实际 `bank`，或 `status: error` |

两种情况下都不使用语义 `recall`、全库 `export` 扫描或 SQLite 直接访问来代替精确读取；删除顺序始终是 project bank → default bank，首次成功后停止。

当前 Mnemosyne CLI（3.15.1）没有按 ID 读取的子命令，所以 `exactIdRead.available` 为 `false`：**删除照常执行，但不会生成 recovery 文件**。上游接出精确读取命令后，能力探测会自动转为可用，删除自动回到“先快照再删除”，无需改配置。

为什么删除动作的精度可以交给 backend：`mnemosyne delete <id>` 自身不做预读，并对不存在的 ID 返回 `Memory not found: <id>`，因此“该 bank 没有目标”由 backend 判定，xpi-memo 不额外发明一项前置条件。

## 恢复已删除的记忆

`xpi_memo_forget` 会在删除前把完整 T1 条目写入：

```text
<dataDir>/recovery/<memoryId>-<timestamp>.json
```

工具成功返回的 `recoveryId` 就是文件名（不含 `.json`）。Recovery 文件永久保留，用户确认恢复完成后可手动删除；xpi-memo 不会自动清理或自动恢复它们。

恢复步骤：

1. 查看工具返回的 `recoveryId`，打开对应 JSON 文件。
2. 核对 `memory.content`、`memory.kind`、`memory.scope`、`memory.bank` 和 `memory.source`。
3. 使用已安装的 `mnemosyne` CLI，将 `memory.content` 作为新的记忆写回 `memory.bank`。恢复是一次新的受治理写入，不会复用旧 ID；写入前请重新检查内容，不要把 recovery 文件中的敏感内容复制到日志或提交中。
4. 确认新记忆可 recall 后，再按需删除 recovery 文件。

示例（先人工检查输出，再执行写入）：

```bash
RECOVERY="$XPI_MEMO_DATA_DIR/recovery/<recoveryId>.json"
jq '.memory | {bank, kind, scope, content}' "$RECOVERY"
export MNEMOSYNE_DATA_DIR="${XPI_MEMO_DATA_DIR:-$HOME/.pi/agent/xpi-memo}"
export MNEMOSYNE_BANK="$(jq -r '.memory.bank' "$RECOVERY")"
mnemosyne store "$(jq -r '.memory.content' "$RECOVERY")" \
  "$(jq -r '.memory.source // "recovery"' "$RECOVERY")" \
  "0.8"
```

`XPI_MEMO_DATA_DIR` 未设置时使用默认目录 `~/.pi/agent/xpi-memo`。如果原记忆属于全局 bank，省略 `--bank`；如果属于项目 bank，保留 recovery 文件中的 bank 名称。恢复命令需要 `jq` 和 `mnemosyne` CLI。

`recoverySnapshot: none`（能力不可用）时没有快照可读：此时没有自动恢复路径，只能依赖你自己的备份、仓库 Markdown 导出（`/xpi-memo-export`）或重新提供该记忆。这是显式代价，不是静默降级——工具结果与审计都写明未写快照。

## 手工恢复与删除边界

Recovery 是人工恢复输入，不是旧 ID 的回写接口。只有在明确检查 `memory.bank`、`memory.kind`、`memory.scope` 和正文后，才可以用 `mnemosyne store` 创建一条新的受治理记忆；新写入会获得新 ID。不要用正文匹配目标，也不要把 recovery JSON 提交到仓库或日志。

如果删除失败、recovery 写入失败或生命周期状态为 `unresolved`，保留原记忆并先处理诊断；不得把工具的 `status: error` 解读为删除完成。
