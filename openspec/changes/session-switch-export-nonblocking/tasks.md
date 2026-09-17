## 1. 实装与验收
- [x] 1.1 `src/index.ts` 的 `session_shutdown` handler:`await exportMarkdown({...})` 改为 `void exportMarkdown({...}).catch(() => {})`,附 ponytail 注释说明天花板(后台导出、崩溃窗口幂等)。验证:`pnpm typecheck` 通过
- [x] 1.2 新增单测:mock `./markdown-export/exporter.ts` 返回可控 pending promise,断言 `session_shutdown` handler 在导出完成前先行 resolve(不阻塞)。验证:`pnpm test` 新用例通过
- [x] 1.3 全量回归三绿:`pnpm typecheck`、`pnpm -w run lint`、`pnpm test`
- [x] 1.4 实机冒烟:`pi -e git:github.com/Coffelix2023/xpi-memo` 中 `/new` 与 `/resume` 切换不再有秒级停顿,且 `markdown/daily/` 正常产出新日条目。验证:切换即时返回 + daily 文件 mtime 更新
