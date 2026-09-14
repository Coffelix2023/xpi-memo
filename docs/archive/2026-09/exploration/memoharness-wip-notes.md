# WIP 交接备注 — @fx-pi/mnemosyne（未 apply 草案）

> 状态：**骨架草案，未经 `/opsx apply` 授权**。由 ~/.pi 全局工作区的会话产生（该工作区不做扩展开发）。
> 切换本工作区后，执行 `/opsx apply` 再继续；届时以 OpenSpec change
> `add-tiered-pi-memory-system`（位于 ~/.pi/openspec/changes/）为 planning 唯一真源。

## 已确认决策

| 决策 | 结论 |
|---|---|
| 开发仓库（task 1.1） | 本 monorepo `fx-pi-extensions`，新建 `packages/fx-pi-mnemosyne/` |
| planning 归属 | 留在 `~/.pi/openspec/changes/add-tiered-pi-memory-system/`（design 决策 7） |
| T1 路由机制 | **纯环境变量注入**，无需改 Mnemosyne 源码（见下"已验证事实"） |
| 官方包共存策略 | 开发期官方 `@mnemosyne-oss/pi-mnemosyne` 保持安装；迁移（task 5.5）时从 `~/.pi/agent/settings.json` 移除，避免同名工具重复注册 |

## 已验证事实（不要再猜，直接引用）

- `mnemosyne` CLI（uv tool 安装于 `~/.local/bin/mnemosyne`，Python 3.12）：
  - bank 选择 = env **`MNEMOSYNE_BANK`**（`cli.py:_resolve_bank_name`）；CLI store/recall **没有** `--bank` flag
  - scope 选择 = env **`MNEMOSYNE_DEFAULT_SCOPE`**（session|global），store 用
  - store 用法是位置参数 `store <content> [source] [importance]`，输出 `Stored: <hex id>`
  - **CLI 不支持 `--help`**：`mnemosyne store --help` 会把 `--help` 当内容存进库（本会话误写一条已删，`delete <id>` 可用）
  - bank 目录结构：`<dataDir>/banks/<name>/mnemosyne.db`；默认库在 `<dataDir>/mnemosyne.db`
  - Python API `Mnemosyne(db_path=..., bank=...)`、`mem.remember(..., scope=...)` 均存在，必要时可绕过 CLI
- 现有数据：`~/.pi/agent/mnemosyne/data/mnemosyne.db`（全局默认库，当前 0 条）；迁移时**不删除**
- prototype bridge：`~/.pi/agent/extensions/mnemosyne-context.ts`（recall 注入桥）；迁移完成后按 design 回滚方案处理
- 官方包注册工具：`mnemosyne_remember / recall / forget / stats / sleep`（spawn CLI 代理，无路由）
- monorepo 约定：pnpm + turbo + biome，tsconfig 继承 `../../tsconfig.base.json`，peer 依赖 `@earendil-works/pi-coding-agent` + `typebox`

## 本草案已写文件（git 未提交）

- `packages/fx-pi-mnemosyne/package.json` — pi-package 清单（extensions + skills 声明）
- `packages/fx-pi-mnemosyne/tsconfig.json`
- `src/identity.ts` — task 1.4：git 项目身份（common-dir hash 为 id，remote 规范化做修复别名，worktree 归并，非 git 返回 null）
- `src/registry.ts` — task 1.5：项目注册表 `projects.json`（0600，移动修复 re-key 不合并非 bank）
- `src/cli.ts` — CLI spawn 封装，env 注入 bank/scope，强制 `MNEMOSYNE_LLM_ENABLED=false`，超时/输出上限
- `src/banks.ts` — task 1.6：bank 路径/存在性/lazy 创建（只在写入路径创建）

## 下一步（apply 后）

1. `pnpm install` 补依赖（vitest、typebox），跑 `pnpm typecheck && pnpm lint`
2. 给 identity.ts 写 spike 测试覆盖 tasks 1.4 全部场景（同名 basename、worktree、无 remote、移动根、非 git）
3. tasks 1.2/1.3 收尾：skill 资源 + 官方工具行为验证（隔离 Pi 进程，task 5.4 同款方法）
4. Section 2 路由与召回：`kinds.ts`（固定 kind 表）→ 召回（项目库 + 有界全局）→ 中英高价值触发器

## 已知风险/待办

- **工具名冲突**：本包注册与官方包同名工具是有意设计（迁移 = 卸官方包）；开发测试期间同名共存会导致重复注册，task 5.4 必须在隔离 Pi 进程中验证"恰好一次"
- 远端 embedding 失败策略（task 2.8）：保留已有向量 + FTS5，不自动换 provider
- T2 ai-memory 的 Pi 真实 session-end 钩子（task 6.1）尚未验证，manual handoff 为兜底
