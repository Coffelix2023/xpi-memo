## Why

离线提取出的候选默认只能进人工待审队列，而没人会去逐条点。实测本机库中 155 条候选全部堆在 `pending`，自动准入从未真正生效——记忆系统装上了却不记忆。

根因不是阈值太严，是**防御点放错了位置**。事前逐条审批在业界已被明确记录为反模式（blocking waits for human approval 导致状态丢失与重复动作），而记忆准入本质上是一个精确率/召回率的权衡：收得太少，agent 记不住该记的；收得太多，检索被噪声淹没。有效的防线是"默认准入 + 可配置收紧 + 事后可撤销"，不是"默认拒收 + 人工放行"。

现有 spec 还有一层结构性错配：`l0-conclusion` 必须先在仓库里找到出处、升级为 `verified-repository-fact` 才能自动入库。但"这个项目把 A 改名为 B""我们选了 pnpm 而不是 npm"这类**会话中学到的事实天然没有仓库出处**，等于被永久拒收——恰好是记忆系统最该记住的内容。

## What Changes

- 新增 `admissionPreferences` 配置：按记忆类型白名单、最低置信度、证据下限、来源限定（当前项目/全部）、时效窗口。**默认全自动**——除硬底线外全部自动准入。
- 默认准入不再要求先通过 repository-fact 验证。工具验证从"准入前置条件"降级为"证据增强"：验证通过则升级证据类型，验证不通过不再阻断准入。
- 新增 `/xpi-memo-rescan` 命令：按当前偏好重扫**全部项目**的待审候选，通过者自动写入各自的 `targetBank`。
- 重扫未通过的候选进入 `archived` 状态，默认保留 30 天后自动删除；保留期内可从面板恢复。
- Settings 面板新增准入偏好组，字段可勾选/可调，并遵守既有的"环境变量固定则该行只读"契约。
- 硬底线**不可配置**，仍然拒绝：内容策略命中的禁止性内容、存在未解冲突的候选、空内容。

## Capabilities

### New Capabilities

- `admission-preferences`: 面向用户的准入偏好定义、默认值、解析优先级，以及"硬底线不可配置"的边界。
- `pending-candidate-rescan`: 存量待审候选的重扫命令——范围、幂等性、审计与幂等重跑语义。
- `candidate-archive`: 候选归档状态、保留期、恢复与到期删除。

### Modified Capabilities

- `candidate-auto-admission/kind-routing`: 准入判定从"kind 硬编码分级"改为"偏好驱动 + 默认全自动"；kind 分级降级为偏好的默认值来源，而非唯一裁决。
- `candidate-auto-admission/evidence-upgrade`: 证据升级从"自动准入的必要条件"改为"证据增强"；未升级的 `l0-conclusion` 在偏好允许时可直接准入。
- `candidate-auto-admission/tool-verified-storage`: 仓库事实验证失败不再把候选钉在待审队列，改为记录有界失败原因后由偏好决定准入。
- `tui-console-panel`: Settings 新增准入偏好分组与可勾选字段，纳入既有的分组折叠、值可见、环境变量固定只读等契约。

## Impact

**受影响代码:**

- `src/config.ts`：新增 `admissionPreferences` 配置键、默认值与解析；纳入 `WRITABLE_KEYS` 与 `ENV_KEYS`。
- `src/kind-routing.ts`：`autoAdmitEnabled` 与 kind 策略改为读取偏好。
- `src/candidate-lifecycle.ts`：`admit()` 的新判定链；归档状态写入。
- `src/evidence-upgrade.ts` / `src/tool-verification.ts`：验证结果不再阻断准入。
- `src/offline-extraction.ts`：候选入库链路适配。
- `src/console.ts`：Settings 偏好分组与勾选字段。
- `src/index.ts`：`/xpi-memo-rescan` 命令注册；归档清理时机。
- 新增归档模块与重扫模块（各自单一职责）。

**用户体验变化:**

- 新装用户与老用户的默认行为都从"候选堆积待审"变为"合格候选直接入库"，不再需要逐条审批。
- 升级后**存量 155 条不会自动消失**：它们保持 `pending`，直到用户主动运行 `/xpi-memo-rescan`。
- 用户想要回退到严格模式时，可在面板里取消勾选对应类型或调高置信度阈值。

**兼容性:**

- 环境变量 `XPI_MEMO_AUTO_ADMIT` / `XPI_MEMO_AUTO_VERIFY` 语义保持不变，仍是最高优先级的 kill switch。
- 新增配置键缺省时使用默认值，老 `config.json` 无需迁移。
- `candidates.json` 新增 `archived` 状态与保留期字段；旧文件仍可读取，缺失字段按 `pending` 处理。

**风险与缓解:**

- 默认全自动会写入此前被拦下的内容。缓解：`auto` 标记可筛、`xpi_memo_forget` 可撤销、归档保留期提供回退窗口。
- 一次性重扫 155 条会产生大批写入。缓解：重扫是显式手动命令，且按候选逐条审计，可事后按 bank 回滚。
- 到期删除不可逆。缓解：30 天保留期 + 删除前审计记录，且删除只作用于 `archived` 状态。
