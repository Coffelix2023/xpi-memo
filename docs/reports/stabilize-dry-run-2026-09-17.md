# stabilize-candidate-auto-admission — 真实语料只读 Dry-run(任务 4.3)

- 日期:2026-09-17
- 语料:`~/.pi/agent/xpi-memo/candidates.json`(真实存量,117 条)
- 方式:临时 vitest 脚本重放真实验证器的判定谓词(声明缺失 → `no-declaration`),全程只读;运行前后对 `candidates.json` 做 sha256 比对确认零改写。脚本已删除。

## 汇总

| 指标 | 值 |
|---|---|
| 存量候选总数 | 117 |
| 可验证 kind(gene + constraint) | 36(gene 27 + constraint 9) |
| 携带 repositoryFact 声明(coverage) | **0 / 36(0%)** |
| reason 分布 | `no-declaration` × 36 |
| 验证总延迟 | <1 ms(声明缺失短路,无 IO) |
| 存量文件是否被改写 | **否**(sha256 前后一致) |

kind 分布:decision 41、gene 27、gotcha 25、constraint 9、session 7、workflow 6、preference 2。

## 解读

1. **coverage 为 0% 是预期事实,不是缺陷**:repositoryFact 声明格式由本 change 引入,存量候选产生于旧管道(模型改写全文、无结构化声明)。这正是 proposal 禁止"用候选正文猜测仓库证据"的直接体现——旧候选无法满足新验证契约,按 fail-closed 一律保持待审。
2. **放量基线**:shadow 模式下 coverage 与 precision proxy 需在新管道(离线提取输出声明)产生新候选后重新测量;本报告只固定存量基线。
3. **不迁移存量**(proposal 明确):36 条可验证 kind 的存量候选继续人工审核,不因本 change 批量自动写入。

## 回归

`candidates.json` sha256 前后一致;未写入任何 T1 bank;无迁移脚本执行。
