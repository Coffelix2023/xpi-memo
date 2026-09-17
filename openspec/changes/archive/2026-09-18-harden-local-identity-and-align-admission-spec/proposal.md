## Why

当前本地项目身份文件会在未经过项目 trust（信任）判定时被自动读取，并直接采用其中的 `id`、`root` 和 `label`，使非 Git 目录可把记忆操作路由到伪造的 project bank。与此同时，候选准入主规范仍将项目级覆盖与 preference 证据累积描述为当前能力，但代码没有实现这些路径；验证失败的实际 audit 事件名也与规范不一致。

现在需要收紧项目文件这个输入边界，并让主规范只承诺已交付、可测试的行为，避免安全边界和行为契约继续漂移。

OG-5 至 OG-8 暴露的是自动准入的有效性与治理问题：当前验证器对自然语言候选使用固定字符串匹配，离线路径与显式 `remember`（记住）路径的准入行为不一致，且不存在可安全支撑自动写入的统一验证契约。它们将由独立 change 处理，不扩大本 change 的身份边界修复范围。
## What Changes

- 本地项目身份仅在当前 Pi 项目已受信任时参与运行时路由；未受信任项目忽略仓库内 `.pi/xpi-memo/project.json`，并保持 Git 身份优先。
- 接受本地身份前，验证元数据文件所在目录、其 `root` 和由规范算法导出的 `id` 一致；不一致或无法验证时按未初始化处理，不采用文件提供的 `label`。
- 为有效本地身份与拒绝的伪造/未信任身份补充可观察、无正文的身份状态或拒绝诊断；不改变现有 Git 项目路由。
- 将 `candidate-auto-admission/kind-routing` 对齐已实现行为：`global_preference` 的 `accumulate` 是保留策略，当前进入待审；删除未实现的项目级 `.pi/xpi-memo.yaml` 覆盖契约。
- 将工具验证不可用的 audit 描述对齐现有 `tool-verification-failed` 事件及 `reason` 代码；移除不存在的 `accumulation-timeout` 当前契约。
- **BREAKING（仅对未实现的文档契约）**：不再承诺 `.pi/xpi-memo.yaml` 的 `auto_verify_kinds`；不再承诺 preference 第二次出现会自动存储。
- **Scope boundary**：不调整 `autoConfirm`、`shouldAutoStore`、证据升级白名单或 `verifyProjectGene`；不以“接通自动存储”掩盖 OG-5 至 OG-8。

## Explicit Deferrals

OG-5 至 OG-8 不在本 change 实施，也不因本 change 的规范收口而被隐式承诺。具体包括：

- 不把 `remember` 接入新的自动准入路径。
- 不扩展 `verified-tool-result` 的证据升级白名单。
- 不把当前自然语言全文固定字符串匹配验证器直接作为生产准入判据，也不在本 change 重做验证器。
- 不新增注释行或 `project_constraint` 的自动准入规则。

上述能力由独立的 `stabilize-candidate-auto-admission` change 规划，范围包括统一准入入口、结构化来源证据、shadow mode（影子模式）和放量指标。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `runtime-boundary-hardening`：为本地项目身份增加 trust 门控、自证校验和安全降级语义。
- `candidate-auto-admission/kind-routing`：将 kind 准入和失败审计要求对齐已实现行为，并明确未实现能力不属于当前契约。

## Impact

- 代码：`src/index.ts` 的运行时构造和调用点、`src/local-identity.ts`、可能的 L0/audit 路由诊断接线及其测试。
- 类型/API（应用程序编程接口）：内部运行时构造需要接收当前 `ExtensionContext` 的 trust 结论；公开工具输入不变。
- 规范与文档：修改上述两份主 spec；应用本 change 后再同步 `docs/OPEN-GAPS.md` 的 OG-1 至 OG-4 状态；OG-5 至 OG-8 由后续 change 处理。
- 依赖：不新增依赖；使用 Pi 已有的 `ctx.isProjectTrusted()` 与 Node 标准库。
- 规划边界：本轮只维护 OpenSpec 产物，不修改 `src/`、主规范或业务文档，不执行任务代码。
