# T2 embedding 档位探针（自动生成）

本文件由 `node scripts/t2-eval.ts --embedding-mode cloud --probe-only` 生成。用途：验证云端档的**隐私边界、延迟与失败行为可记录**，不产出召回质量结论。

| 项 | 值 |
| --- | --- |
| runId | `baseline-cloud-probe-2026-09-14T08-47-12-849Z` |
| label | baseline-cloud-probe |
| 场景集 | `docs/evaluation-reports/t2/scenarios.zh.json` v1.0.0 |
| embedding 档位 | `cloud` |
| 注入 env | MNEMOSYNE_EMBEDDINGS_VIA_API, MNEMOSYNE_EMBEDDING_API_KEY, MNEMOSYNE_EMBEDDING_API_URL |
| 外发端点 | http://127.0.0.1:51712/v1/embeddings |
| 平台 | darwin/arm64 / Node v24.20.0 |

## 隐私边界与失败行为

| 项 | 值 |
| --- | --- |
| 外发尝试次数 | 9（sink 收到 9 次请求） |
| 内容离开本机 | 否 |
| 说明 | endpoint 指向本机 sink；只记录外发尝试，内容未向真实第三方发送 |

| 探针 | 结果 | 延迟 | 外发尝试 |
| --- | --- | --- | --- |
| store（写入是否被 embedding 失败阻断） | stored:d8f825a3a2b9e8d2 | 4663 ms | 6 |
| recall（是否降级到 FTS） | ok=true · 结果 1 条 · vec=0 · dense=0 · fts=0.375 · embeddingAvailable=true · fallbackStages=[em_fallback] | 2168 ms | 9 |

