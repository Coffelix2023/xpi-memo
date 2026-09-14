# Track B provider-neutral 冒烟记录

- 日期：2026-09-04
- 目的：验证 gated offline extraction 的配置闸门、session shutdown 数据流、治理、审计计数和失败降级。
- 数据根：临时目录 `XPI_MEMO_DATA_DIR=/tmp/xpi-memo-track-b-smoke.aDODfi`，测试结束后已清理。
- runner：测试注入的 provider-neutral fake runner；未写入 API Key、Token、模型地址或记忆正文。

## 配置与结果

| 场景 | 配置 | 结果 |
| --- | --- | --- |
| 默认/关闭 | `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false` | 23 tests passed；runner 不调用、预算不消耗 |
| 开启 | `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` | 65 tests passed；shutdown 调用、治理和审计闭环通过 |
| 相关总计 | — | 110 tests passed |

## 已验证边界

- 只在 `session_shutdown` 运行；`session_before_compact` 只记录 L0，不触发第二次提取。
- 只读取当前 session 的有界尾部事件：最多 200 个、输入字符预算 60,000。
- 每 session 最多一次 runner 执行；成功、失败、不可用、超时均消耗执行预算，重复 shutdown 不重试。
- fake runner 的有效提案经过既有内容策略、路由和 candidate/store 治理；高风险 project kind 不自动确认。
- 敏感内容、非法提案和完整 runner 输出不进入 `audit.json`；审计只保留状态、kind 和计数。
- `status` 可显示 Track B 是否启用及最近状态；关闭配置不产生 runner 调用、预算或提案。
- 临时数据根与仓库现有记忆根隔离；冒烟后临时目录已删除。

## 限制与后续

本轮不是在线真实模型验收：仓库没有具体模型客户端，`pi -e` 命令也不能从命令行注入 `offlineExtractionRunner`。因此尚未测量自然表达提取质量、非空召回改善、重复率或用户 Store/Reject 比例。进入 2–4 周观测前，需要由宿主注入可审计、可回滚的真实 runner，并继续保留上述零容忍项：敏感内容误存、证据伪造和跨 scope 泄漏必须为零。

## 回滚

设置 `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false`；必要时设置 `XPI_MEMO_PAUSED=true`。不删除 audit、candidate、Bank 或 L0 证据。
