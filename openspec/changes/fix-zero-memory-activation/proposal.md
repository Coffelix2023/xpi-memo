## Why

T1 记忆体在现网全部为空：`audit.json` 只有 recall，L0 41 个会话没有 `t1_memory_write` / `candidate_*`，扩展库与 CLI 默认库是两套路径且两边 memories 都是 0 行。根因是 `xpi_memo_remember` 从未被调用，外加空结果把 `queriedBanks` 显示成 `[]`、裸 `mnemosyne` CLI 读另一套库，导致「检索坏了 / 写入坏了」的误诊。现在要让空库可诊断、可写入，同时不放松治理。

## What Changes

- 新增 doctor 状态机：把「零记忆」拆成互斥状态 `NEVER_CALLED` / `PENDING` / `WRITE_FAILED` / `RECALL_EMPTY`，并列出 audit / L0 / banks / CLI 分叉证据。
- 收紧 `xpi_memo_remember` 契约：`kind` 必填，不再默认 `session_context`；工具结果必须是 `stored` | `candidate` | `rejected`。不放宽 `shouldAutoStore`。
- 候选确认改为轻量卡片：Store / Later / Reject。Later 进入已有 `/xpi-memo` Pending 收件箱。`candidate-lifecycle` 的 confirm/reject 语义不变。
- 空 recall 也必须报告已查询的 bank（修 `toRecallResponse` 观测缺陷）。
- 共享可配置数据根：扩展与 CLI 读同一 `dataDir`；doctor 检测 `~/.hermes/mnemosyne/data` 与 `~/xpi-memo` 分叉，只读列出独立表面。不用 symlink / shell wrapper，不提供自动迁移。
- **BREAKING**（工具调用方）：`xpi_memo_remember` 的 `kind` 从可选改为必填枚举。Agent / skill 文档必须同步。

## Capabilities

### New Capabilities

- `t1-health-doctor`: 诊断「零记忆」的互斥状态机、分叉库只读探测、手动核对指引。
- `shared-data-root`: 扩展与 mnemosyne CLI 共享同一可配置数据根；doctor 列出独立表面并拒绝把 symlink 当修复，不提供自动迁移。

### Modified Capabilities

- `t1-governance`: remember 契约（kind 必填、明确 outcome）；确认 UX 从阻塞 Confirm 改为 Store / Later / Reject；Later 入 Pending。
- `t1-memory-routing`: 空结果仍报告 `queriedBanks`；recall 观测不再把「查过但为空」显示成「没查 bank」。

## Impact

**Code:** `src/index.ts`（remember 参数、executeRemember 确认、toRecallResponse）、`src/console.ts` / `src/index.ts` Pending 复用、新 doctor 命令或扩展现有 `/xpi-memo-l0 --reconcile`、`src/config.ts` / `src/cli.ts` 共享根、skill `memory-boundaries`、GUIDE / TROUBLESHOOTING。

**APIs:** `xpi_memo_remember.kind` 必填。确认交互从二元 Confirm 变为三向。doctor 输出新增状态枚举与分叉表面。

**Dependencies:** 无新依赖。继续用已安装的 mnemosyne CLI。

**Systems:** 数据根仍默认 `~/.pi/agent/xpi-memo`。CLI 交叉验证必须指向同一根。`~/xpi-memo` 与 hermes 默认库视为分叉表面，不自动合并。

**Out of scope:** 不放宽 auto-store；不把 L0 自动晋升为 T1 主写路径；不提供自动迁移命令（分叉表面由 doctor 只读列出，手动核对）；不 archive `xpi-memo-staged-evolution`（另走 `/opsx-archive`）。
