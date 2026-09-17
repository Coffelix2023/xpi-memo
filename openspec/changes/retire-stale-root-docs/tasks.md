## 1. OPEN-GAPS.md 定稿（先修矛盾）

- [x] 1.1 改写末尾汇总表的 OG-5~OG-8 四行，使其与各条 `2026-09-17 处理结果` 注记一致：OG-5 状态列改为「规范已纠正 + 路径已收口（remember/reimport/离线提取同一 admission decision）」，建议列改为「已按方案 C 与 A 融合收口」；OG-6 改为「已按方案 B 删除 `shouldAutoStore` gene/constraint 分支」；OG-7 改为「已随验证策略重构落地（注释行拒绝 + constraint 仅 shadow）」；OG-8 改为「已按方案 A 改口径 + 结构化 repositoryFact 判据落地」。验证：每一行的状态与建议描述都能在该条正文的「处理结果」段找到对应句子，与 OG-1~OG-4 的行格式一致
- [x] 1.2 改写末尾导语：把「OG-1 / OG-2 / OG-3 / OG-4 已由 harden-local-identity-and-align-admission-spec 处理」扩写为两个 change 的完整归属——OG-1~OG-4 归 `harden-local-identity-and-align-admission-spec`，OG-5~OG-8 归 `stabilize-candidate-auto-admission`；并说明余留能力边界（OG-1 的项目级配置层、OG-2 的证据累积仍为未实现能力，按已纠正的规范不再被承诺）。验证：导语不再读起来像 OG-5~OG-8 待办
- [x] 1.3 删除或改写已失效的后续动作段落：「要落地其中任何一条：OG-1 / OG-2 / OG-5 / OG-6 需要开 OpenSpec change」与「OG-5 ~ OG-8 之间有顺序依赖：OG-8 的方案 B/C 决定要在前」两句描述的是已走完的执行顺序，改为对两个 change 的完成时陈述。验证：全文检索 `方案 A` / `方案 B` / `方案 C` 的「建议采纳」句不再以将来时描述已采纳的动作
- [x] 1.4 全文自检：读完整份文件，确认不存在「逐条说已处理、汇总说未处理」这类自相矛盾；验证每条 OG 的状态、汇总表行、导语三处互相一致
- [x] 1.5 记录 `.gitignore` 对 `docs/archive/`、`docs/task-report/`、`docs/evaluation-reports/` 的既存规则缺陷留在本文件之外：确认本 change 未在 OPEN-GAPS 中新增条目，也未修改 `.gitignore`（该缺陷由独立 change 承接）

## 2. 三份文档退休（git mv）

- [x] 2.1 确认目标目录：`docs/archive/2026-09/retired/` 与 `docs/archive/2026-09/contracts/` 存在且为空；验证两目录均在 `.gitignore:26` 覆盖范围内（`git check-ignore -v docs/archive/2026-09/retired/` 有命中）
- [x] 2.2 `git mv docs/OPEN-GAPS.md docs/archive/2026-09/retired/OPEN-GAPS.md`；验证 `git status` 报告 rename 而非 delete + add，且旧路径不再存在
- [x] 2.3 `git mv docs/CHANGE-EXECUTION-ORDER.md docs/archive/2026-09/retired/CHANGE-EXECUTION-ORDER.md`；验证同上
- [x] 2.4 `git mv docs/xpi-memo-value-assessment.md docs/archive/2026-09/retired/xpi-memo-value-assessment.md`；验证同上
- [x] 2.5 `git mv docs/l0-contract.md docs/archive/2026-09/contracts/l0-contract.md`；验证旧路径 `docs/l0-contract.md` 不再存在，且新文件内容与移动前逐字节一致（同一 blob hash）
- [x] 2.6 四个文件全部入库需 `git add -f`（目标目录被忽略）；验证 `git diff --cached --stat` 报告为 rename 且内容改动为 0

## 3. 引用收尾

- [x] 3.1 `src/l0-boundary.test.ts`：把 `new URL("../docs/l0-contract.md", import.meta.url)` 改向新路径 `../docs/archive/2026-09/contracts/l0-contract.md`；验证该测试文件的 8 条 `expect(contract).toContain(...)` 断言全部保留，未删除、未放宽，且 `expect(contract).not.toContain("context-mode")` 仍在
- [x] 3.2 `ARCHITECTURE.md`：更新第 28 行的 `see docs/l0-contract.md` 指向新路径；验证新路径在磁盘上存在
- [x] 3.3 `src/l0/types.ts`：更新头注释中的 `docs/l0-contract.md` 指向新路径；验证该文件无其他改动、导出签名未变
- [x] 3.4 `docs/README.md`：从「当前有效」表移除 `l0-contract.md`、`OPEN-GAPS.md` 两行（`l0-contract.md` 是因换位置、`OPEN-GAPS.md` 是因退休），并把 `l0-contract.md` 与三份退休文档写入新的 `retired/` 与 `contracts/` 分组；验证表内不再有指向已移动路径的行
- [x] 3.5 `docs/README.md`：在「已归档内容之间的取代关系」或等效位置说明 `l0-contract.md` 是**换位置而非取代**（内容未变的契约，测试仍读取它），避免读者把它当成过时材料
- [x] 3.6 `docs/CHANGE-EXECUTION-ORDER.md` 的自身残留引用：检查该文件内是否引用了自己或 OPEN-GAPS 的旧路径，按需在移动后更新；验证归档文件内的相对引用仍能解析
- [x] 3.7 全仓检索 `docs/l0-contract.md`、`docs/OPEN-GAPS.md`、`docs/CHANGE-EXECUTION-ORDER.md`、`docs/xpi-memo-value-assessment.md` 四个旧路径，排除 `openspec/changes/archive/**`、`docs/archive/**`、`docs/task-report/**`（这三处记录「当时的事实」，改写等于篡改快照），确认活跃文档与 `src/` 中零命中，或每个命中都已指向新路径

## 4. 清理临时目录

- [x] 4.1 删除 `docs/.trash/`（`OPEN-GAPS-notes.md` 对话转录、四份文档的冗余副本）；验证该目录从未入库（`git log --all -- docs/.trash` 为空），删除不影响 git 历史，且四份文档的正本已在第 2 组移动到位
- [x] 4.2 验证 `git status --short` 只剩本 change 的预期改动，无遗留未跟踪目录

## 5. 验收

- [x] 5.1 运行 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test`，三者退出码均为 0；特别验证 `src/l0-boundary.test.ts` 三条测试通过（它是本 change 唯一触碰的测试文件）
- [x] 5.2 运行 `openspec validate retire-stale-root-docs --strict`，验证通过（`skip_specs: true` 下 specs artifact 为 `skipped` 而非缺失）
- [x] 5.3 零删除自检：运行 `git diff --cached --diff-filter=D --name-only`，确认输出为空（本 change 只有 rename，无删除）
- [x] 5.4 按 `AGENTS.md` 第 7 节写 `docs/task-report/dev-<下一编号>/repo-task<主编号>.md`，逐组说明目的/作用/特点/边界；验证文件存在且四个要素齐全
- [x] 5.5 在提交信息中记录完整的旧路径 → 新路径映射表，使 `git log --follow` 使用者无需打开索引即可追溯；验证信息列出了每一组 source → target 映射
