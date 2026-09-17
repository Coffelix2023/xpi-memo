# Task 45 Report — stabilize §4 可观察性与集成回归

- 关联任务:`openspec/changes/stabilize-candidate-auto-admission/tasks.md` §4(4.1–4.3)
- 涉及文件:`src/audit.ts`、`src/candidate-lifecycle.ts`、`src/l0/types.ts`、`src/markdown-export/transformer.ts`、`src/auto-admission.integration.test.ts`、`src/markdown-export/generators.test.ts`、`docs/reports/stabilize-dry-run-2026-09-17.md`
- 日期:2026-09-17

## 目的

让 shadow 阶段的每次验证可复核、可统计,并用真实语料确认零改写。

## 作用

1. 有界审计元数据(任务 4.1):admit 的三条审计路径(failed / shadow / auto-stored)统一记录 `decision`、`excerpt`(≤200)、`line`、相对 `filePath`、`candidateId`、`kind`、`scope`;audit 白名单(`ALLOWED_METADATA_KEYS`)同步扩充;正文/完整文件/绝对路径不落任何记录。
2. L0 与 Markdown 渲染:新增 `tool_verification_shadow` 事件类型并在 transformer 中渲染(否则未知事件回退 JSON dump,被"无 JSON 泄漏"测试拦下)。
3. 端到端集成测试(任务 4.2):离线提取覆盖 shadow 默认(候选保留、审计 shadow、零 T1 写)、显式 opt-in(升级 + stored + `decision: auto-stored`)、验证失败待审、无声明待审(真实验证器);remember/reimport 经由同一 admit 的路径由 index/repo-export 测试与集成测试共同覆盖。
4. 真实语料 dry-run(任务 4.3):117 条存量候选(36 条可验证 kind)声明覆盖率 0%(`no-declaration` ×36),sha256 前后一致确认零改写;报告落 `docs/reports/stabilize-dry-run-2026-09-17.md`,临时脚本已删除。

## 特点

- shadow 是测量机制而非静默降级:reason 分布直接可从 audit.json 汇总。
- dry-run 明确"存量不迁移"是 proposal 的 Non-Goal,0% coverage 是基线而非缺陷。

## 边界

- coverage/precision proxy 的生产测量需新管道产生带声明候选后进行;本报告只固定存量基线。
