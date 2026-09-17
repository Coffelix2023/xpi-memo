## Context

见 [proposal.md](proposal.md)。当前离线提取在 `addCandidate()` 后直接调用 `autoConfirm()`；`remember` 和 reimport 只入待审。`autoConfirm()` 自己重复验证、证据升级和写入决策，`shouldAutoStore()` 又保留一套实际上不可达的 project fact 判据。离线提取模型输出只有 session source reference，尚未能表达仓库验证声明。

## Goals / Non-Goals

**Goals:**

- 让候选只在一个共享 admission decision（准入决定）中获得最终状态。
- 将验证声明与候选正文分离，以 repo-relative path、片段和可选 revision 为可复核证据。
- fail-closed；默认 shadow，自动写入需双显式开关。
- 保持证据类型和原始来源不可伪造、审计无正文。

**Non-Goals:**

- 不迁移或重新验证存量候选。
- 不实现 preference 累积或项目级配置。
- 不让 `remember` 新增公开工具参数；它没有声明时仍待审。
- 不在本 change 放量 `project_constraint`。
- 不用相似度、关键词集合或模型二次判断替代可复核声明。

## Decisions

### 1. 单一 admission decision 返回明确结果

新增内部 admission decision，使 candidate store 成为唯一执行“策略、验证、升级、shadow/存储”的位置。离线提取、`remember` 与 reimport 都先创建候选并调用它；只有离线提取可带验证声明，其他入口会得到 pending。

删除 `shouldAutoStore()` 中 gene/constraint 的不可达分支；它保留 session context 与 explicit preference/workflow 的既有直接存储规则。

原因：一个决定替代 `generatePendingCandidate`、`autoConfirm` 两套 project fact 判据。
备选：只在 `remember` 后调用 `autoConfirm`。放弃，因为会触发错误证据升级，且仍无法修复 0/32 判据。

### 2. 验证声明由离线提取边界严格归一化

扩展离线提取 proposal 的可选 `repositoryFact`：`{ path, excerpt, revision? }`。仅 `project_gene` 可保留；path 必须是当前根内相对路径，excerpt 有字符上限且非空。归一化前拒绝/丢弃无效声明，并不记录原始无效内容。

验证器读取声明指定文件，检查 revision（提供时）、查找精确片段并拒绝注释行。成功结果返回相对路径、受限行号/片段摘要、时间；所有失败使用稳定 reason code。

原因：验证声明可审查且与候选改写文字解耦。
备选：多信号模糊匹配。放弃，因为无法为自动写入给出可复核、低误报的证明。

### 3. 证据升级只接受 l0-conclusion + 通过声明

admission decision 在验证通过后只为 `l0-conclusion` 调用升级；其他证据类型从不调用 `upgradeEvidence`。`verified-tool-result` 保留其来源语义，即使验证器返回成功也只可 shadow，不可成为自动写入前提。

原因：消除 OG-5 直接扩白名单导致的语义混淆和抛错路径。
备选：把 `verified-tool-result` 映射为 `verified-repository-fact`。放弃，因为“谁提供输入”和“仓库是否证明事实”是独立命题。

### 4. 两个环境变量构成 fail-closed rollout

保留 `XPI_MEMO_AUTO_VERIFY=false|0` 为总 kill switch。新增 `XPI_MEMO_AUTO_ADMIT=true`；仅它精确为 `true` 且总开关未关闭时，已通过的 `project_gene` 才可自动写入。其他值、缺失值和解析错误均是 shadow。

shadow 会验证、记录结果、保留候选；它不是静默跳过。`project_constraint` 即使已有验证器也只能 shadow。配置由现有全局环境变量读取，不新增项目配置。

原因：允许收集真实覆盖率和人工审核对照，不让未验证收益的机制默认改写 T1。
备选：默认关闭验证。放弃，因为失去修正验证器所需的生产测量。

### 5. 指标只记录有界元数据

扩展既有 audit/L0 元数据：admission decision、reason code、kind、候选 ID、相对路径、可选行号、耗时桶与验证时间。拒绝记录候选正文、完整文件、未通过片段或绝对路径。成功 shadow 使用现有 `tool-verified` 加 `status: shadow`；失败仍使用 `tool-verification-failed`。

在放量前，从审计汇总：有声明比例（coverage）、shadow 通过后人工 Store 的比例（precision proxy）、验证延迟和 reason 分布。不会把这些内部指标当作已保证的产品数字。

### 6. 兼容与回滚

应用时，`project_gene` 自动写入将从默认打开变为显式 opt-in；已有候选、T1 记忆、bank 和 audit 条目不迁移。回滚可先设置 `XPI_MEMO_AUTO_VERIFY=false`，再回退代码；新审计字段应保持可选，旧 reader 忽略未知字段。

## Risks / Trade-offs

- [模型未提供声明，shadow coverage 低] → 保持待审并用 audit 原因码定位，不回退到候选全文猜测。
- [声明片段来自注释] → 按文件类型的保守前缀检测后拒绝；不确定即待审。
- [revision 在非 Git 目录不可用] → 未提供 revision 时仅验证当前工作树；声明提供但无法一致时待审。
- [shadow 指标不能证明语义真值] → 自动写入前要求人工审核样本复核，不用单纯验证成功率放量。

## Migration Plan

1. 先以测试固定现有直接存储与候选队列行为，再加入 admission decision 和声明归一化。
2. 将所有三个候选入口接至同一决定，删除不可达 project fact 判据。
3. 发布时保持 auto-admit 缺省关闭；观察 shadow 审计。
4. 需要紧急回退时设置 `XPI_MEMO_AUTO_VERIFY=false`，候选继续待审且不丢失。
5. 不迁移存量数据；后续 project constraint 放量另开 change。
