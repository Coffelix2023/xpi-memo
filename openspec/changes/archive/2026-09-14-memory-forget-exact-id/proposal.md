## Why

`xpi_memo_forget` 当前对所有请求都 fail-closed：因为 Mnemosyne 命令行（CLI，命令行工具）不暴露"按编号取一条"的命令，删除从不发起。实测 3 次删除请求 3 次返回 `Memory deletion failed.`，同一编号用 `mnemosyne delete <id>` 手工执行则全部成功。

"删除前必须先精确读取一遍"是 xpi-memo 为了写 recovery 快照自己加的约束，不是上游的限制：上游的 `delete <id>` 本身不做预读，自带 not-found 判定。记忆系统的底线是用户能删；把"无法快照"和"无法删除"绑在一起，代价是整个仓库、所有项目的删除功能不可用。

## What Changes

- `forget` 改为能力门控（capability-gated）：精确 ID 读取能力缺失时，跳过预读直接调用 backend delete，由 backend 的 not-found 结果判定失败；能力可用时保持现有的 recovery 后删除路径。
- 把现有的 `upstream-exact-id-read-unavailable` 从永久降级理由改为一次显式的 adapter 能力判定，使上游将来提供精确读取命令时可以就地升级回"先快照再删除"，不需要改调用方。
- 保持 `xpi_memo_forget(memoryId)` 单参数兼容性、project bank → default bank 的尝试顺序、以及"只有删除成功后才记录 success 与 bank"的审计语义。
- 继续禁止语义 recall、全库 export 扫描和直接访问 Mnemosyne 数据库文件作为替代手段。
- 更新故障排查与恢复文档口径：从"能力缺失即拒绝删除"改为"能力缺失时直接删除、能力可用时先写快照"。
- 向 Mnemosyne 上游提出增加精确 ID 读取命令的请求，记录为 follow-up，不在本 change 内实施。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `memory-operation-closure`: `Forget MUST fail closed when exact ID read is unavailable` 改为按上游能力分流的删除行为——能力缺失时直接删除并接受 backend not-found 作为失败判定，能力可用时保留 recovery 前置。
- `memory-consistency`: `Deletion recovery has an explicit confirmed outcome` 中的"删除前必须完成 recovery"从无条件要求改为能力门控，使缺少精确读取能力时删除仍可完成，同时明确此时不产生 recovery 记录。

## Impact

- 运行时路径：`src/index.ts`（forget 工具处理与 recovery 分支）、`src/operations.ts`、`src/banks.ts`（adapter 能力判定与 delete 结果解析）。
- 契约与诊断：`src/t1-lifecycle.ts` 的删除结果语义、`doctor`/`status` 的上游限制状态。
- 文档：`docs/GUIDE.md`（recovery guide）、`TROUBLESHOOTING.md` 的 "Forget fails closed" 章节。
- 测试：`forget` 的 project/global/absent-bank 用例，以及新增的"能力缺失时直接删除"与"能力可用时先快照"两条路径。
- 不新增运行时依赖，不访问 Mnemosyne 数据库 schema，不改动候选生命周期与内容策略。
