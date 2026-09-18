## Context

准入现在由三段互不相干的逻辑拼起来：`auto-store-policy.ts` 对 `session_context` 和 `global_*` 做直接存储判定；`kind-routing.ts` 给出 kind 级策略；`candidate-lifecycle.ts` 的 `admit()` 把 kind 策略、仓库事实验证、证据升级和 rollout 开关串成一条链，且只有 `project_gene` 能走完全程。`admit()` 是目前唯一的准入决定点，也是这次改动的唯一改点。

三个约束决定了实现方式：

1. `PendingCandidate.status` 当前是字面量 `"pending"`，归档需要把它变成状态集合，且 `candidates.json` 的读取必须向后兼容（老文件没有归档字段）。
2. `admit()` 已经承担了"记 L0、写 audit、升级证据、写 T1"四件事，新增偏好判定不能变成第五段散落逻辑。
3. 配置面已经有 `WRITABLE_KEYS` / `ENV_KEYS` / `SETTINGS_FIELD_SPECS` 三张必须保持全覆盖的表，新增配置键必须同时进这三张表，否则 `console.test.ts` 的完整性断言会失败。

## Goals / Non-Goals

**Goals:**

- 把准入决定收敛为一条判定链：硬底线 → 偏好 → 验证（证据增强）→ 写入或归档。
- 让"默认全自动"成为配置缺省值的结果，而不是散落在各处的特例分支。
- 让 `l0-conclusion` 在没有仓库出处时也能被准入。
- 给未准入候选一个有界、可恢复、可审计的去处。

**Non-Goals:**

- 不做检索命中率反哺阈值的自适应闭环（后续 change）。
- 不做项目级偏好覆盖（沿用既有契约：只读全局配置与环境变量）。
- 不动 `xpi_memo_forget` 与 T1 删除路径；归档只作用于候选，不触碰已入库记忆。
- 不引入 staging buffer 或异步准入队列。当前准入发生在会话结束后的离线路径，不在工具调用关键路径上，异步化没有收益。

## Decisions

### Decision 1：一条判定链，顺序按"便宜且决定性"优先

`admit()` 改为固定顺序：

1. **硬底线**——内容策略、`conflictState !== "none"`、空内容。命中即拒绝，不进入偏好判定。
2. **偏好判定**——kind 是否启用、置信度阈值、来源范围、时效窗口。全部是本地字段比较，不读文件、不调工具。
3. **仓库事实验证**——仅当该 kind 注册了验证器时执行。**结果不再决定准入**，只决定证据类型是否升级与写哪条审计。
4. **写入或留队**——通过偏好则写 T1；不通过则按 `candidate-archive` 契约归档。

顺序理由：硬底线必须最先，否则偏好能把禁止性内容放进来。偏好判定全部是内存比较，放在耗时的文件/grep 验证之前，能在默认全自动下省掉不必要的验证成本。

备选方案：把验证完全跳过（默认不验证）。放弃，因为 `project_gene` 的证据升级和审计是既有资产，且在偏好收紧到 `repository-fact` 时仍是准入依据。

### Decision 2：偏好是缺省值层，不是第二个裁决点

`admit()` 里保留 kind 默认策略，但它的角色从"裁决"降为"偏好的缺省值"。解析顺序：

```
kill switch (XPI_MEMO_AUTO_VERIFY=false|0)
  → 显式环境变量
  → 配置文件偏好
  → kind 默认策略（自动准入）
```

内置默认值定义为"除硬底线外全部准入"：

| 偏好 | 默认值 |
|---|---|
| `admissionPreferences.kinds` | 每个 kind 均为 `true` |
| `admissionPreferences.minConfidence` | `0.7` |
| `admissionPreferences.evidenceFloor` | `"session-conclusion"`（不强求仓库事实） |
| `admissionPreferences.sourceScope` | `"all"` |
| `admissionPreferences.maxAgeDays` | `30` |

备选方案：预置 `strict` / `balanced` / `liberal` 三档预设。放弃——用户要的是逐类勾选，档位预设会让"勾了 gene 却没勾 constraint"这类诉求无法表达。

### Decision 3：归档是候选状态，不是独立存储

归档体现为 `PendingCandidate.status` 从 `"pending"` 扩展为 `"pending" | "archived"`，并在条目上增加 `archivedAt` 与 `expiresAt`。候选仍留在 `candidates.json`，只是 `list()` 不再返回它们。

理由：`candidates.json` 已经是候选的唯一真相文件，审计与恢复都需要按 ID 回查。独立归档文件会引入第二个真相点和一个跨文件一致性负担。

向后兼容：读取时缺失 `status` 或 `archivedAt` 一律按 `"pending"` 处理，老文件无需迁移。

### Decision 4：到期清理惰性触发，重扫保持显式

到期删除在两处触发：扩展加载时，以及重扫命令执行时。两处都只做"删除 `expiresAt` 已过的归档条目"这一件廉价幂等的事。

这与"重扫 MUST NOT 自动运行"不冲突：清理不判定任何候选的准入，只是执行已经决定好的到期删除。否则不主动重扫的用户会让归档无限期留存，与"队列不会无限堆积"的目标相反。

备选方案：`session_shutdown` 钩子里清理。放弃——该钩子已经承担离线提取，再加一件写文件的事会扩大它的失败面。

### Decision 5：重扫复用同一准入决定，靠状态过滤实现幂等

重扫命令不做自己的准入判定，而是遍历 `status === "pending"` 的候选、逐条调用 `admit()`。幂等来自状态：已写入的候选不再是 `pending`，已归档的也不是，重复运行自然只处理剩余项。

跨项目写入靠候选自带的 `targetBank` / `targetScope`，`admit()` 已经按这两个字段写库，重扫不需要感知当前工作目录。

备选方案：让重扫接受 `--kinds` 等临时参数覆盖偏好。放弃——偏好已经在配置里，临时参数会造出第三个优先级层，与本 change 的收敛目标相反。

### Decision 6：配置键一次进三张表

新增键必须同时进 `DEFAULT_XPI_MEMO_CONFIG`、`WRITABLE_KEYS`、`ENV_KEYS`，并在 `SETTINGS_FIELD_SPECS` 里注册分组。`kinds` 是一个逐类布尔对象，面板呈现为分组下的 7 行勾选。

面板行数预算：准入偏好分组共 11 行（7 个 kind + 4 个标量）。既有契约要求"默认只有一组展开"，所以新增分组默认折叠，不挤压既有分组的可见性。

## Risks / Trade-offs

- 默认全自动会写入此前被拦下的内容 → 缓解：全部自动写入的候选在 audit 与 L0 里带 `auto` 决定标记，可筛可撤销；`xpi_memo_forget` 仍在；归档保留期提供回退窗口。
- 一次性重扫 155 条会产生大批写入，且部分候选来自已不再维护的项目 → 缓解：重扫是显式命令，结果带汇总与逐条审计，可按 bank 定位回滚；`sourceScope: "current-project"` 是现成的收紧手段。
- 到期删除不可逆 → 缓解：删除只作用于 `archived` 状态；删除前写审计；保留期可配置。
- 偏好判定与 kind 默认策略重叠，可能再次分裂 → 缓解：两者都在 `admit()` 内、同一次解析中完成，且 `kind-routing.test.ts` 与新增的偏好用例共同钉住行为。
- 7 行 kind 勾选可能让面板拥挤 → 缓解：新增分组默认折叠；若实测仍超标，退化为"全部启用/全部停用"两行加逐类展开。

## Migration Plan

1. 先落配置与判定链改造（`config.ts`、`kind-routing.ts`、`candidate-lifecycle.ts`），此时默认值已生效，新候选不再堆积。
2. 再落归档状态与到期清理（`pending-candidate.ts`、`candidate-lifecycle.ts`、新归档模块）。
3. 再落重扫命令（`index.ts` 注册 + 重扫模块）。
4. 最后落面板分组（`console.ts`）。
5. 用户侧：存量 155 条不会自动变化，需要显式运行一次重扫。

回滚：任一阶段可单独 revert。整体回退等价于把 kind 默认策略改回人工确认并把 `autoAdmit` 置 `false`——`XPI_MEMO_AUTO_VERIFY=false` 是现成的全局退路。归档条目在回滚后仍是 `archived`，可手工改回 `pending` 或直接删除该文件字段。

## Open Questions

- 面板勾选落地的具体控件形态（多选行 vs 每 kind 一行开关）留待实现时按 `TUI-DESIGN.md` 的行高预算定；不改变 spec 与任务拆分。
