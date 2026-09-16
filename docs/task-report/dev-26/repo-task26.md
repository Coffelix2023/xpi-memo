# Task 26 Report — footer stale ctx 崩溃修复

- 关联任务：`.pi/fast-fixes/2026-09-16-footer-stale-ctx-crash/tasks.md` §1–§3（1.1–3.1）
- 遵循规范：`docs/GIT-WORKFLOW.md`、`docs/GITHUB-GUARD.md`
- 涉及文件：`src/footer.ts`、`src/footer.test.ts`
- 日期：2026-09-16

## 目的

堵掉一条**进程级**崩溃路径：pi 扩展在「会话已经被替换」之后仍然去写 footer 状态，异常没人接，pi 直接把整个进程关掉。对用户来说，这不是「某个状态显示不对」，而是**大对话再也进不去**。

顺带解决第二件事：这个修复此前只存在于**已安装的克隆**里，且未提交。`pi update --extension` 会 clean + reinstall，一跑就没了。本任务把同一份修复落进开发工作区并通过仓库门禁，让它变成可提交、可回滚的改动。

## 作用

一句话：**把「写 footer」变成一件失败也无害的事。**

- 新增文件内私有函数 `safeSetStatus(ctx, value)`，把 `ctx.ui.setStatus("xpi-memo", …)` 包进 `try/catch`。
- `src/footer.ts` 的 4 处写入（同步基线写、脉冲定时器回调、清除、事件状态及其定时器回调）全部改走它。

崩溃链是这样接起来的（逐环都有证据）：

1. `session_start` 把当前的 `ctx` 闭包进一个 1.5 秒的 `setTimeout`（`src/index.ts:2888`）。
2. pi 启动 / resume 时会先用 bootstrap 会话建 `ctx`，随后替换成你要进的那个会话，旧的 `ctx` 被标记失效。
3. 1.5 秒后定时器触发，向失效的 `ctx.ui` 写入 → 抛 `stale after session replacement or reload`。
4. `session_start` 里那个 `try/catch` 只护住同步段，护不到定时器回调 → 未捕获异常。
5. pi 的交互模式把 `uncaughtException` 直接接成 `uncaughtCrash` → `process.exit(1)`。

对话越长，第 2 步的替换窗口越久，命中概率越接近必然——这解释了「只有大对话进不去」。

修复后第 5 步不再发生：失效上下文的写入退化为 no-op。

## 特点

- **最小改动**：只动 1 个文件里的 4 行调用，加 1 个私有函数与 1 条测试。`src/index.ts` 的 6 个调用点（`49 / 492 / 2444 / 2451 / 2890 / 3032`）**零改动**——三个导出签名没变，所以没有调用方同步义务。
- **沿用原有语义**：代码里本来就写着 footer 是 "Presentation only; ignore footer failures"，这个修复是把注释里的意图真正落实，而不是引入新策略。
- **测试不依赖 pi 运行时**：用一个 `get ui()` 直接抛错的假 `ctx` 触发路径，CI 里稳定复现；那条用例故意等满 1.1 秒，让脉冲定时器真的有机会开火。
- **fail-open**：内存读写、L0 记录、导出等真实功能完全不受影响，最坏情况只是 footer 不刷新。

## 边界

- **只护住 footer 的 status 写入**，不是「所有延迟写 UI」的通用护栏。真正的通用做法是在 `session_start` / `session_shutdown` 里统一清掉在飞定时器（本次按决策未做，见 `.pi/fast-fixes/2026-09-16-footer-stale-ctx-crash/plan.md`「非目标」）。
- **没解决上游问题**：pi 对未捕获异常的策略是立即退出进程，且 `invalidate()` 会抛错。扩展侧只能保证自己不踩，pi 侧的行为本次不动。
- **行为验收只有一条路**：不带 `-ne` 正常启动那个进不去的大对话。单测通过**不能**替代它——如果修复后仍崩，说明还存在第二个「后事写 UI」的点，需要 `pi --no-extensions` + 逐个 `-e` 二分定位。
- **本次未提交**：本报告只覆盖到提交前；`git commit` / `push` 需用户授权，且必须**先 push 再 `pi update`**，否则已装克隆里那份未提交修复会被 clean 掉。
- **同类风险已排查**：`xpi-caveman` / `xpi-rtk` 的 `footer.ts` 只有同步 `refresh()` / `unmount()`，无延迟定时器；`xpi-kuma` 唯一的 `setTimeout` 是 vendor probe 的 `abort()`，不碰 `ctx`。目前未发现第二处。

## 验证记录

| 任务 | 命令 | 结果 |
|---|---|---|
| 1.1 | `grep -c safeSetStatus /tmp/xpi-memo-footer-fix.patch` | `6`（补丁 95 行） |
| 1.2 | `git apply --check --stat …` → `git apply` → `git status --short` | clean → ok → 两文件均 `M`（+34 / −5） |
| 1.3 | `npx biome ci src/footer.ts src/footer.test.ts` | `exit=0`（修前 `exit=1`） |
| 2.1 | `pnpm typecheck` | `exit=0` |
| 2.2 | `pnpm -w run lint` | `exit=0`，`Checked 163 files` |
| 2.3 | `pnpm test` | `exit=0`，783 passed / 8 skipped（footer 3/3 含 stale-ctx 用例） |

## 后续

1. 按 `docs/GIT-WORKFLOW.md` §11.1 精确暂存两个文件并提交：`fix(footer): swallow stale-ctx status writes instead of crashing pi`，随后 push。
2. push 完成后执行 `pi update --extension git:github.com/Coffelix2023/xpi-memo`，再**不带 `-ne`** 启动那个大对话复验。
3. 若仍崩：转 `pi --no-extensions` + 逐个 `-e` 二分，寻找第二个「后事写 UI」的点。
