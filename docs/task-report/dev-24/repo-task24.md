# Task 24 Report — 离线提取模型可配置

- 关联任务：`.pi/fast-fixes/2026-09-16-xpi-memo-panel-fixes/tasks.md` §4（4.1–4.3）
- 涉及文件：`src/config.ts`、`src/console.ts`、`src/index.ts`、`src/offline-extraction-runner.ts`、`src/config.test.ts`、`src/offline-extraction-runner.test.ts`、`ARCHITECTURE.md`、`TROUBLESHOOTING.md`
- 日期：2026-09-16

## 目的

门控离线提取（gated offline extraction）一直用当前会话的聊天模型，用户改不了。想让它跑在一个更便宜的模型上，唯一办法是改代码。本节把"用哪个模型"变成一条配置。

## 作用

1. **配置层**：`XpiMemoConfig` 新增 `offlineExtractionModel: string`，默认 `"session-model"`；环境变量 `XPI_MEMO_OFFLINE_EXTRACTION_MODEL` 优先，其次用户配置文件，最后回落默认值。该键加入 `WRITABLE_KEYS`，否则用户在 `config.json` 里写的值会在下一次保存时被过滤掉（这也是它必须进 writable 集合的原因）。
2. **解析层**：`offline-extraction-runner.ts` 新增 `matchOfflineExtractionModel(configured, sessionModel, catalogue)`：
   - `"session-model"` → 会话模型，且**不读**模型目录（目录是惰性 thunk）；
   - `provider/model-id` 或裸 model id → 在目录中匹配；
   - 匹配不到或者值不可用 → 回落会话模型。
3. **接线**：`index.ts` 的 `sessionModelRunnerFor(ctx, config)` 用上面的结果构造 runner；只有在没有注入 runner 时才走这条路。
4. **面板**：`SETTINGS_FIELD_SPECS` 新增该字段并放进 Storage 组，作为只读行显示当前值（note 提示"只读, 改它要编辑配置"）。

## 特点

- **失败不静默**：模型 id 打错时回落到会话模型，而不是把提取悄悄关掉——提取仍然工作，只是没换模型。
- **惰性读取**：`catalogue` 是 thunk，默认路径（`session-model`）完全不触碰 `modelRegistry`，因此结构化的假 registry（没有 `getAll`）依旧可用。
- **无 provider 类型泄漏**：匹配器只要求 `{ id, provider }` 结构，pi-ai 的模型类型没有进入这个模块，和该模块原有的设计一致。

## 边界与偏离

- **偏离计划**：计划写的是 `values: ["session-model", "user-defined"]`。面板只能枚举选择、不能接受文本输入，把 `user-defined` 当值写进配置只会得到一个无意义的模型 id（既不是 sentinel 也不是真实模型），因此实际采用空 `values`（只读行，与 `dataDir` 同款），真实 id 由配置文件或环境变量提供。
- **超出计划的必要补充**：计划只要求"在面板暴露字段"，但一个没有任何读取方的配置键是死配置，因此把解析结果接进了默认 runner。
- 只影响**默认** runner；测试或宿主注入的 `dependencies.offlineExtractionRunner` 完全不受影响（提取的既有测试都走注入路径）。
- 不校验模型是否已配置鉴权：选到没有 API key 的模型时，行为与选会话模型时的鉴权失败一致，不会被这里吞掉。

## 验证

- `pnpm test src/offline-extraction-runner.test.ts`：10 passed，含 sentinel 不读目录、`provider/id` 与裸 id 匹配、未知值回落、双方都无模型时为 `undefined`。
- `pnpm test src/config.test.ts`：19 passed，含默认值、用户配置值跨保存存活、环境变量优先、空白环境值不覆盖配置。
- `pnpm test src/console.test.ts`：Storage 组显示该字段且不可写。
- `pnpm typecheck`、`pnpm -w run lint` 通过。
