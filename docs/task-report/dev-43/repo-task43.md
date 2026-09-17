# Task 43 Report — stabilize §2 统一候选准入决定

- 关联任务:`openspec/changes/stabilize-candidate-auto-admission/tasks.md` §2(2.1–2.4)
- 涉及文件:`src/candidate-lifecycle.ts`、`src/auto-store-policy.ts`、`src/pending-candidate.ts`、`src/index.ts`、`src/repo-export.ts`、`src/offline-extraction.ts`、`src/candidate-lifecycle.test.ts`
- 日期:2026-09-17

## 目的

消除三套并存的准入判据(`generatePendingCandidate`、`autoConfirm`、`shouldAutoStore`),让每个候选入口获得唯一、可审计的准入决定。

## 作用

1. `autoConfirm` 重构为 `admit`(candidate store 接口),决策顺序固定:kind policy → 验证 → 白名单内证据升级 → rollout。
2. 三入口接线(任务 2.3):离线提取(带声明)、`xpi_memo_remember`(无声明 → pending)、repository reimport(无声明 → pending)全部调用同一决定。
3. 删除 `shouldAutoStore` 不可达的 gene/constraint 分支与 `verified` 入参(任务 2.2);`verified: false` 四处调用点同步清理。
4. 证据升级守卫(任务 2.4):仅 `l0-conclusion` 调用 `upgradeEvidence`;`verified-tool-result` 等其他类型永不进入升级路径,白名单 throw 成为不可达的最后防线——异常不再可能冒泡到工具调用者(闭合 OG-5 的抛错隐患)。

## 特点

- 决定失败不抛工具可见异常:验证失败/超时/不可用/缺声明一律 pending + 有界审计。
- 拒绝与 pending 复用既有 `routing_rejected`/候选队列语义,零新增审计格式负担。

## 边界

- remember 公开工具参数不变;无声明时自动写入不可能发生。
