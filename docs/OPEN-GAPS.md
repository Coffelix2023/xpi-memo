# OPEN-GAPS — 未闭合问题登记册

本文件记录**已确认、但当前没有实现或没有闭合**的问题，以及处理建议。
写入这里**不代表**它已进入交付范围，也不代表任何一方承诺实现；

- 判断“现在到底是怎么跑的”，看 `openspec/specs/`（行为契约）与代码，不看本文件的建议。
- 本文件的建议是**候选方案**，不是决定。任何一条要落地时，走正常流程（需要改行为就开 OpenSpec change，并同步 delta spec）。
- 与 `docs/UPSTREAM-FOLLOWUPS.md` 的分工：那份写“对上游 Mnemosyne 的请求”，这份写“本仓库自己未闭合的问题”。

**发现于**：2026-09-17，v1.6.0 发布前的复核（typecheck / lint / test 全绿之后，人工核对 spec 与 `src/` 的一致性）。

字段约定：每条给出 `状态` / `证据` / `影响` / `建议方案` / `建议采纳` / `何时该做`。
`证据` 一律给文件与行号，便于复核；行号基于 v1.6.0（`cc00b8f`），后续可能漂移。

---

## OG-1：spec 声称项目级 `auto_verify_kinds` 覆盖，代码里不存在

- **状态**： 未实现，且当前**没有任何项目级配置层**。
- **证据**：
  - `openspec/specs/candidate-auto-admission/kind-routing/spec.md:52-57` — 场景「项目级覆盖策略」：`WHEN` 项目 `.pi/xpi-memo.yaml` 配置 `auto_verify_kinds: [project_gene]`，`THEN` 仅 `project_gene` 走工具验证、其他 kind 走待审、**且全局配置不覆盖项目级配置**。
  - `src/config.ts:372-499` — `loadConfig` 只读两处：`$XDG_CONFIG_HOME/xpi-memo/config.json`（用户级，`src/config.ts:180` 定义路径）与 `XPI_MEMO_*` 环境变量；优先级 `env > 用户文件 > 默认`。**没有第三层**。
  - 全仓检索 `auto_verify_kinds`：命中只在 `openspec/` 的 spec 与已归档 change 里，`src/` 零命中。
  - 全仓检索 `.pi/xpi-memo.yaml`：零命中；`src/` 里也**没有任何 YAML 解析**（直接的 `devDependencies` 不含 yaml；`yaml@2.9.0` 只是 `pi-coding-agent` 的间接依赖，本项目 `import` 不到）。
  - 唯一生效的控制是 `XPI_MEMO_AUTO_VERIFY`（`src/kind-routing.ts:33-37`，取 `false`/`0` 时全部 kind 退化为 `manual-confirm`）。
- **影响**：
  - **对外可观察行为与 spec 不符**。用户按 spec 写 `.pi/xpi-memo.yaml` 不会有任何效果，而且不会有任何提示（没有“未知配置”告警），属于静默失效。
  - 唯一的错误方向是“更保守”——候选照样进待审队列，不会误存；所以是**能力缺失**，不是**数据风险**。
  - v1.6.0 的 Release notes 已如实记为 “Not in this release”（`gh release view v1.6.0`）。
- **建议方案**：
  - **方案 A（项目 `config.json` + trust 门控）** — 新增 `<cwd>/.pi/xpi-memo/config.json`，与既有的 `.pi/xpi-memo/project.json`（`src/local-identity.ts:25-26`）同目录同格式；优先级 `env > 项目 > 用户 > 默认`；用 `ctx.isProjectTrusted()`（Pi 0.85.1 `core/extensions/types.d.ts:233-234`）门控，符合 `~/.pi/agent/AGENTS.md` 第 5 条“项目级配置仅在项目被信任时生效”。spec 把 `.pi/xpi-memo.yaml` 改写成该路径。
    - 代价：新增一层配置解析 + trust 接线；`loadConfig` 当前是纯函数（只吃 `configHome` 与 `env`），要加进 `cwd` 与 trust 结论，签名会变。
    - 收益：此后**所有**项目级键都有地方放，不用每来一个键再设计一次。
  - **方案 B（用户配置里按 project id 作用域）** — 不新增文件，在用户级 `config.json` 加 `autoVerifyKindsByProject: { "<projectId>": ["project_gene"] }`，复用既有 project id 解析。
    - 代价：偏离 spec 的“项目文件”语义（仓库 clone 到另一台机器后，配置不跟着走）；spec 需按实际语义改写。
    - 收益：diff 最小，不引入 trust 问题（这是用户自己的配置文件）。
  - **方案 C（只改 spec）** — 删掉该场景或改为“未来能力”，不写代码。spec 立刻为真，项目级覆盖永久不做。
- **建议采纳**： **方案 A**。理由是 spec 的原意就是“项目自带这份约定、跟着仓库走”，方案 B 恰好丢掉这个语义；而 `.pi/xpi-memo/` 目录与 `config.json` 命名都已经存在，新增成本主要在 trust 接线，不在文件格式。方案 C 只有在确认“不需要项目级配置”时才选。
- **何时该做**： 下次要动准入策略，或出现第二个项目级配置需求时一起做——单独为 `auto_verify_kinds` 引入一层配置不值得。

---

## OG-2：`global_preference` 的 `accumulate` 策略是占位，行为等于待审

- **状态**： 占位已登记在代码注释里，行为未实现。
- **证据**：
  - `src/kind-routing.ts:8` — 注释原文：`accumulate = evidence accumulation (reserved, not implemented this round)`；`src/kind-routing.ts:14` — `global_preference: "accumulate"`。
  - `src/tool-verification.ts:151-165` — `verifyCandidateIfNeeded` 里只要 `policy !== "tool-verify"` 就返回 `status: "skipped"`、`reason: policy:accumulate`，候选留在待审队列。所以**可观察行为与 `manual-confirm` 完全相同**，差别只在 audit 里的 reason 字符串。
  - spec 已经写了依赖它的场景：`openspec/specs/candidate-auto-admission/kind-routing/spec.md:70-75` —「累积证据查询超时」要求 `WHEN preference 累积证据查询超时` `THEN` 进待审 + `AND` audit 记录 `accumulation-timeout`（该事件名在 `src/` 零命中）。
- **影响**：
  - 三态策略里有一个**语义为真、行为为假**的中间态。读 `kind-routing.ts` 的人会以为 preference 走了累积逻辑。
  - `global_preference` 候选目前全部堆在待审队列，和自动准入这一轮的初衷（减少积压）相反——这是已知的、被明确留下的缺口，不是 bug。
  - spec 里那个场景**目前无法被任何实现满足**，属于对未来的描述。
- **建议方案**：
  - **方案 A（reword spec，标 reserved）** — 把「累积证据查询超时」标为“尚未指定的能力”，或移到提案区；代码不动。当前行为（跳过验证、进待审）本就是安全的失败方向。
  - **方案 B（实现累积）** — 真正做证据累积：累积状态与存储、阈值、超时回退、`accumulation-timeout` 审计事件、跨会话去重语义。这是一个**独立子系统**，不适合塞进准入策略的收尾。
  - **方案 C（降级为 `manual-confirm`）** — 把 `global_preference` 直接写成 `manual-confirm`，消除这个中间态，连带把 spec 的场景删掉。
- **建议采纳**： **方案 A**，等真要做累积时再连同 spec 一起改。方案 C 更诚实但会丢掉“这里将来要放累积”的路标；如果倾向于“不留悬空状态”，C 也可以接受。
- **何时该做**： 决定“要不要做证据累积”这件事本身要先有结论；在那之前，spec 的措辞应该反映“还没实现”。

---

## OG-3：audit 事件名与 spec 不一致（两处）

- **状态**： 代码有等价能力，但事件名不是 spec 写的那个。属于措辞漂移，不是能力缺失。
- **证据**：
  - spec `openspec/specs/candidate-auto-admission/kind-routing/spec.md:67` 要求 `verification-unavailable`；
    `:74` 要求 `accumulation-timeout`。两者在 `src/` 均**零命中**。
  - 实际事件集在 `src/audit.ts:15-26`（`AUDIT_ACTIONS`）：与验证相关的是 `tool-verified` 与 `tool-verification-failed`。
  - 失败原因以 reason code 区分：`src/tool-verification.ts:73`（`rg-unavailable`）、`:74`（`rg-error`）、`:114`（`rg-error`）、`:163`（`verifier-not-registered`）、`:162`（`policy:accumulate` / `policy:manual-confirm`）。
  - 所以“工具不可用”这一情形**有审计记录**，只是记成 `tool-verification-failed` + `reason: rg-unavailable`，而不是独立事件 `verification-unavailable`。
- **影响**：
  - 只影响**按事件名**消费 audit 的下游（脚本、评测、人工核对）；按语义读不受影响。
  - 会让人误判“审计缺失”。这也是本轮复核里差点被当成 bug 的一处。
- **建议方案**：
  - **方案 A（把 spec 对齐代码）** — spec 改写成“记录 `tool-verification-failed`，reason 至少包含 `rg-unavailable` / `rg-error` / `verifier-not-registered`”。零代码改动，不动已发布的 audit 格式。
  - **方案 B（把代码对齐 spec）** — 新增 `verification-unavailable` 事件名。代价：已发出的 audit 记录里没有它，新旧格式并存；除非确实需要独立事件，否则是自找兼容负担。
- **建议采纳**： **方案 A**。代码侧的行为已经实现且被 `src/audit.test.ts`、`src/tool-verification.test.ts` 覆盖，改 spec 是“把描述改成事实”，改代码是“把事实改成描述”——前者更便宜，也不破坏已写出的审计数据。
- **何时该做**： 与 OG-1 / OG-2 一起，在同一个 spec 修订里收掉（三处都在同一份 `kind-routing/spec.md`）。

---

## OG-4：项目级文件被自动读取，但没有 trust 门控

- **状态**： 未门控；这是本轮复核里**新发现**的，不在 v1.6.0 的改动范围内。
- **证据**：
  - 全仓检索 `isProjectTrusted`：`src/` **零命中**。扩展从未查询过项目信任状态。
  - `src/index.ts`（命令处理入口）与 `src/local-identity.ts:164-186` — `resolveLocalProjectIdentity(ctx.cwd)` 在运行时构造（`createRuntime`）中被调用，会**自动**向上遍历祖先目录读取 `<root>/.pi/xpi-memo/project.json`，不需要用户显式发起。
  - `src/local-identity.ts:134-158` — `readIdentityFile` 直接采用文件里的 `id` 与 `root` 字段，**不重算** `localProjectIdFor(root)`（`:40-43` 定义了该算法），也不校验 `root` 是否等于文件所在目录。
  - 对照：Pi 自己的门控判据是 `hasTrustRequiringProjectResources(cwd)`（“cwd/.pi 下需要信任的条目”，`dist/core/trust-manager.d.ts`），即 `.pi/` 下的内容本来就是“需要信任才生效”的资源。
- **影响**：
  - 一个 **untrusted** 仓库可以在自带文件里声明任意 `id`，从而把 xpi-memo 的记忆读写指向另一个项目的 bank（即“记忆污染 / 跨项目串库”）。同一份文件里伪造 `label` 也会直接进入展示层。
  - 严重度：中。触发前提是用户 clone 并打开了一个不受信任的仓库；**不会**导致任意代码执行，也**不会**绕过 `XPI_MEMO_PAUSED`。
  - 与 `~/.pi/agent/AGENTS.md` 第 5 条（“项目级配置（`<cwd>/.pi/*.json`）仅在项目被信任时生效”）的表述不一致。
- **建议方案**：
  - **最小修法** — 读取 `.pi/xpi-memo/project.json` 时校验 `id === localProjectIdFor(root)` 且 `root` 与文件所在目录一致；不一致就当文件不存在（失败方向是“没有项目身份”，不是“采用伪造身份”）。这条与 trust 无关，单独就能挡住串库。
  - **完整修法** — 在最小修法之上，把项目级读取接到 `ctx.isProjectTrusted()`：未信任时降级为“（没有项目身份）”并给出可见提示。属于更大的运行时改动（需要把 trust 结论传进运行时构造，`loadConfig`/`createRuntime` 签名受影响）。
  - 是否要为**所有**项目级读取加门控（`.pi/memory/*.md` 的导入走的是显式命令 `/xpi-memo-export --repo --reimport`，由用户发起，优先级低于 `project.json` 的自动读取）。
- **建议采纳**： 先做**最小修法**（自证式校验），它是纵深防御、没有 trust 接线的成本；完整修法等 OG-1 决定要不要引入项目配置层时一并处理——两者都要 `ctx.isProjectTrusted()`，接线只做一次。
- **何时该做**： 建议**独立于** OG-1 尽快做，因为它是边界问题（输入校验），不是能力问题；即便 OG-1 最终选了方案 B（不引入项目文件），`project.json` 的这个洞依然在。

---

## 汇总

| 编号 | 问题 | 性质 | 对外行为是否符合 spec | 建议 |
| --- | --- | --- | --- | --- |
| OG-1 | 项目级 `auto_verify_kinds` 无实现 | 能力缺失 | **不符**（静默失效） | 方案 A（项目 `config.json` + trust） |
| OG-2 | `accumulate` 为占位 | 能力缺失 + 措辞超前 | **不符**（行为等价待审） | 方案 A（reword spec） |
| OG-3 | 两个 audit 事件名不存在 | 措辞漂移 | 语义符合、名字不符 | 方案 A（把 spec 对齐代码） |
| OG-4 | 项目文件读取未经 trust 门控 | 边界/输入校验 | spec 未覆盖 | 最小修法（自证式校验） |

OG-1 / OG-2 / OG-3 落在同一份 `kind-routing/spec.md`，适合**同一个 spec 修订**收掉；
OG-4 建议单独一条，先做最小修法。

要落地其中任何一条：OG-1 / OG-2 需要开 OpenSpec change（改行为 + 同步 delta spec）；
OG-3 是纯措辞修订，可与前者合并，也可单独一次。
