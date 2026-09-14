# 任务清单: 存储确认开关与确认面板中英文案

- 工作流标识: xpi-fast-fix
- 创建时间: 2026-09-04
- 计划: `./plan.md` | 概览: `./README.md`
- planStatus: archived
- executionStatus: done

状态机: pending → in_progress → done;in_progress → failed;failed → pending(仅修订方案后)。

## Tasks

### 1. config
- id: config
- title: config.ts 新增 confirmStore / language 两键(默认值、类型、WRITABLE_KEYS、ENV_KEYS、loadConfig、saveUserConfig Pick)
- acceptance: loadConfig 能解析两键;默认 confirmStore=false、language="en";env 覆盖生效;非法值 fail-closed 回退默认;config.test.ts 新增用例通过
- verify: pnpm vitest run src/config.test.ts
- dependsOn: []
- status: done
- verification: `pnpm vitest run src/config.test.ts` passed (15 tests, 2026-09-04)

### 2. console-settings
- id: console-settings
- title: console.ts Settings tab 增加 Confirm before store(on/off)与 Language(en/zh)两项并接通保存
- acceptance: settingsItems 返回两项新行(env locked 时无 values);changeField 正确持久化 boolean 与 string;console.test.ts 用例通过
- verify: pnpm vitest run src/console.test.ts
- dependsOn: [config]
- status: done
- verification: `pnpm vitest run src/console.test.ts` passed (34 tests, 2026-09-04)
### 3. confirm-gate
- id: confirm-gate
- title: index.ts chooseCandidateAction 接入 confirmStore 门控与中英文案表
- acceptance: TUI+confirmStore=false 不调用 ctx.ui.select 直接 store;confirmStore=true 弹面板;language=zh 时标题/选项为中文;非 TUI 仍 later;reviewCandidate 始终弹面板;index.test.ts 用例通过
- verify: pnpm vitest run src/index.test.ts
- dependsOn: [config]
- status: done
- verification: `pnpm vitest run src/index.test.ts` passed (58 tests, 2026-09-04)
### 4. docs
- id: docs
- title: GUIDE.md 配置表与 README.md 环境变量列表同步两键,注明默认行为变化
- acceptance: 两份文档包含 XPI_MEMO_CONFIRM_STORE 与 XPI_MEMO_LANGUAGE 及默认值说明
- verify: grep -n "XPI_MEMO_CONFIRM_STORE\\|XPI_MEMO_LANGUAGE" GUIDE.md README.md
- dependsOn: [confirm-gate]
- status: done
- verification: grep found `XPI_MEMO_CONFIRM_STORE` and `XPI_MEMO_LANGUAGE` in GUIDE.md and README.md
### 5. full-verify
- id: full-verify
- title: 全量验证三件套
- acceptance: typecheck / lint / test 全部通过
- verify: pnpm typecheck && pnpm -w run lint && pnpm test
- dependsOn: [config, console-settings, confirm-gate, docs]
- status: done
- verification: `pnpm typecheck && pnpm -w run lint && pnpm test` passed (580 tests, 6 skipped, 2026-09-04)
