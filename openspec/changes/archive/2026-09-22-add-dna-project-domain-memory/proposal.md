# Proposal: add-dna-project-domain-memory

## Why

用户反复向 Agent 口述同样的前端视觉细节与写作习惯(如"items 要有 border""间隙稍宽一点"),T1 记忆库对这类微偏好召回不可靠(会话内实测:高频目标被常驻噪声记忆挤出 top5),且 T1 的 7 类封闭 kind 枚举无法表达 `art`/`write` 这类"人味"域。需要一个项目级、用户可见可编辑、Agent 主写、整文件注入交付的域记忆文件,作为 T1 之外按域分家的独立记忆面。

## What Changes

- 新增项目级单文件 `.pi/DNA.yaml`,作为 `art`(前端视觉设计细节)与 `write`(写作/创意/剧本习惯)两个域的**唯一真相源**;两域均可留空,无前端/无创作的项目允许文件缺省或为空。
- 条目结构由 typebox schema 定义(语义 + 参数、`source`、`confidence`、provenance 字段),写入前 fail-closed 校验,非法条目拒绝写入。
- 交付方式为**全量注入**:检测到前端/写作任务或会话启动时整文件进上下文(守 Prompt Hygiene:精简、可移除、空闲不注);DNA 不接入 `xpi_memo_recall` 检索。
- 写入路径:Agent 为主写方;用户手编等同 `explicit-user-statement` 证据级别;所有写入(含用户编辑后被 Agent 采纳的内容)必须先过 `prepareExternalContent`/`content-policy` 安检。
- 仅在受信任项目生效(Project Trust),未信任项目或文件缺失 = 功能关闭,不回退、不静默创建。
- 边界:art/write 域条目不写入 T1、不新增 kind;CODE/工程类习惯仍走 T1 既有路径;recall 仍只查 T1 banks。
- Modified `memory-activation-loop`:用户在 art/write 域的显式陈述,以 DNA 文件写入(带 provenance)作为其 governed outcome,不再创建对应 T1 候选,避免双真相源。

## Capabilities

### New Capabilities

- `dna-domain-memory`: 项目级 `.pi/DNA.yaml` 域记忆文件的 schema 校验、信任门控、读取注入交付、Agent/用户双写入路径与安全边界。

### Modified Capabilities

- `memory-activation-loop`: 显式记忆意图的 governed outcome 新增 DNA 文件承载路径——art/write 域用户陈述写入 DNA(带来源标注),不再为该域创建 T1 候选;其余类别行为不变。

## Impact

- 代码:新增 `src/dna/` 模块(schema/load/ingest/注入组装),`src/index.ts` 注入挂点,复用 `content-policy.ts`/`memory-safety.ts`(`prepareExternalContent`);不改 T1 kind 枚举、不改 T1 banks、不改 recall 路径。
- 数据:新文件 `.pi/DNA.yaml`(仓库内、git 跟踪、可回滚);无既有数据迁移。
- 配置/信任:依赖 Project Trust 既有机制;无新增环境变量(本 change 不含 typesafe 接入)。
- 文档:GUIDE/README 增补 DNA 使用说明与域边界表。
