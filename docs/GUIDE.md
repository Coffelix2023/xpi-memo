# xpi-memo Recovery Guide


## 当前 `forget` 能力边界

`xpi_memo_forget` 只接受真实 T1 memory ID。删除前必须由 adapter 提供稳定的精确 ID 读取能力，以核对完整条目并写入 recovery；语义 `recall` 不能证明主键对应关系。

当前 Mnemosyne CLI 没有稳定的按 ID 读取命令，因此当前 CLI adapter 会返回 `upstream-exact-id-read-unavailable`，并且不会调用 `recall`、全库 `export`、SQLite 访问或 `delete`。这不是删除成功，也不会生成 recovery 文件。
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

## 手工恢复与删除边界

Recovery 是人工恢复输入，不是旧 ID 的回写接口。只有在明确检查 `memory.bank`、`memory.kind`、`memory.scope` 和正文后，才可以用 `mnemosyne store` 创建一条新的受治理记忆；新写入会获得新 ID。不要用正文匹配目标，也不要把 recovery JSON 提交到仓库或日志。

如果删除失败、recovery 写入失败或生命周期状态为 `unresolved`，保留原记忆并先处理诊断；不得把工具的 `status: error` 解读为删除完成。
