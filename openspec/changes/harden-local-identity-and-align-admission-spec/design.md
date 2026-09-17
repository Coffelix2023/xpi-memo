## Context

见 [proposal.md](proposal.md)。当前运行时先解析 Git 身份，失败后无条件调用本地身份解析；本地解析器仅检查 JSON 字段类型。`ExtensionContext.isProjectTrusted()` 已由安装的 Pi 类型声明提供，但尚未进入运行时构造及状态查询路径。候选准入的实现、测试和 audit 事件已存在，偏差集中在主规范陈述。

## Goals / Non-Goals

**Goals:**

- 让仓库内本地身份元数据仅在受信任项目中影响 project bank 路由。
- 让本地元数据只能证明其所在目录的身份，不能指定任意 bank、根目录或展示标签。
- 将主规范同步为当前实现的候选准入和 audit 行为。
- 保持 Git 身份、公开工具参数、数据格式和已有 project bank 名不变。

**Non-Goals:**

- 不实现项目级 `auto_verify_kinds` 配置。
- 不实现 preference 相似度、跨会话证据累积或第二次自动存储。
- 不迁移、合并、删除或重命名现有 project bank。
- 不新增 YAML 解析器、配置层或第三方依赖。

## Decisions

### 1. 在运行时边界传递 trust 结论

每个从 `ExtensionContext` 发起的运行时/状态构造传入 `ctx.isProjectTrusted()` 的布尔结论。内部测试依赖提供等价注入点，默认采用保守值 `false`。只有 Git 身份解析失败时，运行时才把该结论交给本地身份解析。

原因：trust 属于 Pi 会话上下文，不应由 `local-identity.ts` 读取全局设置或自行推断。把结论集中在运行时边界可覆盖工具、命令、生命周期钩子和状态展示，避免某条调用链绕过门控。

备选方案：在每个调用点单独跳过 `resolveLocalProjectIdentity`。放弃，因为调用点多且容易遗漏新增入口。

### 2. 本地元数据必须自证文件所在目录

本地身份解析器接收 `trusted` 结论。`false` 时直接返回 `null`，不读取任何 `.pi/xpi-memo/project.json`。`true` 时，对每个向上搜索到的元数据文件，以文件所在候选目录为唯一根：该目录的真实路径必须等于 JSON `root` 的真实路径，且 JSON `id` 必须等于由该目录派生的稳定 ID。任一条件失败即忽略该文件并继续向父目录搜索。

只有通过校验后才读取 `label`；展示标签仍由有效身份返回。缓存只存已验证身份或空结果，且测试在改变文件内容后清空缓存。

原因：目录是唯一可信的本地事实，`id` 和 `root` 都可从它确定；使输入校验失败时自然降级为“未初始化”。继续向上搜索保留现有“子目录继承已初始化父目录”的语义。

备选方案：只校验 `id === localProjectIdFor(root)`。放弃，因为攻击者仍可将 `root` 指向另一真实目录并使用其有效 ID。

### 3. 复用既有“无项目身份”结果，不新增审计格式

未信任、损坏或不自证的元数据均解析为无本地身份。后续路由沿用已有 `identity: "none"`、project memory 拒绝、L0/audit 有界诊断和 status 行为；本 change 不新增 audit action 或存储字段。

原因：失败路径已有可观察语义，新增事件会扩大 audit 格式兼容面而未增加用户可行动信息。

### 4. 规范描述当前能力，不替未来设计背书

`kind-routing` delta 将 `accumulate` 描述为保留策略：跳过验证并进入待审。全局 `XPI_MEMO_AUTO_VERIFY` 是唯一当前可配置项。验证失败使用已有 `tool-verification-failed` 与 `reason`，不引入别名事件。

原因：这是最小的真实契约。项目级配置和证据累积均是独立系统，应在未来有明确产品决策时建立新 change。
### 5. 自动准入有效性另立 change，先校正判据再接通写入

OG-5 至 OG-8 不在本 change 实施。实测表明：gene/constraint 的自然语言候选与仓库逐字文本形状不同，当前 `verifyProjectGene` 的固定字符串搜索无法作为生产自动准入证据；`remember`、离线提取和导入也没有共享一个完整的准入决策。

后续 `stabilize-candidate-auto-admission` 必须：

- 用统一准入入口产生唯一的“验证、证据升级、自动存储或待审”决定；
- 将 `verified-tool-result` 保持为来源 provenance（来源链路），不当作仓库验证成功；
- 以结构化来源定位验证 repository fact（仓库事实），而非匹配候选改写后的全文；
- 在 shadow mode（影子模式）记录 coverage（覆盖率）、precision（准确率）、延迟与失败原因，达成阈值前不扩大自动写入；
- 把注释行排除、`project_constraint` 放量、超时/验证器缺失的 fail-closed（失败即关闭）行为作为同一验证契约测试。

因此，本 change 只保留全局 kill switch 和当前待审回退语义，不改 `autoConfirm`、`shouldAutoStore`、升级白名单或验证器。


## Risks / Trade-offs

- [未信任的本地项目不能使用已初始化身份] 受项目 trust 保护是 Pi 的既有安全模型；用户可显式信任项目后恢复原有本地路由。
- [旧的手工编辑身份文件被拒绝] 校验只接受初始化工具产生的 canonical（规范化）目录与 ID；用户可重新运行初始化创建有效文件，不会改动旧 bank。
- [调用点漏传 trust] 将所有 `createRuntime`、`statusForContext` 与直接本地身份解析调用列为实现任务，并以测试覆盖每类入口。
- [主规范移除未来承诺] 明确标为不在当前契约，未来实现时必须开独立 OpenSpec change 恢复需求与验收场景。

## Migration Plan

1. 先添加本地身份单元测试和运行时 trust 门控测试，再修改解析与调用链。
2. 在未信任项目中，既有 `project.json` 将停止生效并安全降级；Git 项目和有效、受信任的本地项目保持原 bank。
3. 更新两份主 spec 并把 `docs/OPEN-GAPS.md` 中 OG-1 至 OG-4 标为已通过本 change 处理或拆分为未来能力。
4. 运行 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test`、`openspec validate harden-local-identity-and-align-admission-spec --strict`。
5. 回滚仅需还原本 change 的代码与主 spec；未写入新数据或执行迁移。