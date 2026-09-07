## 1. Lifecycle Contract

- [x] 1.1 定义 governed write/delete 的 operation ID、request、commit、failure 和 unresolved 事件 payload，并保留旧 L0 事件的兼容读取；用事件解析测试验证位置、关联字段和旧事件行为。
- [x] 1.2 实现按 operation ID 折叠生命周期状态的纯逻辑，并让未出现终态的请求进入 unresolved；用 request-only、commit、failure 和交叉存储中断测试验证状态不会被误报为成功。
- [x] 1.3 建立统一的 T1 lifecycle coordinator，接入 direct capture、candidate confirmation 和 offline extraction；用三条入口的成功、backend 失败和 L0 终态写失败测试验证相同结果语义。
- [x] 1.4 调整 candidate queue 的提交时机，使 candidate 只在 T1 commit 成功后移除，失败或 unresolved 时保持可恢复；用 candidates.json 与 L0 事件联合测试验证队列状态。

## 2. Deletion Boundary

- [x] 2.1 为 `forget` 增加精确 ID 能力检查和固定的 upstream limitation reason；用当前 Mnemosyne CLI mock 验证不会调用 recall、export 扫描或 delete，也不会声称 recovery 成功。
- [x] 2.2 保留 project bank 后 default bank 的查找顺序，并在精确 ID 能力可用的适配器契约下实现 request、recovery、delete、confirmed 或 failed 生命周期；用 bank fallback、recovery 写失败和 delete 失败测试验证破坏性操作前的保护。
- [x] 2.3 更新 recovery、CLI 使用和故障排查文档，明确当前 Mnemosyne 没有稳定按 ID 读取命令以及手工删除边界；用文档链接和示例命令检查验证内容不承诺不存在的 API。

## 3. MEMORY.md Projection

- [x] 3.1 将 MEMORY.md 重建输入与 daily 增量输入分离，在发生 memory-affecting event 时扫描完整可读 L0 历史，只投影 committed writes 和 confirmed deletions；用“先写 A 导出、再写 B 增量导出”的测试验证 A 与 B 同时保留。
- [x] 3.2 实现删除事件的确定性投影和 legacy 无 memory ID 诊断；用“删除 A、保留 B”及“旧 write 无 ID”测试验证只移除可验证目标，不按正文猜测删除。
- [x] 3.3 分离 daily export cursor 与 MEMORY projection 状态，并保证 MEMORY.md 原子替换失败时保留待重试状态；用注入写失败的测试验证 daily 成功不会推进 MEMORY 投影完成标记，下一次 export 可恢复。
- [x] 3.4 在 confirmed deletion 后调度 MEMORY projection，并区分 T1 删除成功与投影失败；用删除后的导出集成测试验证 MEMORY.md 不再显示目标记忆且失败结果可诊断。
- [x] 3.5 保持现有 section、排序、duplicate 标记、source traceability 和 corrupt-event 处理；用完整重建测试验证历史顺序、重复标记和损坏事件警告不回归。

## 4. Observability and Compatibility

- [x] 4.1 将 unresolved lifecycle 和 MEMORY projection pending/failed 状态接入 status、audit 或 bounded diagnostics；用状态输出测试验证包含 operation ID、reason、scope/bank 等元数据且不泄漏记忆正文。
- [x] 4.2 为新旧 L0 事件定义迁移与回滚说明，记录回滚前停止写入新事件类型的边界；用历史 fixture 和旧事件回放测试验证升级后的 reader 可处理已有日志。
- [x] 4.3 保持 L0 lossless、召回安全、内容策略和 UI visual layer 不变；通过差异检查与现有相关测试验证本 change 未改变这些非目标行为。
- [x] 5.1 补齐跨层行为测试：backend 成功/失败、L0 request/commit/failure、candidate 保留、delete recovery、增量投影和重试；运行目标测试文件并确认全部通过。
- [x] 5.2 执行 `pnpm typecheck`、`pnpm -w run lint` 和 `pnpm test`，确认类型、Biome 和完整测试套件通过，并记录上游精确 ID 能力仍未实现为已知限制。
