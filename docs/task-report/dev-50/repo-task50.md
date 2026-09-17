# Task 50 Report — 引用收尾

- 关联任务:`openspec/changes/retire-stale-root-docs/tasks.md` §3(3.1–3.7)
- 涉及文件:`src/l0-boundary.test.ts`、`ARCHITECTURE.md`、`src/l0/types.ts`、`docs/README.md`
- 日期:2026-09-18

## 目的

文档换了位置之后,让所有活引用跟着走,不留悬空路径;同时保住 `l0-boundary.test.ts` 对 L0 契约的断言强度。

## 作用

1. `src/l0-boundary.test.ts`(任务 3.1):`readFileSync` 的目标从 `../docs/l0-contract.md` 改为 `../docs/archive/2026-09/contracts/l0-contract.md`。9 条断言(8 条 `toContain` + 1 条 `not.toContain("context-mode")`)全部保留,一行未删。
2. `ARCHITECTURE.md`(任务 3.2):L0 归属段落里的 `docs/l0-contract.md` 指向新路径。
3. `src/l0/types.ts`(任务 3.3):头注释里的路径同步;导出签名未变。
4. `docs/README.md`(任务 3.4–3.5):从「当前有效」表移除 `l0-contract.md` 与 `OPEN-GAPS.md` 两行,加两段说明区分"换位置"与"退休";归档分组表从五组扩到七组,新增 `retired/` 与 `contracts/`;「取代关系」新增两条,明确 `l0-contract.md` 是换位置而非取代或退休;「历史引用为什么不改写」补一句 `archive/` 内部同样不回改;映射表新增四条。
5. 全仓检索四个旧路径(任务 3.7):排除 `openspec/changes/archive/**`、`docs/archive/**`、`docs/task-report/**`、`docs/.trash/**` 与本 change 自身后,活跃面零残留;`src/` 内两处命中都已指向新路径。

## 特点

- 测试只改路径字面量,不改断言——契约文件换位置不该削弱对它内容的校验。
- `docs/README.md` 同时承担两件事:移除失效条目、并把"为什么 `l0-contract.md` 从「当前有效」表里消失却不是退休"讲清楚,避免读者误判。
- 归档文档正文里的旧路径**不回改**(任务 3.6 判定为不改写):它们是当时的事实快照,回改等于篡改。这条规则本来只写在 `archive/` 之外的三处,本组把它显式扩展到 `archive/` 内部。

## 边界

- 只改路径字面量与索引文字,不动任何逻辑、类型、导出签名。
- `docs/CHANGE-EXECUTION-ORDER.md` 正文里对 `docs/OPEN-GAPS.md` 的两次提及保留原样(它是当时的执行清单)。
- 不把 `l0-contract.md` 的内容并入 `openspec/specs/l0-session-trace/spec.md`——openspec 那份规范只覆盖 9 条断言里的 4 条,合并会削弱测试或需要改行为契约,超出本 change。
