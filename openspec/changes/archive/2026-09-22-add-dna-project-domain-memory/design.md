## Context

动机见 proposal.md - Why。与本设计相关的现状约束:

- T1 kind 是 schema 强制的封闭 7 类枚举,新增域要动地基;`art`/`write` 不进 T1。
- 仓库目前**没有任何 YAML 解析依赖**(既有 gotcha:spec 声称的 `.pi/xpi-memo.yaml` 因此从未落地)——本 change 是项目级 YAML 首次真实落地。
- 既有安全边界可直接复用:`content-policy.ts`(可持久化内容判定)与 `memory-safety.ts`(`prepareExternalContent` 凭证脱敏/拒绝)。
- 会话内实测(第一轮评估):微偏好经 `xpi_memo_recall` 召回不可靠,常驻噪声记忆挤占 top5——这是选择"全量注入"而非检索的直接证据。
- Project Trust:项目级 `<cwd>/.pi/` 仅在受信任项目生效,是既有约定。
- Prompt Hygiene:注入必须有界、可移除、空闲不注入(仓库 AGENTS.md 非协商项)。

## Goals / Non-Goals

**Goals:**

- 单文件 `.pi/DNA.yaml` 作为 art/write 两域唯一真相源,fail-closed schema 校验。
- Agent 主写、用户手编双路径,按条目 upsert 合并、冲突保用户版本。
- 域敏感的全量注入交付(前端任务注 art、写作任务注 write、无关会话不注)。
- 与 T1 完全分家:kind 枚举、banks、recall 路径零改动。

**Non-Goals:**

- typesafe/Jev 接入(独立 change `add-typesafe-decision-hooks` 承载)。
- CODE/工程习惯域(仍走 T1 既有路径)。
- 全局(跨项目)DNA、心跳定时刷新、DNA 内容的自动学习/重复检测规则。
- 修改 `shouldAutoStore`、evidence-upgrade 白名单或候选准入政策。

## Decisions

**D1: YAML 用 `yaml` 包的 `parseDocument` 往返编辑,而非整文件序列化。**
条目按 `id` 定位做定点 upsert,保留用户手编的注释与格式——这是 spec"不丢用户内容"要求的唯一可靠实现。备选:整文件重写(丢注释,违背 spec)、退回 JSON(用户已明确选 yaml)。代价:新增一个运行时依赖(`yaml`,MIT、零依赖);同时消除 gotcha `98fb447a` 遗留的"项目级 YAML 无解析器"缺口。

**D2: 条目身份 = 必填 `id`(域内唯一 kebab-case slug)。**
upsert 与冲突判定都要稳定身份。备选:按语义哈希派生(用户改措辞即产生新身份,冲突语义失效)。id 由 Agent 生成、用户可改;schema 校验域内唯一性。

**D3: 注入触发 = prompt 时确定性域检测 + 显式读取工具兜底,不做模型调用。**
会话首 prompt 及后续用户消息经轻量关键词/路径启发式判定域归属(检测词表为代码常量,保守设定);误漏时 Agent 可经显式 DNA 读取工具加载,用户也可直接要求。备选:模型判定域归属(每次 prompt 增加模型调用,违背"钩子内不做重活")、会话启动无条件注入(违背 spec"无关会话不注入")。

**D4: 写入只经工具显式触发,hook 不自动写文件。**
写入路径单一:Agent 调用 DNA 写入工具(强制 `source`/`confidence` 参数)→ schema 校验 → `prepareExternalContent` 安检 → 定点 upsert 落盘。备选:hook 自动抓取写入(违反 git 噪声控制与"Agent 主写但仍可审"的定位)。用户手编不经代码路径,由下次读取与 Git diff 承载审计。

**D5: 注入块格式 = 有界 markdown 块,复用既有注入预算约束。**
沿用 mental-model delivery 的预算思路(条目数与字符上限,超限截断并标注省略),内容标注"项目文件上下文(.pi/DNA.yaml)",使其在上下文中可辨识来源、可被模型移除引用。

## Risks / Trade-offs

- [域检测关键词误判(把无关会话判成前端/写作)] → 检测词表保守;误注入的代价仅是少量上下文(文件本就有界);漏判由显式读取工具兜底。
- [YAML 往返编辑损坏文件] → 落盘前 parseDocument 校验 + schema 校验双闸;失败保留原文件不写;测试覆盖注释保留与往返稳定性。
- [Agent 高频写入造成 git 碎记录] → 写入仅工具显式触发、无 hook 自动写;GUIDE 记录"稳了才写"的使用约定。
- [DNA 与 T1 双边界处内容归属模糊(如'项目卡片用圆角'是 art 还是 project_decision?)] → spec 已定分家线:art/write 域进 DNA,其余进 T1;模糊时按 memory-activation-loop 修改后的回退规则走 T1,不猜域。
- [新运行时依赖 `yaml` 的供应链面] → 单一 MIT 依赖、版本锁 devDependencies 与既有 peer 约定一致;schema 校验在解析之上再收一道。

## Migration Plan

纯增量:无文件 → 功能关闭;旧数据零迁移。回滚 = `git revert` 提交 + 删除 `.pi/DNA.yaml`(T1 不受影响,DNA 非真相源副本)。分两个提交粒度:①schema+读取+注入,②写入工具+activation-loop 路由,各自独立可回滚。

## Open Questions

- 域检测词表的初始内容与后续扩充方式(代码常量起步,不影响 spec 与任务拆分)。
- `confidence` 取值集合(枚举三档 vs 0~1 连续值)——schema 起步用三档枚举,typesafe 接入 change 若要校准再评估,不阻塞本 change。
