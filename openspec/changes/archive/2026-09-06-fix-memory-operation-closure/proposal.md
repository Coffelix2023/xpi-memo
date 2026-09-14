## Why

真机实测确认记忆操作闭环存在三个直接缺陷：project memory 无法通过 `xpi_memo_forget` 删除，recall 丢失可用于后续操作的 memory ID，自然中文表达又被重复的显式标记词闸门漏掉。这些问题使“捕获、召回、删除”的核心链路无法可靠工作，并破坏用户对记忆可回滚性的信任。

## What Changes

- 让 mnemosyne recall 返回的真实 memory ID 穿过搜索抽象并出现在 `xpi_memo_recall` 结果中；不具备可删除 T1 记录的 fallback 后端继续返回 `id: null`。
- 保持 `xpi_memo_forget(memoryId)` 的现有调用兼容性，在当前项目存在时依次尝试 current project bank 和 default bank，首次成功即停止。
- 仅在删除成功后记录 deletion audit，并记录实际删除命中的 bank；全部目标均未命中时返回明确失败。
- 删除独立的显式标记词前置闸门，以类别模式作为记忆意图入口，同时保留类别冲突、project fact 验证、project identity 和 session 长度边界。
- 固化真机报告中的自然表达探针，并增加 project-bank remember/recall/forget 端到端回归测试。
- 不引入 LLM 提取、UI 可见性、sleep 改造、SQLite 迁移、bank metadata 索引或 Markdown 真相源变更。

## Capabilities

### New Capabilities

- `memory-operation-closure`: 定义自然表达捕获、可操作 recall 结果及跨当前项目/default bank 的兼容删除闭环。

### Modified Capabilities

None. 仓库当前没有主规格目录；本变更以独立能力契约承载已验证的行为修复。

## Impact

- 搜索结果与 recall 映射：`src/search/backend.ts`、`src/search/mnemosyne-backend.ts`、`src/index.ts`。
- 删除工具与审计：`src/index.ts` 及相关工具测试。
- 自动捕获意图：`src/memory-intent.ts` 及其测试。
- 集成验证：搜索后端测试与 `src/real-cli.integration.test.ts`。
- 公共工具名称与 `xpi_memo_forget` 参数保持兼容；`xpi_memo_recall.results[].id` 从固定 `null` 恢复为后端提供的真实可选 ID。
- 不增加依赖，不改变数据库布局和现有 global/project/session 范围语义。
