# 中文场景集人工检查记录

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 1.2。

**作用**：逐条确认 `scenarios.zh.json` 里每个样本都有**唯一的标准答案**和**可追溯的证据来源**，避免拿「模型觉得像」当正确答案。

**检查方式**：机械校验交给 `scripts/t2-eval.ts` 的 `validate()`（id 唯一、正文/证据/来源非空、groundTruth 必须存在于语料且落在对应 bank、confidence 越界即拒绝、query 与 answer 非空），语义正确性由人工逐条比对下表。

---

## 1. 覆盖面

| category | 场景数 | 覆盖目标 |
| --- | --- | --- |
| `user_preference` | 3 | 用户偏好（回答结构、评审话术、提交前检查） |
| `project_continuity` | 3 | 项目连续性（既有决策、硬约束、数据目录约定） |
| `mixed_tech` | 3 | 中英混合技术（环境变量、CLI 参数、治理流程） |
| `multi_hop_zh` | 3 | 中文多跳语义（query 只给一端，必须经中间记忆才能到答案） |

语料 22 条：12 条答案记忆 + 10 条干扰记忆（distractor）。

## 2. 逐条检查

| scenario | 类别 | query | 标准答案（`answer`） | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| s-pref-01 | user_preference | 我平时希望你怎么组织回答？ | 先给结论再给理由，不要客套开场白 | `m-pref-01`（user-stated） | ✅ 唯一答案，干扰项 `d-pref-01` 讲文档语言，不回答「怎么组织回答」 |
| s-pref-02 | user_preference | 代码评审的时候我要什么样的话术？ | 只报告问题与风险，不写鼓励性评语 | `m-pref-02`（user-stated） | ✅ 唯一答案，干扰项 `d-pref-02` 讲周报 |
| s-pref-03 | user_preference | 提交之前我一般要走哪些检查？ | typecheck、lint、test 三条命令全绿 | `m-pref-03`（user-stated） | ✅ 唯一答案 |
| s-proj-01 | project_continuity | 我们之前定过检索层怎么选吗？ | 放弃自研向量库，改用现成 CLI，只保留可回滚的派生索引 | `m-proj-01`（verified-tool-result） | ✅ 唯一答案，干扰项 `d-proj-01` 讲日志层 |
| s-proj-02 | project_continuity | 这个项目对云端服务有什么限制？ | 不允许把记忆正文发送到云端 embedding 服务 | `m-proj-02`（user-stated） | ✅ 唯一答案；`m-proj-01` 含「云端」但不回答限制 |
| s-proj-03 | project_continuity | 运行时数据放在哪？ | 固定在仓库之外的运行时数据目录，仓库内不放 | `m-proj-03`（verified-tool-result） | ✅ 唯一答案，干扰项 `d-proj-02` 讲时区 |
| s-mix-01 | mixed_tech | XPI_MEMO_PAUSED 打开后会发生什么？ | 捕获与召回同时停止，只保留只读状态查询 | `m-mix-01`（verified-tool-result） | ✅ 标识符**只出现在答案记忆里**，无第二个候选 |
| s-mix-02 | mixed_tech | 为什么 recall 一定要加 --explain？ | 否则读不到 `embedding.available` 字段 | `m-mix-02`（verified-tool-result） | ✅ 唯一答案，干扰项 `d-mix-01` 讲 ripgrep 参数 |
| s-mix-03 | mixed_tech | 候选队列超预算怎么处理？ | 只做截断，不允许自动确认 | `m-mix-03`（verified-tool-result） | ✅ 唯一答案 |
| s-hop-01 | multi_hop_zh | xpi-memo 默认走哪档 embedding？ | 默认本地模型档位，云端默认关闭 | 答案 `m-hop-02`；bridge `m-hop-01`（仓库名→代号） | ✅ 需两跳；bridge 命中算相关但不等于答对 |
| s-hop-02 | multi_hop_zh | 上游没有精确 ID 读取命令会影响哪个流程？ | 影响遗忘流程：删除能力依赖上游精确 ID 读取，缺失时不能保证先写 recovery 再 delete | 答案 `m-hop-03`；bridge `m-hop-04`（上游能力→petrel 删除能力） | ✅ 需两跳；query 不含「遗忘」字样 |
| s-hop-03 | multi_hop_zh | 我在跟你说话的时候，屏幕上那行提示能带原文吗？ | 不能：状态提示走流光通道，通道不携带记忆正文 | 答案 `m-hop-06`；bridge `m-hop-05`（屏幕提示→流光通道） | ✅ 需两跳；query 用口语指代，不含「流光」「状态提示」 |

**证据来源如何可验证**：每条记忆写入 Mnemosyne 时，`source` 字段写为 `kind=<kind>;ev=<evidence>;prov=t2eval/1.0.0#<记忆 id>;ts=<ISO>;src=<场景集路径>`。评测报告用 `prov` 反解 `datasetId`，所以「命中」与「证据可追溯」在这次评测里是同一件事——对不上 id 就不算命中。

## 3. 干扰记忆清单（不得作为答案）

| 记忆 id | 为什么是干扰项 |
| --- | --- |
| `d-pref-01` | 同为 global_preference，但主题是文档语言而非回答结构 |
| `d-pref-02` | 同为 global_workflow，但主题是周报 |
| `d-proj-01` | 同为 project_decision，但主题是日志层 |
| `d-proj-02` | 同为项目环境类，但主题是时区缺陷 |
| `d-mix-01` | 同含 CLI 参数，但主题是 ripgrep |
| `d-mix-02` | 同为治理/审计类，但主题是 operationId 关联 |
| `d-hop-01` | 含 `petrel` 字面，但对 s-hop-01 不回答档位 |

## 4. 已确认的样本边界

- 全部内容为虚构项目（`petrel` / `xpi-memo` 代号关系）与虚构偏好，不含真实用户数据、真实路径或密钥。
- 每条记忆的 `confidence` 已按重要性显式给定，且都在 `(0, 1]` 区间内。
- `expectation=observe` 的三条多跳场景不判缺陷，但仍计入 `hitRate`，用于量化中文多跳缺口。
- 语料里**故意保留**了语义相近的干扰项：没有干扰项就测不出误召回。
