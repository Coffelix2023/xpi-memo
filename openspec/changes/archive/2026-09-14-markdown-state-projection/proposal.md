## Why

`MEMORY.md` 现在是从完整 L0 事件历史重建的：条目集合等于"历史上写入过什么"减去"已确认删除什么"。这要求每一条写入和删除路径都必须发出正确的事件——任何一条路径漏发，人读层就错。这条路径已经真实漏过一次：删除操作不回溯清单，已删的记忆长期挂在上面，后来靠补投影逻辑止血。

人读层回答的是"现在记住了什么"，那是卡片盒（bank 当前状态）的语义，不是日志的语义。日志回答"怎么变成这样的"。让视图投影状态、让日志只做注解，正确性就从"每个调用点各自努力"变成"单一路径天然正确"。

这条也是对外同步的前置：一旦把记忆单向同步给跨 harness 工具，删除失效会从本地视图瑕疵升级为跨工具记忆泄漏。

## What Changes

- `MEMORY.md` 的条目集合改为由 bank 当前状态决定；L0 只提供 provenance（来源）、位置、稳定排序与可追溯引用。
- 新增有界的 bank 状态读取原语，用于投影层。明确边界：已有变更对"全库 export 扫描"的否决只针对 `forget` 路径，投影层使用有界状态读取不违反该决定，并在文档中显式区分两条边界，避免后续误读为自相矛盾。
- 保留现有全部行为：原子替换、投影失败保持待重试、daily 日志进度与 MEMORY 投影进度相互独立、section 稳定排序、精确与近重复标记、损坏事件告警、来源可追溯。
- 没有对应 L0 provenance 的 bank 行（例如由外部工具直接写入）必须仍可投影，并标注来源缺失，而不是被静默丢弃或猜测来源。
- 明确不做：不在本 change 内把 Markdown 整体翻转为真相源，不改动 bank 存储布局，不引入新运行时依赖。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `markdown-export`: `MEMORY.md for long-term facts` 与 `MEMORY.md updates incrementally` 的数据源从"完整 L0 历史"改为"bank 当前状态 + L0 注解"，并新增"来源缺失仍可投影"的行为。
- `memory-consistency`: `MEMORY.md is a deterministic projection of complete L0 history` 改为"对 bank 当前状态的确定性投影"，删除由状态天然反映，不再依赖删除事件的投影逻辑。

## Impact

- 导出实现：`src/markdown-export/memory-generator.ts`、`src/markdown-export/exporter.ts`、`src/markdown-export/transformer.ts` 及其测试。
- 后端读取：`src/search/mnemosyne-backend.ts` 或 `src/banks.ts` 新增有界状态读取能力，供投影层使用。
- 契约与诊断：`src/memory-consistency` 相关状态、投影失败重试诊断、`src/status.ts` 的投影状态。
- 文档：`ARCHITECTURE.md` 的导出层描述、`MARKDOWN-FORMAT.md` 的来源引用说明。
- 不新增运行时依赖，不改变 `forget` 的删除路径（由另一个变更负责），不改动 L0 事件格式。
