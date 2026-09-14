## Why

召回记忆和外部提取内容当前可能被模型误读为可信指令，敏感凭证也可能沿着 provider、Mnemosyne 或导出边界继续传播。现在补齐统一的安全边界，可以在不改变 L0 事件真源、T1 治理模型和 UI change 的前提下，降低提示注入与凭证出域风险。

## What Changes

- 为自动召回和显式记忆查询增加统一的安全包装：高置信度提示注入条目整条阻断，其他条目继续处理。
- 为发送给 Track B runner、Mnemosyne 或其他外部 provider 的内容增加凭证脱敏；无法可靠判断安全时阻止外部调用。
- 保留 L0 本地原始事件以维持可重放约定；外部传输和用户/模型可见输出使用安全副本，不修改历史事件。
- 为 `memory_injected` 增加向后兼容的有界诊断元数据，包括阻断数、省略数、省略原因、策略版本和生命周期阶段；不记录记忆正文。
- 让 `xpi_memo_recall`、`xpi_memo_show_injected`、自动召回和后续 context preview 复用同一内部安全契约。
- 保持 `MEMORY.md` 现有导出系统独立；本 change 只确认导出前不得写入未脱敏凭证，不处理投影游标和重建一致性。

## Capabilities

### New Capabilities

- `memory-boundary-safety`: 约束召回内容、外部传输和诊断输出的信任边界、凭证保护和安全反馈。

### Modified Capabilities

- `runtime-boundary-hardening`: 扩展运行时边界要求，使召回输出、外部 provider 失败和安全诊断遵循统一的有界、可行动且不泄露正文的行为。
- `memory-activation-loop`: 补充自动召回和离线提取遇到提示注入或外部脱敏失败时的安全处理要求。

## Impact

- 影响 `src/content-policy.ts`、召回渲染与工具输出、L0 事件类型和 `memory_injected` 记录、Track B/provider runner 边界及现有导出脱敏调用方。
- 需要新增小型本地安全规则和针对所有记忆可见入口的回归测试；不新增安全依赖。
- 不修改 `xpi-memo-ui-visual-layer.bak`，不实现 L0/T1 一致性修复、`observedAt`、周期提取、Standing Instructions 或自动 dedup 删除。
