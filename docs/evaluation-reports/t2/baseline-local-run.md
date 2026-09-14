# T2 baseline 评测报告（自动生成）

本文件由 `node scripts/t2-eval.ts` 生成，请勿手改；改动场景集或基线后重新生成。

## 1. 运行元数据

| 项 | 值 |
| --- | --- |
| runId | `baseline-local-2026-09-14T08-47-05-755Z` |
| 标签 | baseline-local |
| 场景集 | `docs/evaluation-reports/t2/scenarios.zh.json` v1.0.0（zh-CN）|
| 开始 / 结束 | 2026-09-14T08:46:48.911Z → 2026-09-14T08:47:05.755Z |
| 总耗时 | 16851 ms |
| 平台 | darwin/arm64 / Node v24.20.0 |
| embedding 模型 | BAAI/bge-small-en-v1.5 (config.yaml) |
| embedding 档位 | `local`（env: 无） |
| 隐私边界 | outboundEndpoint — · 外发尝试 0 次 · 内容离开本机：否 |
| 后端探测 | mnemosyne=available · ripgrep=available · qmd=missing |
| 语料 | 22/22 条写入成功，project bank `project-t2eval` |

## 2. 汇总指标

| 指标 | 值 |
| --- | --- |
| 命中率（全部场景） | 66.7% |
| 命中率（expectation=hit 场景） | 88.9% |
| MRR | 0.667 |
| 误召回率（top-k 内非相关条目占比） | 40.0% |
| 证据完整率（kind + prov 可解出，空结果不计入） | 100.0% |
| 延迟 p50 / p95 / min / max | 736 / 774 / 360 / 774 ms |
| 资源占用 | RSS 增量 4.0 MB，隔离 data dir 2.1 MB |

## 3. 分类别

| category | 场景数 | 命中率 | 误召回率 | 证据完整率 |
| --- | --- | --- | --- | --- |
| user_preference | 3 | 100.0% | 16.7% | 100.0% |
| project_continuity | 3 | 100.0% | 48.9% | 100.0% |
| mixed_tech | 3 | 66.7% | 38.9% | 100.0% |
| multi_hop_zh | 3 | 0.0% | 55.6% | 100.0% |

## 4. 逐场景记录

| scenario | category | expectation | 命中 | 命中位次 | bridge 位次 | 精度 | 误召回 | 证据完整 | 延迟 | 降级 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s-pref-01 | user_preference | hit | ✅ | 1 | — | 1.00 | 0/1 | 100.0% | 366 ms | none |
| s-pref-02 | user_preference | hit | ✅ | 1 | — | 1.00 | 0/1 | 100.0% | 364 ms | none |
| s-pref-03 | user_preference | hit | ✅ | 1 | — | 0.50 | 1/2 | 100.0% | 360 ms | none |
| s-proj-01 | project_continuity | hit | ✅ | 1 | — | 0.20 | 4/5 | 100.0% | 732 ms | none |
| s-proj-02 | project_continuity | hit | ✅ | 1 | — | 1.00 | 0/1 | 100.0% | 750 ms | none |
| s-proj-03 | project_continuity | hit | ✅ | 1 | — | 0.33 | 2/3 | 100.0% | 736 ms | none |
| s-mix-01 | mixed_tech | hit | ✅ | 1 | — | 0.33 | 2/3 | 100.0% | 774 ms | none |
| s-mix-02 | mixed_tech | hit | ❌ | — | — | 0.00 | 0/0 | — | 749 ms | none |
| s-mix-03 | mixed_tech | hit | ✅ | 1 | — | 0.50 | 1/2 | 100.0% | 761 ms | none |
| s-hop-01 | multi_hop_zh | observe | ❌ | — | 1 | 0.33 | 2/3 | 100.0% | 741 ms | none |
| s-hop-02 | multi_hop_zh | observe | ❌ | — | 1 | 1.00 | 0/1 | 100.0% | 729 ms | none |
| s-hop-03 | multi_hop_zh | observe | ❌ | — | — | 0.00 | 2/2 | 100.0% | 740 ms | none |

## 5. 未命中场景明细

### s-mix-02（mixed_tech, expectation=hit）

- query: `为什么 recall 一定要加 --explain？`
- 标准答案: 否则读不到 embedding.available 字段。（groundTruth: m-mix-02；bridge: 无）
- 实际返回:
  - （空）

### s-hop-01（multi_hop_zh, expectation=observe）

- query: `xpi-memo 默认走哪档 embedding？`
- 标准答案: 默认本地模型档位，云端默认关闭（query 只给仓库名，需先经项目代号跳到 petrel）。（groundTruth: m-hop-02；bridge: m-hop-01）
- 实际返回:
  - #1 m-hop-01 score=0.476 · 本仓库 xpi-memo 的项目代号是 petrel。
  - #2 m-mix-01 score=0.470 · XPI_MEMO_PAUSED=1 时捕获与召回同时停止，只保留只读的状态查询。
  - #3 m-hop-05 score=0.452 · 界面层的状态提示走流光通道，默认显示等级是灰度。

### s-hop-02（multi_hop_zh, expectation=observe）

- query: `上游没有精确 ID 读取命令会影响哪个流程？`
- 标准答案: 影响遗忘流程：删除能力依赖上游精确 ID 读取，缺失时不能保证先写 recovery 快照再 delete。（groundTruth: m-hop-03；bridge: m-hop-04）
- 实际返回:
  - #1 m-hop-04 score=0.392 · petrel 的删除能力依赖上游 mnemosyne 提供的精确 ID 读取命令…

### s-hop-03（multi_hop_zh, expectation=observe）

- query: `我在跟你说话的时候，屏幕上那行提示能带原文吗？`
- 标准答案: 不能：状态提示走流光通道，流光通道在任何情况下都不携带记忆正文。（groundTruth: m-hop-06；bridge: m-hop-05）
- 实际返回:
  - #1 m-hop-04 score=0.387 · petrel 的删除能力依赖上游 mnemosyne 提供的精确 ID 读取命令…
  - #2 m-proj-03 score=0.385 · petrel 的运行时数据目录固定在仓库之外，仓库内不存放运行时数据。

## 6. 降级结果记录

用途：验证降级结果可被机器记录（格式定义见 `result-format.md`）。`expectedWarning` 引用 `src/search/selector.ts` 的固定文案，非本 runner 实测输出。

| probe | backendName | observed | resultCount | expectedWarning |
| --- | --- | --- | --- | --- |
| backend-missing | null | backend-failed:spawnSync mnemosyne ENOENT | 0 | no search backend available — recall returned empty; install mnemosyne (uv tool install mnemosyne-memory) or ripgrep, or configure xpi_memo.searchBackend |
| backend-error | null | backend-failed:FileExistsError: [Errno 17] File exists: '<tmp>/t2eval-p2mADI/mnemosyne.db' | 0 | no search backend available — recall returned empty; install mnemosyne (uv tool install mnemosyne-memory) or ripgrep, or configure xpi_memo.searchBackend |

## 7. 原始记录

同目录 `baseline-local-run.json` 保存全部原始字段（逐场景 attempts、命中位次、分项指标），供结果比对与回放。

