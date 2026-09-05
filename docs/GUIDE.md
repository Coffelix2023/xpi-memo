# xpi-memo Recovery Guide

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
