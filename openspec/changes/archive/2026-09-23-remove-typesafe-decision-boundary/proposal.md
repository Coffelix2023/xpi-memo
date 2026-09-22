## Why

`add-typesafe-decision-hooks`（2026-09-22）落地了这个扩展唯一的外发决策边界，但它从未被真实触发过：供应商评估快照只记录 `POST /v1/systemone`、没有 host，本机也没有 `TYPESAFE_API_URL`，三类消费方因此永远停在 `runner-unavailable`；仓库内同样没有任何实测数据能证明它有记忆收益。与此同时它带来约 2.7k 行的模块（含测试）、7 个配置项、跨十余个文件的面板/状态/文档接线，以及一个记忆正文出站点。一个既无收益证据、又无法被用户实际调用的外发边界是负债；在它之上继续叠功能之前先移除，成本最低。

## What Changes

- **BREAKING** 移除七个配置项及其环境变量：`decisionRunnerEnabled`、`decisionRerankEnabled`、`decisionRerankGapThreshold`、`decisionRepeatJudgmentEnabled`、`decisionRepeatThreshold`、`decisionCalibrationEnabled`、`decisionStabilityThreshold`。用户配置里残留的同名键变为惰性未知键——配置对象由显式键映射构造，未知键既不报错也不生效，因此无需迁移。
- 删除 `src/decision/` 整个模块：runner 装配与出站/入站安全、三类问题原语、门控精排、重复稳定性判定、置信度校准、观测账本、类型定义及全部测试。
- 删除 `typesafe-decision-hooks` 能力：规范整节移除，能力目录随归档退出。
- 撤销 `memory-activation-loop` 中该特性新增的两条需求：门控精排、重复 prompt 稳定性判定。
- 移除 recall 排序中专为精排门控服务的 `headGap` 诊断字段（唯一消费方是精排）。
- 移除控制台 Decision 设置组（TUI 与 Glimpse 两侧）、`/xpi-memo-status` 与 doctor 的 decision 计数块、`P3-1-S40`–`P3-1-S46` 七个设置短码，以及双侧面板文案。
- 移除 README（双语）、GUIDE、ARCHITECTURE、TROUBLESHOOTING、`docs/COMPATIBILITY.md` 中对该边界的描述与开关表。
- 保留 `docs/references/jev/` 三份评估快照，并在文档中留一条说明：边界因缺乏可用端点与收益证据被移除，快照是将来重新评估的起点。

## Capabilities

### New Capabilities

无。本变更为纯移除，不引入新能力。

### Modified Capabilities

- `typesafe-decision-hooks`: 整个能力移除，5 条需求全部 REMOVED。
- `memory-activation-loop`: 移除「Recall 精排必须门控、有界且可完全旁路」与「重复 prompt 必须经确定性计数与稳定性判定才产生候选」两条需求；其余 6 条需求不变。

## Impact

- 代码：`src/decision/` 14 个文件（约 2.7k 行，含测试）删除；`src/config.ts`、`src/index.ts`、`src/memory-activation.ts`、`src/recall-ranking.ts`、`src/console.ts`、`src/status.ts`、`src/doctor.ts`、`src/panel-text.ts`、`src/settings-groups.ts`、`src/glimpse/short-codes.ts` 与相关测试同步收缩。
- 行为：默认路径零变化。该特性默认关闭，且没有 endpoint 时本就不发起调用，移除后默认行为与现状一致。
- 外发与密钥：仓库不再有任何决策类出网点，`TYPESAFE_API_KEY` 与 `TYPESAFE_API_URL` 不再是本扩展读取的环境变量；记忆正文外发面收窄为一个（原有的外部内容安全边界之外不再有第二个消费方）。
- 配置兼容：残留键被忽略，不报错、不迁移；无 schema 变更、无数据迁移、无 L0/T1 数据改动。
- 治理边界：`shouldAutoStore`、`autoConfirm`、evidence-upgrade 白名单与 T1 kind 枚举本就被该特性明确避开，本次移除同样不触碰。
- 文档与设计产物：4 份根文档 + `docs/COMPATIBILITY.md`；两份 `.pi/prototype-design/*/semantic-ui-map.yaml` 已核对，其中没有任何条目绑定到被删的决策边界设置字段，无需同步。
- 回滚：移除是单步提交，`git revert` 即可恢复；恢复所需的供应商文档快照仍留在仓库内。
