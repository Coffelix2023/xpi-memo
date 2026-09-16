# Task 21 Report — 面板键盘交互重构（Space / Enter / 方向键）

- 关联任务：`.pi/fast-fixes/2026-09-16-xpi-memo-panel-fixes/tasks.md` §1（1.1–1.3）
- 涉及文件：`src/console.ts`、`src/console.test.ts`
- 日期：2026-09-16

## 目的

原来的面板把两件完全不同的事压在一个键上：`Enter` 既折叠分组，又切换字段值。结果是想改一个设置时顺手就把分组折叠了，而"保存"这件事在交互上根本没有入口（字段值是改一次存一次）。本节把三个键各归其位：

- `Space`：做"改动"——组头折叠/展开，字段行切到下一个值；
- `Enter`：做"确认"——把面板当前状态写盘，面板不关闭；
- `←/→`：切标签，且到边界停住。

## 作用

1. `Space` 顶替原来 `Enter` 的全部改动语义（`settingsActivate`），折叠与循环值的实现未改，只换触发键。
2. `Enter` 走新的 `settingsSave()`：调用 `actions.save({})` 落盘当前状态，设置 `savedNotice`，面板保持打开——用户可以在一次打开里连续改多项。
3. `nextTab` 从模运算改为钳制：`Math.max(0, Math.min(current + step, TAB_COUNT - 1))`，到 Status 再按右键、到 Pending 再按左键都不再跳回另一端。

## 特点

- **改动语义集中在一个函数**：`settingsActivate` 同时服务折叠与循环值；`settingsSave` 只负责落盘，两者互不引用。
- **保存有可见反馈**：`savedNotice` 让新增的说明行显示"已保存 · 配置已写入"，任何后续按键（含导航）都会清掉它，不引入定时器。
- **边界行为可测**：`nextTab` 是纯函数，边界断言（`nextTab(0, -1) === PENDING_TAB`、`nextTab(STATUS_TAB, 1) === STATUS_TAB`）在单测里直接锁定。

## 边界

- `Enter` 不改动字段值，`Space` 不落盘全量配置；两个键的职责不重叠。
- `↑/↓` 的行序列仍然循环（`moveRow` 未改），本节的"不循环"只针对**标签**导航，避免误伤列表滚动习惯。
- `Esc` 关闭行为、Pending 列表的 `Enter`（选中候选）行为均未改动：Pending 标签下 `Enter` 仍交给 `SelectList`。
- `Space` 在 Recent/Status 标签上仍是惰性的（那两张表只响应上下键）。

## 验证

- `pnpm test src/console.test.ts`：55 passed。覆盖 Space 折叠、Space 循环值、Enter 只保存不关闭、←/→ 到边界停止。
- `pnpm typecheck`、`pnpm -w run lint` 通过。
