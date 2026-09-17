# Task 38 Report — harden §1 本地身份边界

- 关联任务:`openspec/changes/harden-local-identity-and-align-admission-spec/tasks.md` §1(1.1–1.3)
- 涉及文件:`src/local-identity.ts`、`src/local-identity.test.ts`
- 日期:2026-09-17

## 目的

闭合 OG-4 的根:仓库内 `.pi/xpi-memo/project.json` 此前被无条件读取,`id`/`root`/`label` 直接采用,非 Git 目录可把记忆读写指向任意 project bank(跨项目串库)。

## 作用

1. `resolveLocalProjectIdentity` 新增显式 `trusted` 布尔入参;`false` 时直接返回 null,**不读任何元数据文件**(门控在读之前,非读后丢弃)。
2. 自证校验:元数据只能证明其所在目录的身份——`real(root)` 必须等于元数据所在目录,`id` 必须等于 `localProjectIdFor(该目录)`;任一失败即忽略该文件并继续向父目录走,保留"子目录继承已初始化父目录"语义。
3. `label` 恒取目录 basename,不再从文件读取——伪造 label 无法进入路由或展示层,且与 `initializeLocalProject` 写入的 canonical 值一致,零行为损失。
4. 修正 walk-up 每层祖先重新 realpath:修复起点路径不存在/经 symlink 时中间层与 metadata `root` 不可比的边界(macOS `/var` → `/private/var`)。
5. 初始化与撤销路径天然兼容:`initializeLocalProject` 生成的文件即 canonical 形态,通过新校验;`revokeLocalProject` 既有 `id` 派生校验不变。

## 特点

- 门控在解析器层集中生效,而非各调用点散落跳过——新增入口不可能绕过。
- 测试新增 5 个安全场景:未信任不读文件、伪造 id、伪造 root(指向他目录)、伪造 label、伪造文件不阻断父级继承。
- 12/12 local-identity 测试通过。

## 边界

- 不实现项目级配置、证据累积(归 `stabilize-candidate-auto-admission`)。
- 未受信任项目本地身份不生效是 Pi trust 模型的预期行为;显式信任后恢复。旧的手工编辑身份文件需重新运行初始化。
