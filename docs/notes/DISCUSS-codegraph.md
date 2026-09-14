# xpi-memo 不引入 codegraph / code-review-graph

## Summary

**结论：xpi-memo 产品内不引入两者。** 代码拓扑不是 T1 记忆。本仓只补一层职责边界，不装依赖、不注册图工具、不桥 MCP。

用户已选定落点：**不引入（推荐）**。Pi 全局 MCP、双图共存都不做。

## 第一性：问的不是「图好不好」，是「该不该进这个扩展」

`xpi-memo` 的契约（`AGENTS.md` + `skills/memory-boundaries/SKILL.md` + `package.json` description）：

- **L0**：当前会话 append-only 事件迹，不进 T1。
- **T1 Mnemosyne**：跨会话事实、偏好、workflow、已验证项目事实、需确认的决策/gotcha。
- **T2 `ai-memory` / T3 Memvid**：独立层，禁止随意选引擎、禁止跨层复制原文。

codegraph / CRG 回答的是 **where / who-calls-whom / blast radius / 这次 diff 波及谁**。这是可重建的派生索引，和「为什么这样决策」正交。塞进 T1 会：

1. 越权（把静态代码地图当记忆写）。
2. 污染 kind 表（现有 7 种 kind 没有「符号拓扑」）。
3. 让 agent 在 remember/recall 和图查询之间选错工具。
4. 违反 Prompt Hygiene：空闲不注入；图工具常驻会占工具表。

**梯子停在第 1 档：这个需求不该存在于 xpi-memo。** 结构导航已经有现成层。

## 现成能力（不必再买一张图）

当前 Pi 会话已经在用 **pi-lens review graph**，本仓实测可用：

- `project_report`：hubs / entry / cycles / layering / risk
- `module_report` + `blastRadius` + `callGraph`
- `read_symbol` / `lsp_navigation`（definition / references / incomingCalls）

对本仓体量（~54 源文件、TypeScript 单包 pi-extension）这已经覆盖 openspec 回访的「定位 + 影响面」。再挂一张全仓 tree-sitter 图，省下的发现成本会被 **工具表膨胀 + 残留上下文** 吃回去。

codegraph 自己也写了：吞吐 token 可降，但多轮会话里 **残留上下文大约多 80%**（VS Code 例：67k vs 18k）。小窗口长会话不赚。

## 两份仓库的真实画像（纠正笔记）

`docs/code-map-notes/codegraph/codegraph-notes.md` 里有几处硬伤，决策以仓库 README / GitHub API 为准，不以那份讨论文为准。

| 事实 | codegraph | code-review-graph |
|---|---|---|
| GitHub | [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) · **69,071** stars · 主语言标 C，kernel 是 **Rust** | [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) · **31,069** stars · **Python 3.10+** |
| 内核 | Rust + tree-sitter + SQLite（`.codegraph/`） | Tree-sitter + SQLite（`graph.db`） |
| 查询入口 | **现状/符号**：默认 **1 个 MCP 工具** `codegraph_explore` | **变更/review**：README 写 27、源码 `__init__.py` 列到 **28** 个工具 |
| 自测主场 | 架构问答：工具调用 −88%、token −62%、提速 53%（7 仓、Opus 4.8、厂商自测） | Flask review：宣称 ~71× token 削减（厂商自测） |
| 嵌入 | npm `@colbymchenry/codegraph`，库模式要 **Node 22.5+ `node:sqlite`** | `pip`/`uv` CLI + MCP |
| 安装器覆盖 | Claude/Cursor/Codex/OpenCode/Gemini/… **没有 Pi** | 同样一堆 IDE/CLI，**没有 Pi** |
| 进程模型 | 后台 watch + daemon | watch / git hook + 可选 embedding |

笔记里这些对比 **作废**：

- 「CRG 才用 tree-sitter、codegraph 用杂牌 parser」——两者都是 tree-sitter。
- 「codegraph 存内存/易失、CRG 才 SQLite」——codegraph 也是 SQLite。
- 「CRG 更契合 FastAPI/Python 同构」——xpi-memo 是 **TypeScript pi-extension**，不是 FastAPI 后端。
- 「68.5k 所以必须上」——star 数不是本仓职责论据。
- 「把 CRG `import` 进 FastAPI 再 `remember` 签名」——直接违反 T1 内容策略（禁止把原始结构摘要当记忆）。

两者都不是记忆体。**不是二选一进 xpi-memo。** 若将来在 **Pi 环境**（不是本扩展）要结构层：默认只考虑 codegraph 的单工具 MCP；CRG 只在「每次 PR 都要 test-gap / 风险分」时才值得。那是另一份环境配置，不在本次范围。

## 行为 / API / 类型

**无运行时行为变化。** 不新增 tool、kind、search backend、peerDependency、MCP。

唯一产品面文字：把「代码拓扑不属于 xpi-memo」写成仓库事实，避免下次会话再争论。

## 要改的工件（最短 diff）

1. **新建** `docs/code-map-notes/codegraph/DECISION.md`  
   固化本结论：不引入、职责正交、笔记错误清单、何时才值得在 Pi 环境另议。`.codegraph/` / `graph.db` 若有人本地生成，gitignore，不进 git。

2. **改** `AGENTS.md`  
   - 填现有 `TODO: 定义本扩展职责边界`：T1 记忆治理；**不做**代码图谱、blast radius、PR review 流水线。  
   - 禁止清单加一条：❌ 引入 codegraph / code-review-graph（依赖、MCP 桥、search backend、把符号拓扑写入 T1）。

3. **改** `skills/memory-boundaries/SKILL.md`  
   加一段 **Out of scope**：代码结构查询走 pi-lens / LSP；禁止 `xpi_memo_remember` 存 call graph / 文件地图 / spec↔symbol 链接表。

4. **改** `CONTEXT.md`  
   加术语：`代码拓扑` = 可重建派生索引，非 T1；`codegraph`/`CRG` = 外部环境可选，非本扩展能力。

5. **不改** `docs/code-map-notes/codegraph/codegraph-notes.md` 正文（保留讨论原文）。在 `DECISION.md` 声明该笔记仅作史料，与仓库事实冲突时以 `AGENTS.md` + `DECISION.md` 为准。

**明确不做：**

- `package.json` 依赖 / pi manifest 技能 / 新 tool
- spec↔symbol 三元组进 Mnemosyne
- 给 openspec 写 codegraph system prompt
- 本仓 `codegraph init` / `code-review-graph install`
- 双图共存路由

## 验收

- `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 全绿（文档改动，预期无测试变化）。
- 仓库内 grep：`codegraph` / `code-review-graph` 只出现在 `docs/code-map-notes/` 与边界声明，不出现在 `src/`。
- Agent 读 `AGENTS.md` 能直接得出：结构问题用 pi-lens，记忆问题用 T1 tools。

## Assumptions（已锁定）

- 落点 = **产品不引入**；不是「Pi 全局先挂 MCP」。
- 本仓规模不构成自建/外挂全仓图的理由。
- 厂商基准不外推到 openspec 返工；即使基准成立，也 spl 在错误层。
- 若以后要在 Pi 里用结构层：另开环境配置任务，默认单挂 `codegraph_explore`，CRG 默认仍不装。
