# Task 8：markdown-state-projection（MEMORY.md 改为 bank 状态投影）

> 本文件是 `openspec/changes/markdown-state-projection` 的分组任务报告（AGENTS.md §7）。
> 覆盖全部三个任务组（tasks 1.1–3.5）与全部四个要素（目的 / 作用 / 特点 / 边界）。

## 变更背景（一句话）

`MEMORY.md` 过去靠"完整 L0 事件历史"重建：条目 = 写入过什么 − 已确认删除了什么，因此每条写入/删除路径都必须正确发事件，漏一次人读层就错（已真实发生过一次）。本变更把条目集合改为**由 bank 当前状态决定**，L0 降级为注解（kind/scope/确认时间/session/position），删除不再需要任何投影逻辑——bank 里没有了，视图里就没有了。

---

## 任务组 1：bank 状态读取原语（Bank state read primitive）

### 目的

先证明"用官方 CLI 读取 bank 当前状态"在真实数据上可用且有界，再写依赖它的投影代码；同时把"失败了会怎样"提前定死，避免失败被当成"空状态"。

### 作用

- 任务 1.1 用真实 bank 勘察 `mnemosyne export`：确认该命令是当前唯一能枚举 bank 当前状态的 CLI 界面，并记录它暴露哪些字段、耗时与解析体积。
- 任务 1.2 落地 `src/markdown-export/bank-state.ts`：固定超时、固定体积上限、临时目录在所有分支清理、失败即返回失败（**绝不返回部分结果**）。
- 只解析 `working_memory` 与 `episodic_memory` 两段，丢弃 embeddings / triples / annotations / canonical facts。

### 特点

- **只读且不落数据根**：export 会写文件，所以实现写进私有临时目录（`mkdtempSync`）并在 `finally` 里 `rmSync`；不碰 bank、不写回 SQLite、不触发 consolidation。
- **有界是可验证的常量**：`BANK_STATE_TIMEOUT_MS = 5_000`、`BANK_STATE_MAX_BYTES = 5 * 1024 * 1024`，由测试断言默认值，不是"看起来很小"。
- **fail-closed 的解析**：`working_memory` 或 `episodic_memory` 任一缺失即判定不可解析（上游 schema 漂移时停在上一次成功投影，而不是静默投影一半）。
- **无 bank 文件 = 空状态，不是失败**：data root 还没有 `mnemosyne.db` 时直接返回 0 行，且**一次 CLI 都不调用**（避免 export 顺手创建空库而污染数据根）。

### 任务 1.1 勘察结论（实测，记录于 `openspec/changes/markdown-state-projection/survey-bank-state-read.md`）

| 指标 | 实测 | D1 预案阈值 | 结论 |
| --- | --- | --- | --- |
| 单 bank 最慢耗时 | 0.305 s | 5 s | 未触发 |
| 单 bank 导出文件最大 | 26 978 B | 5 MB | 未触发 |
| 需解析两段最大负载 | 3 487 B | 5 MB | 未触发 |
| 32 个 bank 并发读取 | 1.328 s 墙钟（生产路径实测 1.446 s） | — | 可接受 |

→ 采用 `mnemosyne export`，**不切换**只读 SQLite；`working_memory` 行暴露 16 个字段，投影只取 `id` / `content` / `timestamp`（+ 透出 `session_id`、`source`、`superseded_by` 供诊断）；`superseded_by` 存在但按 D4 不使用（重复标记仍由自有精确匹配负责）。

### 边界

- 样本是本机 32 个 bank、memory 行合计 7 行、单库 1 MB：它证明"当前规模下预案不触发"，不等于"大库也不会触发"。越界时的行为是**失败并待重试**，不是降级为部分投影。
- 读取粒度是**整库**（export 天然 bank 级）：MEMORY.md 是全局视图，所以要读 default + 所有 project bank，成本随项目数线性增长（32 bank ≈ 1.4 s）。这是已知代价，未做并发上限优化。
- 不提供"列出一个 bank 全部状态"之外的任何上游能力假设；上游若删掉 `export` 或改 schema，行为是投影停在上一次成功内容并保持 `pending`。

### 产出

| 文件 | 作用 |
| --- | --- |
| `src/markdown-export/bank-state.ts` | 有界 bank 状态读取（含 `listBankNames` / `parseBankStateExport` / `createCliBankStateReader`） |
| `src/markdown-export/bank-state.test.ts` | 10 条单测：成功、**真实超时**（挂死子进程）、体积超限、解析失败、无临时残留、无部分状态、schema 漂移 |
| `openspec/changes/markdown-state-projection/survey-bank-state-read.md` | 1.1 勘察记录（字段表 + 实测数字 + 预案不触发结论） |

---

## 任务组 2：双源合并与投影（Dual-source merge and projection）

### 目的

把"条目集合在 bank、分类与溯源在 L0"这件事落成一条**唯一**的投影路径，并删掉旧的双语义路径，让正确性从"每个调用点各自努力"变成"单一路径天然正确"。

### 作用

- 任务 2.1：`collectMemoryAnnotations()` 按 bank memory id 索引 `t1_memory_write`（kind、scope、确认时间、session、position），`projectMemoryEntries()` 以 bank 行为主键合并；**关联不到 L0 的行照样投影**，落入显式 `## Unclassified` 并标注 `source missing`（不猜来源、不伪造 session 引用）。
- 任务 2.2：固定排序键 `(section, L0 position, memory ID)`，未注解行置于该 section 末尾；ID 比较用码点比较（不用 `localeCompare`，避免 locale 影响字节稳定性）。
- 任务 2.3：保留全部既有投影行为——原子替换、section 结构、精确重复 `supersededBy` 标记、损坏事件告警、来源引用字段。
- 任务 2.4：删除旧 L0 折叠实现（`memory_deleted` 按 id 剔除、`session@position` 导出 ID、`legacy-memory-id-unavailable` 诊断）。

### 特点

- **删除不再需要语义解释**：`memory_deleted` 事件仍写进 L0 并仍**触发**一次重投影，但它不再参与条目剔除——条目是否出现只由"bank 里有没有"决定。
- **未注解行是一等公民**：外部工具直接写进 bank 的记忆变可见（这才是"状态里有、溯源缺"的如实表达），而不是被静默丢弃。
- **可复现性有测试托底**：同一 state + 同一注解重复投影逐字节一致，且**打乱输入行顺序仍得到同一输出**（证明排序键是全序、不依赖输入顺序）。
- 测试改造遵循"不删断言"：`exporter.test.ts` / `generators.test.ts` 改为喂 bank 行 + L0 注解，原有断言（section 数、重复标记、隐私脱敏、原子替换、来源可追溯）逐条保留，只替换数据源。

### 边界

- **注解只能来自 L0 事件里的 `memoryId`**：历史 write 缺 `memoryId` 时"注解不上任何行"，该行按未注解处理——不按正文猜、不按时间窗猜。
- 只读 `t1_memory_write`；`memory_deleted` 只作为触发信号，不参与内容。
- 未注解行的行内注解只有 `source missing · bank <name>`，不带日期与 session（无 provenance 就不编造可追溯引用）；需要展示 bank 时间戳是后续可选增强。
- 不改变 daily 路径、`export-state.json` 语义、`forget` 的删除路径、L0 事件格式、bank 存储布局。

### 产出

| 文件 | 作用 |
| --- | --- |
| `src/markdown-export/memory-generator.ts` | 注解索引、双源合并、固定排序键、Unclassified 渲染（旧的 L0 折叠实现已删除） |
| `src/markdown-export/exporter.ts` | 投影前读 bank 状态；`run` 注入点；投影状态与内容指纹 |
| `src/markdown-export/generators.test.ts` | memory 生成的 11 条用例：分组、全 kind 覆盖、scope 注解、重复标记、删除由状态决定、未注解行、悬空注解、排序键、字节一致性、空态 |
| `src/markdown-export/exporter.test.ts` | 21 条：原有用例改喂 bank 行，新增"无 L0 provenance"与"bank 读失败"用例 |

---

## 任务组 3：失败语义与验收（Failure semantics and acceptance）

### 目的

把"投影失败"明确定义为**保持上一次成功的视图并待重试**，并用可执行的验收场景证明：遗忘会消失、无关条目会保留、手工编辑会被纠正、两条看似矛盾的边界其实是两件事。

### 作用

- 任务 3.1：bank 读失败 / 超时 / 解析失败 / 写失败 → 既有 `MEMORY.md` **逐字节不变**，投影状态置 `pending`（写失败置 `failed`），下一次 export 自动重试；**绝不写空投影或部分投影**。
- 任务 3.2：端到端回归场景（真实 `runT1Delete` + 真实 L0 + 真实导出编排，只假 CLI）：写入 A → 导出 → 遗忘 A → 导出，断言 A 消失、无关的 B 保留；另验证手工编辑 `MEMORY.md` 后，下一次 export 即被纠正。
- 任务 3.3：`ARCHITECTURE.md` 与 `MARKDOWN-FORMAT.md` 分别、显式写出两条边界；顺带修正 `README.md` / `GUIDE.md` 中"MEMORY.md 由 L0 派生、latest-wins"的旧口径（同一类漂移口径不留到下一次）。
- 任务 3.4 / 3.5：三条闸门全绿并记录；本报告即 3.5 产出。

### 特点

- **失败与"空状态"被严格区分**：读不到 ≠ 没有记忆。前者保持旧视图并 `pending`，后者才写空态说明行。
- **手工编辑的检测用内容指纹而非新状态机**：`memory-projection-state.json` 增加 `contentHash`（sha256）。导出时若磁盘上的 `MEMORY.md` 与记录的指纹不符（被手工改过或被删掉），即使本次没有任何 memory 相关事件，也触发重建——这使"派生物"这一说法对增量路径也成立；指纹相符时仍走原来的 fast path（既有"第二次 export 不重读 session"的测试继续绿）。
- **端到端只假 CLI**：删除走真实 `runT1Delete`（真实 L0 `memory_deleted` 事件、真实审计），投影走真实 `exportMarkdown`，假件只在"mnemosyne 这一层"（delete 摘掉行、export 吐剩余行），因此这条测试真正覆盖了本变更重定义的边界。
- **两条边界写在同一段里对照**，而不是各写一处让读者自己拼：投影层读整库状态（派生物、只读、有界、低频）；`forget` 绝不扫全库（单 id 精确读或按 id 删除，语义 `recall`/全库 `export`/SQLite 直连都不用）。

### 边界

- 手工编辑的重建语义只保证"下一次**导出**（含自动导出、`--force`、`memoryOnly`）纠正"；没有额外的文件 watcher，不承诺编辑后立即被察觉。
- 端到端测试使用内存假 bank；真实 mnemosyne CLI 只做了一次只读探针（32 bank / 7 行 / 1.45 s），真实"写入→遗忘→导出"人工验证留给发布前冒烟。
- 不做迁移脚本：首次真实运行即产生一次全量重写（`MEMORY.md` 会缩到 bank 里真实存在的行——这正是修复目的），旧内容不影响新投影。
- 不新增配置项、不新增运行时依赖（sha256 用 `node:crypto`）。

### 任务 3.4 实测（三条闸门）

```
pnpm typecheck    → exit 0
pnpm -w run lint  → exit 0   (Checked 146 files in 81ms. No fixes applied.)
pnpm test         → exit 0   (Test Files 72 passed | 4 skipped (76)
                              Tests 702 passed | 7 skipped (709))
```

基线（本次改动前，同一工作树）：`70 passed | 4 skipped (74)` 文件、`684 passed | 7 skipped` 条。变更后净增 2 个测试文件、18 条测试，**无既有测试被删除或跳过**。

端到端场景（`src/markdown-export/memory-projection.integration.test.ts`）实测：写入 A+B → 导出（>`MEMORY.md` 含 A、B）→ `runT1Delete("memory-a")` 返回 `deleted` → 再导出 → A 消失、B 保留。

投影读失败（`exporter.test.ts`）：注入"runner 抛错"与"payload 不可解析"两种失败，均断言 `memoryMd=false`、`memoryProjection=failed`、`MEMORY.md` 与失败前逐字节相同、状态 `pending`，随后重试成功且两条记忆都在。

### 产出

| 文件 | 作用 |
| --- | --- |
| `src/markdown-export/memory-projection.integration.test.ts` | 3.2 端到端回归场景（真实删除生命周期 + 真实投影） |
| `src/markdown-export/exporter.test.ts` | 3.1 读失败/解析失败/写失败三条断言组；3.2 手工编辑被纠正 |
| `ARCHITECTURE.md` | 导出层重写：bank 状态投影 + 失败语义 + "两条边界"对照段；目录树补 `memory-projection-state.json` |
| `MARKDOWN-FORMAT.md` | MEMORY.md 数据源、section 列表（含 Unclassified）、删除由状态驱动、重复标记口径修正、排序键、失败语义、边界；来源可追溯段落区分"有注解"与 `source missing` |
| `README.md` / `GUIDE.md` | 修正"由 L0 派生 / latest-wins"的旧口径 |
| `docs/task-report/dev-8/repo-task8.md` | 本报告 |

---

## 一句话验收结论

`MEMORY.md` 现在是"bank 现在记住了什么"的确定性投影：删除无需事件、外部写入可见、失败只降级为"保持旧视图并待重试"，而 `forget` 的单 id 精确路径与投影层的整库读取是两条被文档显式分开的边界。
