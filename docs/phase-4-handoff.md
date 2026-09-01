# Phase 4 交接备忘(v0.4 完成 → Phase 5 启动)

> 用途:新开 context 的进度恢复点。事实源仍是 openspec change 工件 + 本文件记录的临时结论。
> 变更:`xpi-memo-staged-evolution` · 进度 **81/97** · Phase 4 (v0.4 pluggable search) **全部完成并已发布**

## 1. Phase 4 交付摘要(2026-09,tag v0.4.0 = 04527e1)

- `src/search/` 六个新文件:
  - `backend.ts` — SearchBackend 接口、SearchResult/BackendCapabilities、fallback 链常量、`isCommandInstalled`(which 结果按进程缓存,`refreshCommandCache` 可清)
  - `selector.ts` — fallback 链 selector(configured → mnemosyne → ripgrep → qmd)、BackendAttempt 追踪、BackendMetrics(latency/resultCount)、故障自动降级
  - `mnemosyne-backend.ts` — 包既有 CLI recall;global→default bank,project→project bank,session→global;走 `dependencies.run` 注入(旧 recall 测试零改动通过)
  - `ripgrep-backend.ts` — 搜 `<dataDir>/markdown/` + `sessions/`;小写查询 `--ignore-case`、含大写敏感、regex 透传;exit 1 = 无匹配不算错
  - `qmd-backend.ts` — 外部 qmd CLI,实测签名 `qmd search "q" --json -n <limit>`,结果字段 docid/score/file/snippet;collections 用 `-c`(构造参数,未暴露 env)
  - `runtime.ts` — `createSearchRuntime(context, setting, runMnemosyne)` 装配 registry + metrics
- 集成:config 新键 `searchBackend`(`auto|mnemosyne|ripgrep|qmd`,env `XPI_MEMO_SEARCH_BACKEND`,console 设置项);`xpi_memo_recall` 走后端链,输出保持旧 RecallResponse 形状 + `searchBackend` 字段;`/xpi-memo-status` 上报 backends/active;错误信息带安装命令;package.json `pi.searchBackends` 声明可选 CLI(非 npm optionalDependencies——三者都是外部 CLI)
- 测试:346 通过(新增 21);typecheck/lint 全绿
- 发布:feat×2 → docs/guard → chore(openspec 勾选)→ bump 0.4.0 → tag → GitHub Release(https://github.com/Coffelix2023/xpi-memo/releases/tag/v0.4.0)

## 2. 本轮临时讨论结论(已固化进仓库文档)

| 结论 | 落点 |
|---|---|
| 阶段一明确允许 main 直推 + tag 发布;切阶段二改分支+PR 后此授权失效 | `docs/GITHUB-GUARD.md` (ea81a05) |
| 调试循环弃用本地软链:git 源安装(免 pin ref)+ `pi update --extension git:github.com/Coffelix2023/xpi-memo` 拉取;pi update 会自动 reset --hard + clean -fdx + npm install,单包更新不碰其他包 | `AGENTS.md` §5 (722a7d4),已实测拉到最新 main |
| README 安装命令原为 `pi install xpi-memo`(错:npm 无此包、裸名非法源),已改 git 源 + 本地路径两种写法 | `README.md` (ccdf75c) |
| qmd 不需要装:可选后端运行时自动检测降级;**不做**"装时检测安装外部 CLI"(越权/pi install 只跑 npm install) | v0.4.0 Release notes |
| tag 落在 bump 提交、tasks.md 勾选在其后一个提交——既定惯例,仅 openspec 元数据差异 | v0.1–v0.4 均循此例 |

**已知矛盾(Phase 5 处理)**:README Installation 里"local clone / working copy 路径安装"一节与 AGENTS.md"不用本地路径"决策冲突,Phase 5 改 README 时删除或标注不推荐。

**可选增强(未排期)**:session_start 检测"配置了某后端但 CLI 不在 PATH"并提示一次。

## 3. 本机环境快照

- mnemosyne ✓ (`~/.local/bin/mnemosyne`) · ripgrep ✓ (`/opt/homebrew/bin/rg`) · qmd ✗(未装,链自动跳过)
- pi 0.84.4;xpi-memo 已以 `git:github.com/Coffelix2023/xpi-memo` 装入 `~/.pi/agent/git/github.com/Coffelix2023/xpi-memo`,clone 已拉到 722a7d4
- 开发仓库:`~/c6x_local/app-prd/xpi-memo`,main 与 origin 同步

## 4. 下一步:Phase 5(v1.0,任务 14.1–16.6)

- 14.x 性能:L0 轮转大 session 优化、增量导出大历史优化、缓存(14.3:backend availability 已有 which 进程缓存,注意别重复造)、热点 profile
- 15.x 文档:GUIDE.md、ARCHITECTURE.md(L0/T1 分层)、TROUBLESHOOTING.md、跨阶段集成测试(15.4)、版本兼容矩阵(15.5)、README 全特性(15.6;**顺手解决第 2 节的 README 矛盾**)
- 16.x 收尾:全量测试 100%、memoharness 迁移验证(16.2)、全部 config flag 逐个验证(16.3,含 `searchBackend`/`l0Enabled`/`autoExport`)、迁移指南(16.4,已有 docs/MIGRATION.md 可复用)、v1.0.0 tag + release(16.5)、npm publish(16.6——**package.json 是 private:true,发布前需用户决策**)
- 全部完成后 `/opsx-archive` 归档 change

## 5. 工作流速查

```bash
# 进度
openspec instructions apply --change "xpi-memo-staged-evolution" --json
# 调试循环(AGENTS.md §5)
pnpm typecheck && pnpm -w run lint && pnpm test   # 全绿才提交
git commit(小粒度 Conventional Commits,显式 add)
git push origin main
pi update --extension git:github.com/Coffelix2023/xpi-memo   # 实机拉取
# Pi 内 /reload 后实机验证
```

- Git:阶段一直推 main(GITHUB-GUARD.md 已授权);不强推、不删分支、不用 `git add .`
- 发布:bump → tag → `gh release create vX.Y.Z`;tag 落 bump 提交,tasks 勾选随后
