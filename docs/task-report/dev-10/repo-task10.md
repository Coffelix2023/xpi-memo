# Task 1 Report — 评估基线与数据集

对应 `openspec/changes/evaluate-t2-memory-enhancement` 任务 1.1 / 1.2 / 1.3。

## 目的

在决定是否接入任何外部记忆工具之前，先把「现在的系统长什么样、中文场景下它到底行不行」变成可复现的事实。没有这一步，后面四个候选的对比就只是拿不同机器的不同参数互相比较，数字没有意义。

具体做三件事：钉住基线快照（1.1）、造一套可重复的中文考卷（1.2）、规定「考完怎么记分」（1.3）。

## 实现

### 1.1 基线快照 — `docs/evaluation-reports/t2/baseline.md`

固定了 xpi-memo `1.1.1`（git `ed18786`）+ Mnemosyne `3.15.1` 的版本、生效配置、召回输出格式（CLI JSON → `RecallResponse` → 模型可见 JSON 三层）、指标口径来源，并附 `pnpm typecheck` / `pnpm -w run lint` / `pnpm test` 结果作为「现有行为未被改变」的证据。

记录了一条对结论有决定性影响的事实：基线默认 embedding 模型是**英文单语**的 `BAAI/bge-small-en-v1.5`（384 维，本地 fastembed）。中文语义召回在基线里从未被专门优化——这是待量化的缺口，不是配置事故。

### 1.2 中文场景集 — `docs/evaluation-reports/t2/scenarios.zh.json` + `scenario-review.md`

22 条虚构语料（12 条答案 + 10 条干扰）+ 12 条场景，四类各 3 条：用户偏好、项目连续性、中英混合技术、中文多跳语义。

每条记忆都带 `evidence`（证据类型）与 `provenance`（`t2eval/1.0.0#<记忆 id>`），写入 Mnemosyne 时落在 `source` 字段里。这样**「命中」与「证据可追溯」是同一件事**：返回结果对不上 `prov` 里的 id 就不算命中，不存在「答得像但没来源」的模糊地带。

多跳场景额外标了 `bridge`（到达答案的中间证据），并且 `expectation=observe`——记录事实而不判缺陷，因为它们正是本次要量化的缺口。

每条样本的标准答案与证据来源在 `scenario-review.md` 里逐条人工核对过。

### 1.3 记录格式 + 报告生成 — `docs/evaluation-reports/t2/result-format.md` + `scripts/t2-eval.ts`

格式覆盖 spec 要求的五项：召回质量（hit / hitRank / MRR / precision）、误召回（非相关条目占比）、证据完整性（kind + prov 可解出）、延迟（p50/p95，含每个场景跨 bank 的全部调用）、降级（attempts / embeddingAvailable / fallbackStages / warning / 两个受控探针）与资源占用（RSS 增量、data dir 字节）。

`scripts/t2-eval.ts` 是纯 Node 标准库的 runner：读场景集 → fail-closed 校验 → 在**临时 `MNEMOSYNE_DATA_DIR`** 里重建语料 → 逐场景召回 → 写 `<label>-run.json` 与 `<label>-run.md`。候选用同一个脚本换 `--label` 即可对比。

## 特点与边界

- **零生产代码改动**：只新增 `docs/` 与 `scripts/` 下的评估产物；`src/**` 一行未动，`pnpm test` 702 passed 与改动前一致。
- **不碰用户数据**：语料建在 `mkdtemp` 出来的临时目录，跑完即删；`MNEMOSYNE_LLM_ENABLED=false`，不外发记忆正文。
- **runner 不导入 `src/**`**：Pi 的源码用 `.js` 扩展名导入 `.ts`，Node 原生类型剥离解析不了，而 vitest 里跑会产生写文件的副作用测试。因此 runner 直接调 Mnemosyne CLI 并自行归一化——它测的是**契约层**（`recall <q> <k> --explain --json` + `source` 元数据），不是复刻 xpi-memo 的实现。
- **降级探针的 `expectedWarning` 是引用而非实测**：那串文案来自 `src/search/selector.ts`，runner 没有执行选择器，因此在字段名上明确标注「预期」，不把源码常量冒充观测。
- **`scripts/t2-eval.ts` 不在 `tsconfig.json` 的 `include` 范围内**（与既有 `scripts/bench.ts` 一致），`pnpm typecheck` 不覆盖它；实际执行方式是 `node scripts/t2-eval.ts`（Node 原生类型剥离）。
- 硬门槛判定、候选排序都不在本任务范围（属于 2.x / 5.2）。

## 首轮结论（`baseline-findings.md`）

- 中文多跳 **0%** 命中，但两条场景的 bridge 命中位次是 1 —— 检索找到了中间证据，缺的是「再走一跳」。这是轻量证据图唯一的硬价值证据。
- `s-mix-02` 返回空的根因被定位到阶段数据：`wm_primary: raw_count=2, after_filter_count=1, kept_count=0`，候选过了 filter 被最终阈值丢掉，`em_fallback` 无补位。属于静默失败，需要在状态字段里可见。
- 误召回率 40%，主要来自「同类别不同主题」，不是语义漂移；单纯提升相似度不会降低它。
- 证据链不是瓶颈：返回结果 100% 可解出 kind + prov。

## 验证

- `pnpm typecheck` → 通过（exit 0）
- `pnpm test` → 702 passed | 7 skipped（72 文件通过，4 跳过）
- `pnpm -w run lint` → 本变更涉及的文件（`scripts/t2-eval.ts`、`scenarios.zh.json`、`biome.jsonc`、`docs/evaluation-reports/t2/*`）全部通过；仓库整体仍有 1 个**既有**失败文件 `docs/reports/token-analysis.html`（用户未提交的文档搬迁产物，biome 对其中压缩 CSS 报 `useSortedProperties`，与 `.pi/reports` 被排除的原因相同），未在本任务处理。
- `node scripts/t2-eval.ts` → 12 场景全部执行，生成 `baseline-run.json` + `baseline-run.md`，耗时约 18–20 s。
- `biome.jsonc` 两处调整：① `scripts/t2-eval.ts` 加入中文话术豁免 `noSecrets` 的既有 override（中文提示语被误判高熵字符串）；② 排除 runner 生成的 `*-run.json`（键序由 runner 决定，不是手写数据）。
