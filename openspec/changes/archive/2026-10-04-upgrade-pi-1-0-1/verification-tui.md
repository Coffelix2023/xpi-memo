# Verification — Pi 1.0.1 runtime / TUI

本文件是 `upgrade-pi-1-0-1` 的验证记录，分为「已自动化的客观证据」与「必须人工在真终端确认的交互项」。
人工项不写成自动化断言的原因：overlay 渲染 / 键盘 / 焦点恢复依赖真实终端尺寸与 Pi 渲染时序，用脚本抓屏做匹配只会得到脆弱的假证据。

> **人工验收结论（2026-10-04）**：清单 A（fullscreen，A1-A5）、B（regular，B1-B2）、C（Glimpse 不可用 fallback，C1-C5）已由用户在本机真终端逐条确认通过。本变更 12/12 任务完成，接受。

## 0. 前置约束

- 工作目录：`/Users/felix/c6x_local/app-prd/xpi-memo`
- **不得占用用户保留端口 `8010`**。本变更不启动任何 dev server / 代理；验证前后用
  `lsof -nP -iTCP:8010 -sTCP:LISTEN` 确认无监听。
- 必须用 `-ne`（禁用自动发现的扩展）+ 显式 `-e ./src/index.ts` 加载本仓库版本。
  否则会与全局安装的 `~/.pi/agent/git/github.com/Coffelix2023/xpi-memo` 发生工具名冲突，
  实测报错：`Tool "xpi_memo_recall" conflicts with .../src/index.ts`。

## 1. 已自动化的客观证据

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型兼容 | `pnpm typecheck` | 通过（0 error） |
| 锁文件一致 | `pnpm install --frozen-lockfile --ignore-scripts` | 通过 |
| 依赖拓扑单例 | `pnpm why @earendil-works/pi-tui` / `pnpm why typebox` | 各 1 个版本（1.0.1 / 1.3.27） |
| 物理单例 | `pnpm prune` 后 `ls node_modules/.pnpm` | `pi-tui@1.0.1`、`typebox@1.3.27` 各一份，旧 0.85.1 / 0.87.1 已清 |
| 真实 CLI 集成 | `XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1 pnpm exec vitest run src/real-cli.integration.test.ts` | 4 passed |
| live RPC 探针 | `XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1 pnpm exec vitest run src/live-rpc.integration.test.ts` | 1 passed |
| 真机无头冒烟（Pi 1.0.1 加载 + 工具调用） | 见下 | 输出 `RECALL_OK` |

无头冒烟命令：

```bash
XPI_MEMO_DATA_DIR=/tmp/xpi-smoke/data pi -ne -e ./src/index.ts --no-session --tui-mode regular -p \
  "Call the xpi_memo_recall tool with query \"smoke probe\" and limit 1, then reply with only the
   word RECALL_OK if the tool returned a result, or RECALL_FAIL plus the error text if it did not."
# → RECALL_OK
```

该冒烟只证明：扩展能在 Pi 1.0.1 下加载、工具注册无冲突、工具调用链路可用。
`--mode print` 不渲染 TUI，因此**不能**用它推断 fullscreen / regular 的任何界面行为。

## 2. 人工验收清单（Pi 1.0.1，TUI 模式是本变更的核心风险）

Pi 1.0.1 默认 `--tui-mode fullscreen`；`regular` 是旧行为。
每个模式重复 A、B 两组步骤，逐条勾掉。

### A. fullscreen（默认，风险最高）

- [ ] A1 启动：`cd /Users/felix/c6x_local/app-prd/xpi-memo && pi -ne -e ./src/index.ts --no-session`
      （不加 `--tui-mode`，即 fullscreen；确认启动无 overlay 报错、footer / 输入框不裁剪）
- [ ] A2 输入 `/xpi-memo` 回车 → 打开记忆面板
      （装了 Glimpse 会弹原生窗口；否则走 `ctx.ui.custom` 终端 overlay，`src/console.ts`）
- [ ] A3 键盘：`↑` / `↓` 移动选中项、`Tab` 切换分区、`Enter` 执行、`Esc` 关闭
- [ ] A4 关闭后焦点恢复：立刻敲几个字符，应正常出现在输入框；不出现重复字符、丢键、双击残留
- [ ] A5 `/xpi-memo-status --json` 有通知输出；`/xpi-memo-trace`、`/xpi-memo-export` 不报错

### B. regular

- [ ] B1 启动：`pi -ne -e ./src/index.ts --no-session --tui-mode regular`
- [ ] B2 重复 A2–A5；重点看 overlay 不越界、不裁剪、位置正确

### C. Glimpse 不可用时的终端 fallback

`resolveGlimpseModule()`（`src/glimpse/module.ts`）解析不到 `glimpseui` 时返回 `null`，
`openGlimpsePanel` 返回 `false`，`openConsole` 落到终端 overlay。验证方式：临时把 Glimpse 挪走。

- [ ] C1 `mv ~/.pi/agent/npm/node_modules/glimpseui ~/.pi/agent/npm/node_modules/glimpseui.off`
- [ ] C2 重新启动 pi，`/xpi-memo` → 应直接出现终端 overlay，不抛错、不空窗
- [ ] C3 在 overlay 里完成一次实际操作（如切换语言 / 开关一项设置），确认设置持久化
- [ ] C4 还原：`mv ~/.pi/agent/npm/node_modules/glimpseui.off ~/.pi/agent/npm/node_modules/glimpseui`
- [ ] C5 全程 `lsof -nP -iTCP:8010 -sTCP:LISTEN` 无本扩展引入的监听

## 3. 判定

A / B / C 全部勾选后，spec 的「Terminal surfaces preserve interaction behavior across TUI modes」
才算验收通过；任一条不通过则本变更不接受，按 design.md 决策 5 整体回滚
（manifest + pnpm-workspace.yaml + pnpm-lock.yaml + 两个测试夹具）。