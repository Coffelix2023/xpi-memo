# Task 22 Report — 语言切换即时生效

- 关联任务：`.pi/fast-fixes/2026-09-16-xpi-memo-panel-fixes/tasks.md` §2（2.1）
- 涉及文件：`src/console.ts`、`src/console.test.ts`
- 日期：2026-09-16

## 目的

面板的语言有两份状态：磁盘上的 `language` 配置，和面板自己渲染时读的 `model.language`。切换语言时只写了前者，面板却在读后者——于是"切了没用，得关掉再开一次"。这不是翻译缺失，是**同一份状态有两个副本且只更新了一个**。

## 作用

`changeField` 把 `language` 从"和其它字符串字段一起处理"的分支里拆出来单独处理：

1. 照旧 `actions.save({ language: value })` 落盘；
2. 把值窄化到 `"en" | "zh"` 后写回 `model.language`；
3. 照旧 `tui.requestRender()`。

## 特点

- 修在**唯一入口**上：所有语言变更都经过 `changeField`，因此不存在"某个路径改了盘、另一个路径改了内存"的分裂。
- 无新增状态：`model.language` 本来就是渲染使用的唯一来源，这次只是让它和磁盘保持一致。
- 语言与其它字符串字段分道后，分支意图更清楚（其它字段不需要回写视图模型）。

## 边界

- 只影响面板自身的文案（标签、字段名、字段说明、info bar、提示行）。`index.ts` 注入给模型的提示文案是另一套字典，本次未动。
- 已配置但环境变量 `XPI_MEMO_LANGUAGE` 生效时，该字段在面板中仍显示为锁定只读，不会走这条分支。
- 值域仍由 `SETTINGS_FIELD_SPECS.language.values = ["en", "zh"]` 限制，非法值不会进入 `model.language`。

## 验证

- `pnpm test src/console.test.ts`：新增用例"switching the language field re-renders the panel in the new language"——在面板内把 `language` 从 en 切到 zh，同一次打开内 `render()` 必须出现"召回与检索""界面语言"且不再出现"Retrieval"。
- `pnpm typecheck`、`pnpm -w run lint` 通过。
