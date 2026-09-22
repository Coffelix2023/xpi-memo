## REMOVED Requirements

### Requirement: 决策 runner 必须 provider-neutral 且默认关闭

**Reason**: 该边界自 2026-09-22 落地起在本机从未被真实触发：供应商评估快照只记录 `POST /v1/systemone`、没有 host，`TYPESAFE_API_URL` 也没有配置过，因此 runner 永远不被构造，三类消费方全部停在 `runner-unavailable`。一个默认关闭、无可用端点、且没有实测收益证据的判定出口，保留它只会持续消耗配置面、面板接线与文档同步成本。

**Migration**: 无替代。移除后 recall 排序、重复信号与候选 `confidence` 全部回到本地路径：排序仍是粗排结果叠加既有反馈权重，重复提示不再产生稳定性候选，`confidence` 保持模型推导或用户陈述来源。供应商评估快照保留在 `docs/references/jev/`，供将来重新评估时使用；若重新引入，需重新提交一份包含端到端对照数据的变更。

### Requirement: 密钥与出站入站双向安全

**Reason**: 该要求唯一的作用面就是那条被移除的出站点。仓库不再有决策类外发调用，`TYPESAFE_API_KEY` 与 `TYPESAFE_API_URL` 也不再是本扩展读取的环境变量，因此这条契约失去作用对象。

**Migration**: 无替代。记忆正文的外发面收回既有外部内容安全边界一处；已导出的旧配置中残留的 `TYPESAFE_*` 环境变量不再被读取，用户可自行从 shell 配置中删除。

### Requirement: 调用必须有界、可中止且失败 fail-open

**Reason**: 有界、可中止与 fail-open 都是为了约束一个外部判定调用；调用不存在时这些约束没有约束对象，保留规范条目会让读者误以为系统仍有该调用路径。

**Migration**: 无替代。移除后不存在任何决策类调用，也没有可超时、可中止或需要回退的外部判定；会话不会被它阻塞这一保证由"不存在该调用"本身给出。

### Requirement: 置信度校准值必须标注来源且准入政策零改动

**Reason**: 校准只替换候选的 `confidence` 数值与来源标注，其唯一消费方是既有的最低置信度准入偏好，而准入政策按规范零改动——也就是说该能力对记忆收益的作用面极小，却要求 `confidence` 携带一个新的来源维度。在没有任何实测显示校准值优于模型推导值的前提下，这个维度不值得继续维护。

**Migration**: 无替代。候选 `confidence` 恢复为模型推导或用户陈述两类来源，不再出现 `+calibrated` 标记；既有最低置信度准入偏好的判定逻辑与阈值不变，历史数据无需迁移。

### Requirement: 决策调用必须可观测且有界

**Reason**: 该要求规定的是决策调用自身的开关状态与调用/失败/门控计数上报。调用被移除后，`/xpi-memo-status` 与 doctor 中的 decision 计数块恒为零，继续保留等于长期上报一个空表面。

**Migration**: 无替代。`/xpi-memo-status` 与 doctor 不再输出 decision 计数块；既有的召回、注入、候选与写入计数不受影响。
