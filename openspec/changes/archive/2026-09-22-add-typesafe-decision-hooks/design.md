## Context

动机见 proposal.md - Why。相关现状约束:

- 评估依据已固化在 `docs/references/jev/`(introduction / llms 索引 / 发布文三份快照):Jev 是 System One 模型,只回答 Choice/Score/Noul 三类封闭问题,返回类型化答案 + 校准概率 + 置信度;不生成文本、不能替代会话 LLM;70~500ms、early access、纯云端。
- 既有 provider-neutral 先例:mental-model synthesis 边界(注入式 runner、慢/挂/不可用不阻塞生命周期、出站 `prepareExternalContent`、入站 `isPersistableContent`)——决策 runner 照此模式做。
- 第一轮实测证据:recall top5 被两条常驻记忆挤占(5/5、4/5),目标记忆落榜;官方 cookbook 有 rerank 提升 top-1 的对照数据。
- 政策红线(memory #4 与 spec 双重约束):不改 `shouldAutoStore`、`autoConfirm`、evidence-upgrade 白名单;`sleep` 禁止后台触发。
- 第二轮死结:同会话重复可能是挫败、跨会话重复才近似稳定——纯规则判不了语义,须靠判定器;但计数必须确定性(L0)。

## Goals / Non-Goals

**Goals:**

- 一个 provider-neutral 决策 runner 出口,三个消费方(门控精排、重复稳定性判定、置信度校准)共用,默认全关、逐项可开。
- 任何供应商故障 fail-open,会话永不被阻塞,失败可观测。
- 出站脱敏、入站回筛双向安全,密钥只走环境变量。
- 准入政策与白名单零改动,校准值走既有"最低置信度"偏好消费。

**Non-Goals:**

- 替代会话 LLM、memory/mental-model 内容生成(Jev 不产文本,结构性不胜任)。
- 仓库事实核验(verifyProjectGene——需跑代码,超出文本 state 能力)。
- 修改 `shouldAutoStore`/`autoConfirm`/evidence-upgrade 白名单、T1 kind 枚举。
- DNA 内容生成与 DNA 域内校准(由 `add-dna-project-domain-memory` 合并后再评估,不阻塞本 change)。
- 心跳/定时刷新、`sleep` 授权路径。

## Decisions

**D1: 单一 runner 出口 + 每消费方独立开关。**
一个 `src/decision/` 装配点封装三类问题原语(Choice/Score/Noul),`config.ts` 增加 runner 总开关(默认 off)与三个消费方子开关。备选:每消费方各接一个供应商客户端(三倍安全/预算代码,违背复用)。总开关关闭 = 结构性零网络调用,这是"供应商停服不构成功能故障"的实现基础。

**D2: 精排门控 = 粗排头部分差阈值,粗排失败即旁路。**
只有"接近难分"才花调用;门控本身零成本确定性计算。备选:全量精排(每次 recall 都花钱加延迟,第一轮实测多数查询粗排头名其实明确)、置信度自适应阈值(过度设计,先用固定分差)。精排只重排头部 K 条,成员与预算锁死,保证关闭/失败时逐字节回退。

**D3: 重复判定两段式:L0 确定性计数(免费) → Noul 判定(达阈值才花钱)。**
同义匹配用既有的 embedding/摘要近似(复用 candidate-digest 思路),计数不调模型;挫败型重复("为什么又挂了")天然被 Noul 低概率挡掉。备选:全部重复都问模型(费钱且多数无意义)、纯规则判语义(第二轮已证明判不了)。候选治理:达阈值只产**待审候选**,绝不自动入库——不碰准入政策。

**D4: 校准值 = confidence 的新来源标注,不新增证据类型。**
在校准值上标 `source: calibrated` 类标注即可被既有最低置信度偏好消费;不新增 evidence type(那会触碰 evidence 白名单红线)。备选:新增 evidence type(越线,拒)。

**D5: SDK 选型走裸 HTTP 优先。**
评估期先用 fetch 直连 `POST /v1/systemone`(接口面极小:state + questions),避免为一个端点引入整套 SDK 依赖;接口稳定后再评估换官方 SDK。备选:直接上官方 JS SDK(多一个运行时依赖,而我们只用一个端点)。风险:裸 HTTP 需自行跟随 API 变更——用 docs 快照 + 集成测试锁行为。

## Risks / Trade-offs

- [供应商 early access / 停服 / 定价变化] → 默认关 + fail-open + 裸 HTTP 单端点,断供即回退现状,零代码改动可永久关闭。
- [出网点泄露记忆内容] → `prepareExternalContent` 前置 + 无法确认安全拒发 + 门控减少外发频次;doctor 只报计数不报正文。
- [入站回答被注入] → 复用既有注入判定回筛,命中即丢弃并 fail-open;回答只影响排序/候选队列,不直写 T1(重复判定结果只进待审队列)。
- [门控阈值设错导致精排很少/很频繁触发] → 门控计数可观测,阈值进配置可调,先保守后调参。
- [同义重复计数的 embedding 近似误合并两条不同 prompt] → 计数只产生"达阈值才判定"的机会,误合并的最终损害上限是一次多余 Noul 调用 + 低概率丢弃,不会误入库。
- [校准值污染准入] → 校准只覆盖 confidence 数值与来源标注,准入逻辑零改动;runner 关闭时值与来源原样保留。

## Migration Plan

纯增量、默认关闭。落地顺序:①runner 边界 + 安全 + 可观测(不接任何消费方,零行为变化)→ ②门控精排 → ③重复判定 → ④校准标注。每步独立提交、独立可回滚(`git revert` + 关开关)。无数据迁移,无 schema 变更。

## Open Questions

- 门控分差阈值与稳定性概率阈值的初值(建议起步:分差 0.05、概率 0.9,以 doctor 门控计数为调参依据)——不改 spec、不改任务拆分,实现后按观测调。
- 同义匹配用 embedding 还是 candidate-digest 摘要比对(实现细节,复用既有能力优先,任务里二选一落地)。
