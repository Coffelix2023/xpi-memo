## 1. 本地身份边界

- [x] 1.1 为 `resolveLocalProjectIdentity` 增加显式 trust 输入，并在未信任时不读取元数据；验证未信任目录即使含有效 `project.json` 也返回无本地身份。
- [x] 1.2 校验本地元数据的 canonical 根目录与元数据所在目录一致、ID 等于该目录派生值；验证伪造 `id`、伪造 `root`、伪造 `label` 均不会被采用，且有效父目录身份仍可被子目录解析。
- [x] 1.3 保持初始化与撤销路径对有效本地身份的兼容性；验证初始化生成的文件通过新校验、revoke 仍只操作由有效身份派生的 project bank。

## 2. 运行时 trust 接线

- [x] 2.1 将 `ctx.isProjectTrusted()` 接入 `createRuntime`、`statusForContext` 及所有直接本地身份解析调用点；验证 Git 身份仍优先且不依赖 trust，本地身份只在 trusted context 生效。
- [x] 2.2 更新 `src/index.test.ts` 或等价集成测试依赖注入，覆盖未信任本地项目的 project memory 被既有无身份路径拒绝、受信任有效本地项目保持原 project bank 路由。
- [x] 2.3 确认拒绝路径复用已有 `identity: "none"` 和有界路由诊断；验证 L0/audit/工具结果不写入伪造 `id`、`root`、`label` 或记忆正文。

## 3. 规范和缺口登记同步

- [x] 3.1 将本 change 的两份 delta spec 同步到主规范；验证 `runtime-boundary-hardening` 与 `candidate-auto-admission/kind-routing` 的主规范保留所有更新后的完整 requirement 和场景。
- [x] 3.2 更新 `docs/OPEN-GAPS.md`：OG-4 标记为已修复；OG-1、OG-2 标记为已纠正规范且未来能力未实现；OG-3 标记为已将规范对齐实际 audit 事件；验证文档不再声称本 change 实现项目级配置、证据累积或 OG-5 至 OG-8 的自动准入治理。
- [x] 3.3 保持 OG-5 至 OG-8 为后续 `stabilize-candidate-auto-admission` 的未解决范围；验证本 change 不修改 `autoConfirm`、`shouldAutoStore`、`upgradeEvidence`、`verifyProjectGene` 或其行为测试。

## 4. 验证与回归

- [x] 4.1 运行本地身份、运行时路由、候选准入和 audit 相关测试；验证新增安全场景与原有 Git/有效本地身份场景全部通过。
- [x] 4.2 运行 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test`；验证全部命令退出码为 0。
- [x] 4.3 运行 `openspec validate harden-local-identity-and-align-admission-spec --strict`；验证 change 的 proposal、design、delta spec 与 tasks 均通过校验。
