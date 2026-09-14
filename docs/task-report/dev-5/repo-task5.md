# Task 5：验证与回归

## 目的

用跨层行为测试和完整质量门禁证明 memory consistency hardening 的实现可重放、可诊断、可重试，并确认已知上游限制没有被掩盖。

## 完成内容

- 覆盖 backend 成功/失败、L0 request/commit/failure、commit event 丢失后的 unresolved、candidate 保留、delete recovery、增量投影与 MEMORY projection retry。
- 增加 unresolved diagnostics 的正文不泄漏断言与 legacy event replay 断言。
- 保留 daily cursor 与 MEMORY projection state 的独立性：daily 成功后 projection 失败仍可重试。
- 完成 L0、recall policy、content policy、candidate governance 和 UI visual layer 非目标差异检查。

## 验证

- `pnpm typecheck`：通过。
- `pnpm -w run lint`：通过，Biome 检查 139 个文件无问题。
- `pnpm test`：640 passed，6 skipped（71 test files，3 skipped）。
- `git diff --check`：通过。
- 定向跨层测试：68 passed。

## 已知限制

Mnemosyne 当前没有稳定的精确按 ID 读取命令，因此 `forget` 仍保持 fail-closed：不会调用 semantic recall、全库 export 扫描或直接 SQLite 访问；不会声称 recovery 或删除成功。
