## 1. Group model and field set

- [x] 1.1 在 `src/console.ts` 引入分组结构（组 id + 组内字段 key），划分 5 组，并让 `settingsItems` 覆盖 19 个配置字段加 `sleep` 动作；验证更新后的 `src/console.test.ts` 字段集合断言通过，且每个字段只归属一个组
- [x] 1.2 为 10 个新纳入字段填入 `src/config.ts` 中已生效的 `XPI_MEMO_*` 变量名，并把锁定标签由 `(env locked)` 改为附变量名；验证新增单测断言锁定字段的 label 含变量名且其 `values` 被省略

## 2. Row sequence and window

- [x] 2.1 实现把折叠状态展开成行序列的纯函数；验证单测覆盖默认态（5 组头 + 首组 6 字段 = 11 行）、全折叠（5 行）、全展开（25 行）三种展开状态
- [x] 2.2 实现跟随光标的窗口函数；验证单测覆盖光标位于首、中、尾三处时窗口行数恰为 body 行数、不越过行序列两端、且始终包含光标
- [x] 2.3 实现折叠后的光标重定位；验证单测覆盖光标停在字段行且该字段所在组被折叠时，光标落到仍存在的行而渲染不出空光标位置

## 3. Settings rendering

- [x] 3.1 实现组头行渲染（展开箭头 + 组名 + 字段计数）；验证渲染输出含展开与折叠两种箭头且计数与会话内字段数一致
- [x] 3.2 实现选中态渲染；验证渲染输出中左右边框字符在每一行保持连续，且选中行可与其他行区分
- [x] 3.3 用自绘分组列表替换 Settings tab 的 `SettingsList`，并自行实现取值循环与锁定字段 no-op；验证 `pnpm typecheck` 通过且 Settings tab 不再引用 `SettingsList`
- [x] 3.4 验证面板几何契约未被破坏：新的 Settings 渲染路径下每行贴合 78 列基准、body 行数仍由 `panelLayout` 决定、短终端下 `MIN_BODY_ROWS` 仍生效

## 4. Keyboard

- [x] 4.1 让 `up`/`down` 在行序列上移动光标并保持光标可见；验证单测覆盖跨组头移动、首尾环绕，以及移动到可见区之外时窗口跟随
- [x] 4.2 让 `Enter` 按行类型分派：组头折叠/展开、可写字段循环取值、锁定字段 no-op、`sleep` 动作行触发既有确认流程；验证单测逐条覆盖这四种分派
- [x] 4.3 让 `Tab` / `Shift+Tab` 只在字段行之间跳并跳过组头；验证单测覆盖从组头出发的两个方向都落到字段行

## 5. Verification (first pass)

- [x] 5.1 更新 `src/console.test.ts` 中受分组结构影响的既有断言；验证全量 `pnpm test` 通过
- [x] 5.2 运行 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 并确认三项全部通过

## 6. Panel geometry budget

- [x] 6.1 把 `panelLayout` 的高度改成 `min(PANEL_HEIGHT, floor(terminalRows × 70%))`，body 仍由 height 反推；验证更新后的 `panelLayout` / `bodyRows` 单测覆盖大终端落在 20 行、小终端按 70% 收紧、且 `MIN_BODY_ROWS` 仍生效
- [x] 6.2 在 `openConsole` 的 `overlayOptions` 补上底部留白（`margin.bottom >= 4`）；验证 overlay 单测断言 margin 存在且 `bottom` 不小于 4

## 7. Panel language

- [x] 7.1 建立面板文案字典（chrome / 组名 / 字段标签 / 字段备注，`zh-CN` 与 `en` 两份），语言取自 `config.language`；验证单测断言两种语言下每个键都取到非空值
- [x] 7.2 让面板渲染改走字典，并实现缺键回退（选中语言 → `en` → 键名）；验证单测抽掉一个键后仍渲染出非空文本且不抛错

## 8. Field note column

- [x] 8.1 字段行改三列「标签 / 当前值 / 备注」，备注取自原型的 `note.*` 文案；验证渲染输出三部分都在，且 78 列下三列位置对齐
- [x] 8.2 实现窄终端降级：先丢备注列，再截断 label，值保持可见；验证单测在 40 列下断言备注消失而 label 与 value 仍在

## 9. Verification (second pass)

- [x] 9.1 更新受高度预算、三列与语言影响的既有断言；验证 `pnpm exec vitest run src/` 全绿
- [x] 9.2 运行 `pnpm typecheck`、`pnpm -w run lint`、`pnpm exec vitest run src/` 并确认三项全部通过
