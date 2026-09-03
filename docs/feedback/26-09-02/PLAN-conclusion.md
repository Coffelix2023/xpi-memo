# 针对`PLAN.md`的评审意见

这个提议方向上有合理的直觉（解决孤儿 bank、项目删除后记忆残留、可移植性），但如果**原样实施——把项目级 SQLite bank 整个搬进项目目录——会引入四个新问题，其中两个会直接破坏你现有设计的根基**。我的结论是：**不要整体搬迁，采用"分层放置"——可提交的文本记忆进项目，机器态 SQLite 留在全局**。这正好也是我们此前三层架构讨论（全局 / 仓库提交层 / 机器索引层）的落地版。下面是完整评估。

---

## 一、提议方案的真实收益（先承认它解决了什么）

| 问题 | 当前（全局 banks/project-\<hash\>/） | 搬进项目后 |
|---|---|---|
| 孤儿 bank | 项目删了，`project-p-xxx` 永远留在全局目录，只能靠 doctor 清理 | 随项目目录一起删除，零残留 |
| 可移植性 | 换机器要单独迁移 `~/.pi/agent/xpi-memo/banks/` | `git clone` 即得（如果提交） |
| 可发现性 | 用户不知道记忆存在哪 | 就在项目里，透明 |
| **上一轮的非 git 问题** | 非 git 目录无项目身份、残血模式 | 项目身份可以退化为"目录本身"，**顺带解决 routing rejected 问题** |

第四点是意外收获——你上一轮实测暴露的"非 git 目录无项目记忆"问题，在这个方案里天然消失了：身份不再依赖 git common-dir，任何目录都可以有 `.pi/xpi-memo/`。

## 二、但 SQLite 进项目目录会撞四面墙

### 🔴 墙 1：多 worktree / 多 clone 冲突——直接击穿你的身份设计

你现有的项目身份是 `sha256(git common-dir)`，**刻意让同一仓库的所有 worktree 共享一个 bank**。SQLite 放进项目根目录后：

- 每个 worktree / clone 得到**各自独立的** `.pi/xpi-memo/mnemosyne.db`——同一项目的记忆碎成 N 份，你在 worktree A 存的 decision，worktree B 召回不到；
- 若提交进 git，两个 worktree 各改各的 SQLite 二进制 → **merge conflict 不可合并**（二进制文件 git 无法三路合并），这比代码冲突糟糕得多。

### 🔴 墙 2：SQLite 与 git 天然相克

mnemosyne.db 是 WAL 模式的高频写二进制文件：每次写入 mtime 变化 → `git status` 永久脏；WAL 期间的 `-wal`/`-shm` 临时文件会闪现；agent 高频自动写入（激活循环跑通后）会产生海量无意义 commit。你只能 `.gitignore` 它——**而一旦 ignore，"可移植性"这个主要收益就没了**，剩下的只是"换了个存放位置"。

### 🔴 墙 3：隐私与安全边界反转

项目记忆里有什么？`project_gotcha`（"这个库的某接口有坑"）、`project_constraint`、有时夹带内部路径、内部服务名。放在全局目录，它永远不出本机；放在项目根目录，**一次手滑的 `git add -f` 或打包发布就把它送到了远程仓库**。你此前的安全约束是"敏感信息不进 T1"，但 T1 之外还有候选、L0 事件——整个 `.pi/xpi-memo/` 目录的内容敏感度远高于代码。把攻击面放在离 `.git` 只有一层 `.gitignore` 的地方，是拿纪律赌安全。

### 🟡 墙 4：召回路径复杂度上升

现在 recall 只需看 `~/.pi/agent/xpi-memo/` 一处；改后要"全局目录 + cwd 项目目录"两路汇合，且 cwd 判断本身有坑（从项目子目录启动、mono-repo 嵌套、symlink）。召回是热路径，热路径上每多一次文件系统探测都是延迟和故障点。

## 三、推荐方案：分层放置（Markdown 进项目，SQLite 留全局）

把"项目记忆"拆成两种物态，各归其位：

```
项目仓库内（可选提交，source of truth 的"人读层"）
└── .pi/memory/
    ├── DECISIONS.md      # project_decision 的固化导出
    ├── CONSTRAINTS.md    # project_constraint
    ├── GOTCHAS.md        # project_gotcha
    └── .gitignore        # 可选：选择不提交则 ignore 整个目录

全局用户目录（机器态，唯一写入点）
└── ~/.pi/agent/xpi-memo/
    ├── mnemosyne.db                    # global bank
    └── banks/project-<hash>/           # SQLite 索引 + 全量 T1，不动
        └── mnemosyne.db
```

运转规则：

1. **SQLite 仍是唯一写入点和召回引擎**，留在全局，hash 身份、跨 worktree 共享、单进程写全部保留——三面墙全部不触发；
2. **Markdown 导出层落在项目内**：sleep/合并或显式 `export` 时，把该项目 bank 的固化记忆写成 `.pi/memory/*.md`——这就是 pi-memory 已经验证过的模式（Markdown 可 diff、可 PR、KV-cache 稳定）；
3. **是否提交由用户决定**：`.pi/memory/` 默认进 git（团队共享决策记忆，这是最大红利），敏感项目加一行 ignore 即回到纯本地——**隐私决策从"架构强制"变成"每个项目一次显式选择"**；
4. **回流**：clone 一台新机器后，agent 首次进入项目读到 `.pi/memory/*.md`，作为 `repo-export` 证据类型的候选回流进本地 bank——可移植性通过"文本回流"实现，而不是搬数据库。

## 四、决策对照表

| 判据 | 你的原案（SQLite 进项目） | 分层方案（推荐） |
|---|---|---|
| 孤儿 bank 清理 | ✅ 根治 | 🟡 仍需 doctor 清理（但导出层随项目走） |
| 跨 worktree 共享 | ❌ 碎裂 | ✅ 保留 |
| git 冲突/脏树 | ❌ 二进制不可合并 | ✅ 只导 Markdown，可 diff 可 PR |
| 隐私默认安全 | ❌ 紧贴 .git，靠 ignore 纪律 | ✅ SQLite 永不出本机；导出是显式动作 |
| 团队共享记忆 | 🟡 理论上可，实践冲突爆炸 | ✅ Markdown PR 即共享 |
| 非 git 目录支持 | ✅ 附带解决 | 🟡 需单独的目录身份 fallback（上一轮 P1 项，照做即可） |
| 召回热路径 | 🟡 双路径探测 | ✅ 单路径不变 |
| 实现成本 | 中（搬迁+迁移+召回改造） | 低（只加一个导出目标路径） |

## 五、落地动作（并入计划 v3）

1. **不搬 SQLite**；给 export/Markdown 层增加"项目内导出目标"：`{projectRoot}/.pi/memory/`，与现有全局 `markdown/` 导出并存（全局导出保留为备份视角）；
2. 导出文件名与 kind 一一对应，保留 `<!-- id: <memoryId> -->` 锚点，使导出可幂等重跑、回流可去重；
3. 新增 `repo-export` 证据类型用于回流候选，优先级低于 `explicit-user-statement`、高于 LLM 提取；
4. doctor 增加 `orphan_bank` 检查（hash 对应的 common-dir 不存在 → 提示归档而非删除，遵守"不自动删历史数据"约束）——这补上了原案想根治的孤儿问题；
5. 非 git 目录的项目身份问题走上一轮建议的独立方案（显式 `init` 或 global 降级），**不要**为了它把 SQLite 搬进目录。

一句话：**你的直觉对了一半——项目记忆确实应该"活在项目里"，但活在项目里的应该是它的文本形态，不是它的数据库形态**。SQLite 是引擎，引擎放在车库（全局目录）；Markdown 是货，货跟着项目走。
