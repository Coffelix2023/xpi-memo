# 修复计划: 存储确认开关与确认面板中英文案

- 工作流标识: xpi-fast-fix
- 创建时间: 2026-09-04
- 原始需求摘要: settings 增加"是否需要确认"项(默认不确认即刻 store);确认面板支持中文模式
- planStatus: archived
- executionStatus: done
- 任务清单: `./tasks.md`

## 目标

1. settings(config.json + 控制台 Settings tab)新增 `confirmStore`(on/off,默认 off):off 时 agent 调用 `xpi_memo_remember` 产生的候选记忆即刻 store,不弹确认面板;on 时弹出 Store/Later/Reject 确认面板。
2. settings 新增 `language`(en/zh,默认 en):确认面板文案随其切换中英文。

## 非目标

- 不改非 TUI(headless)模式行为(仍为 `later` 排队)。
- 不中文化 Settings 面板标签及其他 UI 文案(仅确认面板)。
- 不引入 i18n 库、不新增依赖、不改 store 治理策略本身。

## 证据

- 确认面板:`src/index.ts:519` `chooseCandidateAction()`,硬编码英文 `Store ${kind} in ${bank}?` / `Store`/`Later`/`Reject`。调用处:`src/index.ts:789`(executeRemember)、`src/index.ts:1804`(/xpi-memo reviewCandidate)。
- Settings 面板:`src/console.ts` `settingsItems()`(行 ~210)、`changeField()`(行 ~517)、`ConsoleSettings` 类型(行 18)。
- 配置管线:`src/config.ts`:`DEFAULT_XPI_MEMO_CONFIG`、`XpiMemoConfig`、`UserConfig`、`WRITABLE_KEYS`、`ENV_KEYS`、`loadConfig`(envBool/union-resolver 模式)、`saveUserConfig`。
- 文档:`GUIDE.md:157-170` 配置表;`README.md:65-74` 环境变量列表。

## 根因

settings 无"是否需要确认"与"语言"配置项;确认面板无条件弹出且文案硬编码英文。

## 推荐方案

新增两个配置键,全部复用现有模式,不引入依赖:

| 键 | 环境变量 | 默认 | 行为 |
|---|---|---|---|
| `confirmStore: boolean` | `XPI_MEMO_CONFIRM_STORE` | `false` | false=即刻 store 不弹面板;true=弹确认面板 |
| `language: "en" \| "zh"` | `XPI_MEMO_LANGUAGE` | `"en"` | 确认面板文案语言 |

1. `src/config.ts`:默认值、类型、`UserConfig`、`WRITABLE_KEYS`、`ENV_KEYS`、`SaveUserConfigOptions` Pick、`loadConfig` 解析(confirmStore 走 envBool 模式;language 走 union resolver,fail-closed 回退 "en")。
2. `src/console.ts`:`settingsItems` 增加两行("Confirm before store" on/off,env `XPI_MEMO_CONFIRM_STORE`;"Language" en/zh,env `XPI_MEMO_LANGUAGE`);`ConsoleSettings` Pick 增加 `confirmStore`/`language`;`changeField` 增加 confirmStore(boolean)与 language(string)分支。
3. `src/index.ts`:`chooseCandidateAction(ctx, candidate, config)` 增加 config 参数:
   - 非 TUI:返回 `"later"`(不变);
   - TUI 且 `confirmStore === false`:返回 `"store"`,不弹面板;
   - TUI 且 `confirmStore === true`:弹面板,文案按 `config.language` 取内联字符串表(en: `Store {kind} in {bank}?`/`Store`/`Later`/`Reject`;zh: `将 {kind} 存入 {bank}?`/`存储`/`稍后`/`拒绝`)。
   - executeRemember(行 789)传 `runtime.config`;reviewCandidate(行 1804)传 `runtime.config`,但 reviewCandidate 为用户主动点击审阅,始终弹面板(仅语言随配置),confirmStore 不拦截它——实现上 chooseCandidateAction 增加 `force` 参数或由调用处决定是否传 confirmStore 覆盖。
4. 测试:`src/config.test.ts`(新键默认值/文件值/env 覆盖/非法值回退)、`src/console.test.ts`(settingsItems 新行)、`src/index.test.ts`(confirmStore=false 不调用 ui.select 直接 store;language=zh 时面板文案中文)。
5. 文档:`GUIDE.md` 配置表加两行;`README.md` 环境变量列表加两行。

## 放弃方案及原因

- 引入 i18n 库:两套文案共 8 条,内联常量表足够,违反最小改动原则。
- 中文化全部 UI:超出需求范围。
- 非 TUI 也即刻 store:改变 headless 数据写入行为,风险大于收益,保持排队。

## 决策

- D1: 非 TUI 模式行为不变(`later` 排队)。
- D2: `confirmStore` 只拦截 agent 自动触发的确认弹窗;用户在 Pending tab 手动 review 时始终弹面板(文案仍随 `language`)。
- D3: 默认 `confirmStore=false`(即刻 store)为需求指定的新默认行为,文档明确说明。

## 风险与兼容性

- 默认行为变化:TUI 下从"弹面板"变为"直接存"。为需求本身;`GUIDE.md` 写明并给出恢复方法(`confirmStore=true` 或 `XPI_MEMO_CONFIRM_STORE=true`)。
- 旧 config.json 无新键:loadConfig 回退默认值,兼容。
- 非法值:fail-closed 回退默认,与现有键一致。

## 假设与默认值

- 面板中文案:标题 `将 {kind} 存入 {bank}?`,选项 `存储`/`稍后`/`拒绝`,证据摘要行不翻译(来源数据原样)。
- env locked 时 Settings 行不可编辑,复用现有 `(env locked)` 机制。

## 验证命令

```bash
pnpm vitest run src/config.test.ts
pnpm vitest run src/console.test.ts
pnpm vitest run src/index.test.ts
grep -n "XPI_MEMO_CONFIRM_STORE\|XPI_MEMO_LANGUAGE" GUIDE.md README.md
pnpm typecheck && pnpm -w run lint && pnpm test
```

## 验收标准

1. `config.json` 写 `{"confirmStore": true}` 后,agent 调用 remember 弹出确认面板;不写或为 false 时不弹面板直接 store。
2. `{"language": "zh"}` 时面板标题与选项为中文;默认英文。
3. Settings tab 可见两项新设置并可切换持久化;env 锁定时不可编辑。
4. `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 全绿。
