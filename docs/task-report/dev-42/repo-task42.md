# Task 42 Report — stabilize §1 验证声明与测试基线

- 关联任务:`openspec/changes/stabilize-candidate-auto-admission/tasks.md` §1(1.1–1.3)
- 涉及文件:`src/types.ts`、`src/offline-extraction.ts`、`src/tool-verification.test.ts`、`src/auto-store-policy.test.ts`
- 日期:2026-09-17

## 目的

把"仓库证据"从候选正文的猜测改成可复核的结构化声明,并以真实候选形状固定验证器行为基线。

## 作用

1. `RepositoryFact` 类型(`{ path, excerpt, revision? }`)进入共享类型层;`VerificationCandidate`/`PendingCandidate` 携带声明,随 candidates.json 持久化。
2. 归一化(任务 1.1):仅 `project_gene` 保留声明;path 相对、越界(`..`/绝对路径)与超长拒绝;excerpt 非空 ≤200;revision 可选 ≤64。无效声明安全丢弃(候选保留、进入待审),不记录无效内容。
3. 验证器测试基线(任务 1.2)重写:指定片段验证、路径越界、文件缺失、片段不匹配、注释行(TS/MD 按扩展名前缀)、revision 匹配/不匹配、超时、git 不可用——13 个场景全部有界 reason code,正文不进审计。
4. 回归基线(任务 1.3):`shouldAutoStore` 移除 project-fact 分支后,session context 与 explicit preference/workflow 直存路径行为不变(11/11 测试)。

## 特点

- 声明与候选正文解耦:改写后的自然语言不再是搜索词,验证只看声明指向的文件片段。
- 注释检测按文件类型(保守前缀集合),未知扩展名回退全集——不确定即待审。

## 边界

- 不迁移存量候选;不实现 preference 累积或项目级配置。
