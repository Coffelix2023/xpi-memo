# AGENTS.md — xpi-memo

> 本文件是本仓库内 AI Agent 与人类开发者的**唯一事实来源 (Single Source of Truth)**。
> 所有变更必须可解释、可回滚。当口头约定、历史代码与本文件冲突时,**以本文件为准**。

<!-- TODO: 定义本扩展职责边界(这个扩展做什么、不做什么) -->

## 0. TL;DR(Agent 执行守则)

- 每次对话在头部声明"[@PRJ-AGENTS.md]"
- 本仓库是一个 **Pi Coding Agent 扩展 (pi-extension)**,即被 Pi 主进程加载的 Node.js 插件。**不是 Web 应用**。
- **核心栈**:TypeScript (strict) + Node.js + Pi 原生 UI(`ctx.ui.*` / `@earendil-works/pi-tui`)+ Biome + pnpm + Vitest + typebox。
- **无构建步骤**:Pi 直接加载 `src/index.ts` TypeScript 源码。禁止引入 tsup/esbuild/dist 产物。
- **类型真相**:Pi 的 API 签名以 `node_modules/@earendil-works/*` 的 `.d.ts` 为准。**动手前先读类型,不凭记忆猜 API**。
- 任何代码修改后按 **§5 收尾规则**验证:`pnpm typecheck` + 改动路径 `biome check` + 命中的单测。全量 test / 全量 lint / 实机调试只在 §5 触发条件命中时才跑,不因「更保险」而跑。

## 1. 运行时契约

1. 入口 `src/index.ts` 默认导出 register 函数:`export default function (pi: ExtensionAPI): void`。
2. `package.json` 的 pi manifest 指向 TS 源码:`{ "pi": { "extensions": ["./src/index.ts"] } }`。
3. Pi API 与 typebox 声明为 **peerDependencies(optional)**,版本锁在 devDependencies。
4. 扩展运行在 Pi 主进程内,终端归 Pi TUI 所有。交互一律用 `ctx.ui.*`,禁止 ink/inquirer 等抢终端的库。
5. 尊重 Project Trust:项目级配置(`<cwd>/.pi/*.json`)仅在项目被信任时生效。

## 2. 技术栈

Node.js + pnpm(版本见 `mise.toml`)、TypeScript strict、Biome(lint+format)、Vitest、typebox。
**实装版本以 pnpm-lock.yaml 为准**,不在本文件硬写大版本号。

## 3. 目录结构

```
.
├── mise.toml / package.json / biome.jsonc / tsconfig.json / pnpm-workspace.yaml
├── AGENTS.md / CONTEXT.md
└── src/
    └── index.ts           # 扩展入口(register);领域目录(tools/ commands/ lib/ 等)由项目按需增设
```

`skills/`、`prompts/` 等资源目录在**有真实内容时**再加入 pi manifest,不预建空目录。

## 4. 编码与 API 约定

- **Tools**:每个 Tool 用 typebox 声明输入 Schema;只读与变更工具严格分离;输出必须有界(大输出先截断/摘要)。
- **Hooks**:生命周期事件以安装版本类型为准;钩子内不做重活,重活放异步任务或子进程。
- **Prompt Hygiene**:永不修改 Pi 的 system prompt;注入指令用对话消息追加,精简、可移除,空闲不注入。
- **配置与密钥**:配置解析 fail-closed;Token/API Key 绝不写入代码、日志、示例或文档,仅经环境变量或 `chmod 0600` 文件存储,日志一律脱敏。

## 5. 命令与开发回路

> 本仓库无 build、无 dev server、无 e2e。全量 test / lint 都是十秒级,真正慢的只有「实机调试」(走网络 + clean+reinstall)。

```bash
# 日常（秒级，默认收尾只用这三条）
pnpm typecheck                    # tsc --noEmit，全量类型兜底（~3.5s）
pnpm exec biome check <改动路径>   # 只查改动文件/目录（~10ms/文件）
pnpm test <path|文件名>            # 只跑改动相关的 test（~0.2s/文件）

# 全量（触发条件命中才跑）
pnpm test                         # vitest run --dir src：123 文件 / 1259 用例（~6.5s）
pnpm -w run lint                  # workspace root：biome check .，255 文件（~0.1s）

# 实机（真装进 Pi 才验得到；走网络 + clean+reinstall）
pi -e git:github.com/Coffelix2023/xpi-memo                    # 冒烟，临时装不落 settings
pi update --extension git:github.com/Coffelix2023/xpi-memo     # 拉取已发布版本
```

### 5.1 收尾规则

1. 默认收尾（改 `.ts`）：`pnpm typecheck` + `pnpm exec biome check <改动路径>` 全绿即算完成。
2. 追加单测：改到已有测试的模块才跑，测试与源码同目录同名，`src/**/<name>.ts` → `pnpm test <name>`，改哪跑哪。
3. 只改 `.md` / 注释 / 文案：Biome 不覆盖 `.md`（`biome check` 会以「No files were processed」exit 1,属正常），无 lint 可跑,直接完成。
4. 全量 test / 全量 lint 触发条件（命中其一才跑）：改了被多方引用的公共模块（`src/types.ts`、`config.ts`、`auto-store-policy.ts`、`event-stream.ts`、`banks.ts` 等）;一次改动跨 3 个以上领域目录;合并主干 / 发版 / 用户要验收。
5. 实机调试触发条件（命中其一才跑）：改了扩展注册、Tool/Command 签名、`ctx.ui.*` 交互、加载路径或 pi manifest;用户要求真机确认。
6. 禁止：
   - 不因「任务做完」「更保险」「顺手确认」跑全量 test / 全量 lint / `pi update`。
   - 无新改动不重跑;一轮只在最后一次改动后收尾一次。
   - 失败只重跑失败那条（`pnpm test <路径>`），不重跑整套。
   - 不为绕过慢命令而改 `package.json` 脚本。
7. 判不准是否里程碑：按默认收尾处理。
8. 汇报：列出已跑的命令与结果;未跑的全量 / 实机命令写一行，例如「未跑全量 test / 实机（非里程碑），需要验收请说」。不把「未跑」写成「已通过」。

### 5.2 已知坑

- 若 lint 输出意外出现 ESLint，先确认 `scripts.lint` 仍为 `biome check .`，再运行 `pnpm exec biome check .` 诊断;禁止安装 ESLint。
- `pnpm test -t <名称>` 仍会加载全部 123 个文件（~2.5s），比按路径过滤慢,优先路径过滤。
- 首次实机安装：`pi install git:github.com/Coffelix2023/xpi-memo`（免 pin ref）。
- `pi update --extension` 走网络且 clean+reinstall,单包更新不影响其他扩展,只在有已发布改动或用户要求时跑。
- 不用本地软链/路径安装——避免正式安装后遗漏清理。

## 6. Git 与回滚纪律

- 只要任务碰到 git / GitHub / 远端仓库 / release，先读 `docs/GIT-WORKFLOW.md`，再读 `docs/GITHUB-GUARD.md`。
- 默认不设分支, 以git安全流程提交检查点.
