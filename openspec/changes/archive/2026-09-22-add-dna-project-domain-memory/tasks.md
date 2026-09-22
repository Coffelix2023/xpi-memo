## 1. 依赖与模块骨架

- [x] 1.1 新增运行时依赖 `yaml` 并写入 package.json,验证 `pnpm install` 成功且 lockfile 更新
- [x] 1.2 建 `src/dna/` 模块骨架(schema/parse/load/ingest/inject 五文件 + 索引),验证 `pnpm typecheck` 通过

## 2. Schema 与解析(fail-closed 地基)

- [x] 2.1 用 typebox 定义 DNA schema:根 `art`/`write` 双域、条目必填 `id`(域内唯一 kebab-case)、语义字段、`source` 三类枚举(用户手编/Agent 归纳/Agent 翻译经确认)、`confidence` 三档枚举,验证 schema 单测覆盖合法与非法样例
- [x] 2.2 实现 `parseDocument` 往返解析 + schema 校验双闸,验证:未知字段/缺字段/类型错/重复 id 均被拒且返回有界字段路径诊断,原文件字节不变

## 3. 读取与全量注入交付

- [x] 3.1 实现信任门控读取(仅受信任项目;文件缺省/两域为空 = 功能关闭、不创建不报错),验证对应单测(含未信任项目存在文件的场景)
- [x] 3.2 实现保守关键词域检测(代码常量词表:art 域、write 域各一组),验证前端词命中只注 art、写作词命中只注 write、无关 prompt 零注入的单测
- [x] 3.3 实现有界 markdown 注入块组装(条目数与字符预算,超限截断标注;块头标注"项目文件上下文(.pi/DNA.yaml)"),验证超预算截断与空域不产出块的单测
- [x] 3.4 在会话 prompt 挂点接入注入路径,验证 `xpi_memo_recall` 输出与接入前完全一致(DNA 不进检索)的回归测试

## 4. 写入工具(Agent 主写路径)

- [x] 4.1 实现 DNA 写入工具(typebox 输入 schema 强制 `domain`/`id`/`source`/`confidence`),验证缺参/非法 kind 在 schema 层被拒
- [x] 4.2 写入管线串接:schema 校验 → `prepareExternalContent` 安检 → 按 `id` 定点 upsert 落盘,验证:命中内容策略拒绝且文件不变;追加条目后用户既有条目与注释原样保留的往返测试
- [x] 4.3 实现同 id 冲突保用户版本 + 有界冲突诊断,验证用户覆盖后 Agent 更新被拒且返回冲突信息的单测

## 5. activation-loop 路由(DNA 与 T1 分家)

- [x] 5.1 在显式意图路径实现 art/write 域分流:受信任项目内域内陈述写入 DNA outcome(user-statement 来源),验证该陈述不产生 T1 候选的单测
- [x] 5.2 实现回退规则:未信任项目或域外陈述仍走既有 T1 治理,验证既有 activation-loop 全部测试不回归(`pnpm test` 全绿)

## 6. 文档与全量验证

- [x] 6.1 GUIDE/README 增补 DNA 使用说明与"人味进文件、工程进库"域边界表,验证文档含写入示例与回滚说明(git revert 路径)
- [x] 6.2 跑 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 三条全绿,并在受信任项目手工冒烟:写入一条 art 条目 → 重启会话 → 前端任务注入可见该条目
