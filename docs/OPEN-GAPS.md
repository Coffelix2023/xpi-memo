# OPEN-GAPS — 未闭合问题登记册

本文件记录**已确认、但当前没有实现或没有闭合**的问题，以及处理建议。
写入这里**不代表**它已进入交付范围，也不代表任何一方承诺实现；

- 判断“现在到底是怎么跑的”，看 `openspec/specs/`（行为契约）与代码，不看本文件的建议。
- 本文件的建议是**候选方案**，不是决定。任何一条要落地时，走正常流程（需要改行为就开 OpenSpec change，并同步 delta spec）。
- 与 `docs/UPSTREAM-FOLLOWUPS.md` 的分工：那份写“对上游 Mnemosyne 的请求”，这份写“本仓库自己未闭合的问题”。

**发现于**：2026-09-17，v1.6.0 发布前的复核（typecheck / lint / test 全绿之后，人工核对 spec 与 `src/` 的一致性）。
**OG-5 ~ OG-8 追加于**：2026-09-17 晚，针对 `2026-09-17-candidate-admission-autopilot` 的**目标达成度复核**（回答「这个 change 的计划目标实现了吗」）。OG-1 ~ OG-4 是 spec 与代码不一致；OG-5 ~ OG-8 是**代码与它自己的计划（proposal/design）不一致**，加上一次真实语料实测。

字段约定：每条给出 `状态` / `证据` / `影响` / `建议方案` / `建议采纳` / `何时该做`。
`证据` 一律给文件与行号，便于复核；行号基于 v1.6.0（`cc00b8f`），后续可能漂移。

---

## OG-1：spec 声称项目级 `auto_verify_kinds` 覆盖，代码里不存在

- **状态**： 未实现，且当前**没有任何项目级配置层**。
- **2026-09-17 处理结果**（`harden-local-identity-and-align-admission-spec`）： 已纠正规范——主 spec 不再承诺 `.pi/xpi-memo.yaml` / `auto_verify_kinds`（改为明确 MUST NOT 读取）；能力本身仍未实现，未来引入项目级配置须开新 change。
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
- **2026-09-17 处理结果**（`harden-local-identity-and-align-admission-spec`）： 已纠正规范——主 spec 将 `accumulate` 标为保留策略（交付前 MUST 进待审、不得声称已累积或自动存储）；累积能力仍未实现，见 `stabilize-candidate-auto-admission` 的 rollout 边界。
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
- **2026-09-17 处理结果**（`harden-local-identity-and-align-admission-spec`）： 已将规范对齐实际 audit 事件——主 spec 现要求 `tool-verification-failed` + 有界 `reason`，并移除不存在的 `accumulation-timeout` 契约。
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
- **2026-09-17 处理结果**（`harden-local-identity-and-align-admission-spec`）： 已修复——`resolveLocalProjectIdentity` 接收显式 trust 结论（未信任不读元数据），且每个元数据文件必须自证（`root` 等于文件所在目录、`id` 等于该目录派生值，伪造 `label` 不被采用）；最小修法与完整修法一并落地。
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

## OG-5：`xpi_memo_remember` 工具路径未接入自动验证

- **状态**： 未实现。自动验证只挂在离线提取这一条路径上。
- **证据**：
  - spec 要求的是**进入确认流程前**自动验证，不限于离线提取：`openspec/specs/t1-governance/spec.md` 的「Three-way candidate confirmation」需求原文含「可工具验证的候选 SHALL 在进入确认流程前自动验证,验证通过则直接存储,绕过人工确认」。
  - 全仓检索 `autoConfirm`：生产调用点只有**一处** —— `src/offline-extraction.ts:625`（`governOfflineExtractionOutput` → `addCandidate`）。`src/index.ts` 的 `xpi_memo_remember` 工具在 `src/index.ts:995` 只做 `runtime.candidates.add(candidate, operation)`，之后没有任何验证调用。
  - 该路径的证据类型是 `verified-tool-result`（`src/index.ts:786-795`），不是 `l0-conclusion`。
  - **顺带发现的硬约束**：`src/evidence-upgrade.ts:31-33` 对不在白名单里的证据类型**抛错**，而 `src/candidate-lifecycle.ts:323` 调用它时没有 try/catch，异常会一路冒到 `governOfflineExtractionOutput` 的调用者。离线提取恒产 `l0-conclusion` 所以现在不会触发；但若按「方案 A」直接把 `autoConfirm` 接进 remember 路径，第一次记住 `project_gene` 就会抛 `Evidence upgrade not allowed: verified-tool-result`。
- **影响**：
  - 用户/模型通过工具主动写入的 gene/constraint 候选仍然 100% 进待审队列；spec 描述的自动准入只对离线提取成立。
  - 这条路径恰恰是用户能直接感知的那条（手动 remember 立刻能看到结果），所以「自动准入」对使用者而言基本不可见。
- **建议方案**：
  - **方案 A（先扩白名单，再接路径）** — 在 `EVIDENCE_UPGRADE_WHITELIST` 增加 `verified-tool-result` → `verified-repository-fact`（语义上 `verified-tool-result` 是模型声明、`verified-repository-fact` 是工具复核过，属于**升格**而非降级），然后在 `src/index.ts:995` 后调用 `autoConfirm`，并把返回值并入已有的候选结果分支。
  - **方案 B（只接路径，不改白名单）** — 在 `autoConfirm` 里捕获 `upgradeEvidence` 的异常并转为 `status: "skipped"`。一行 try/catch，但等于承认 remember 路径永远验证不通过。
  - **方案 C（改 spec）** — 把 spec 的措辞收窄为「离线提取产出的候选在入队前自动验证」，承认 remember 路径不参与。
- **建议采纳**： **方案 A**。方案 B 会让新接的路径静默失效（正是 OG-8 已经出现的问题），方案 C 则放弃最有价值的那条入口。
- **何时该做**： 与 OG-6 一起做（同一个调用点的两件事），需要开 OpenSpec change 并同步 delta spec。

---

## OG-6：`shouldAutoStore` 的 gene/constraint 分支在生产调用链上不可达

- **状态**： 代码存在、单测覆盖，但真实链路上永远走不到。
- **证据**：
  - 判据原文（`src/auto-store-policy.ts:28-34`）：`kind` 为 `project_gene`/`project_constraint` 时要求 `input.verified === true` **且**证据类型为 `verified-repository-fact` 或 `verified-tool-result`。
  - `shouldAutoStore` 全仓只有一个调用点：`src/pending-candidate.ts:55`（在 `generatePendingCandidate` 内）。
  - `generatePendingCandidate` 的四个生产调用点**全部**把 `verified` 钉死为 `false`：`src/index.ts:940`、`src/memory-activation.ts:262`、`src/offline-extraction.ts:601`、`src/repo-export.ts:470`。所以 `input.verified === true` 恒不成立。
  - 自动入库实际走的是另一条路：`autoConfirm` → `persistConfirmed`（`src/candidate-lifecycle.ts:228-238`）直接 `commit`/`adapter.store`，**完全绕过** `shouldAutoStore`。
- **影响**：
  - change 的 §6 与 design Decision 5（「在既有 `explicit-user-statement` 判据旁增加新分支」）落在真实流程里没有任何作用；它只被 `src/auto-store-policy.test.ts` 覆盖。
  - 读代码的人会以为「gene/constraint 的自动存储由 auto-store-policy 决定」，实际由 `kind-routing` 的 `getAdmissionPolicy` 决定。两套判据并存，容易在下次改动时改错一处。
  - 与 OG-5 同源：该分支显然是为「remember 路径带 `verified: true` 直存」准备的，而那条路没接。
- **建议方案**：
  - **方案 A（保留 + 注明不可达）** — 判据留着作为未来「已带验证结论的直存」入口，在 `src/auto-store-policy.ts` 注释里写明当前无调用点传 `verified: true`。
  - **方案 B（删除该分支）** — 删掉 `verified` 入参与分支，自动存储的唯一判据收敛到 `getAdmissionPolicy`。诚实、无死代码，但未来要直存时得再加回来。
  - **方案 C（与 OG-5 一起接线）** — 接线后 `verified` 有真实来源，分支自然可达。
- **建议采纳**： **方案 C**（随 OG-5 一起），若 OG-5 最终选方案 C（不接 remember 路径）则改选**方案 B**，不要留着不可达的分支继续误导。
- **何时该做**： 与 OG-5 同批。

---

## OG-7：design 声明的两条风险缓解措施没有实现

- **状态**： 未实现。design 写了两条缓解，代码只落了一半。
- **证据**：
  - design `openspec/changes/archive/2026-09-17-candidate-admission-autopilot/design.md` Risk 1 缓解原文：「验证器实现阶段增强上下文检查(排除注释行、test 目录)」；`src/tool-verification.ts:35-38` 只排除了 test 目录与 lockfile（`EXCLUDED_GLOBS`），**没有任何注释行判定** —— rg 命中行的内容被直接当作证据返回（`src/tool-verification.ts:114-121`）。
  - 同一条 Risk 1 缓解还有「首轮推出时,仅对 `project_gene` 启用自动验证,观察一段时间后再扩展到 `project_constraint`」；`VERIFIERS`（`src/tool-verification.ts:132-141`）在首轮就把 `project_constraint` 一起注册了。
- **影响**：
  - 一句注释里的字符串（例如 `// 不要这样做：rtk foo`、`<!-- 语义徽标必须校验 -->`）可以把候选判为 `verified` 并直接入库，正好是 design 想避免的假阳性方向。
  - 观察期约束被跳过，`project_constraint` 与 `project_gene` 承担同样的误报风险，而 design 的假设是前者可以先观察。
- **建议方案**：
  - **方案 A（补注释行判定 + 恢复观察期）** — 命中行做一次注释前缀启发式判定（`#`/`//`/`<!--`/`*` 开头的行降级为未验证），并把 `project_constraint` 从 `VERIFIERS` 暂时移除、文档注明。
  - **方案 B（只改 design/spec 措辞）** — 承认不排除注释行、不设观察期，把 design 里的两条缓解标记为「未采纳」。
  - **方案 C（放宽判据后一并解决）** — 若因 OG-8 决定重写验证策略，注释行判定在新策略里一起设计，不单独修。
- **建议采纳**： **方案 C** —— OG-8 说明当前判据在真实语料上通过率为 0，此时单独收紧/放宽都没有意义；验证策略本身要先有结论。
- **何时该做**： 与 OG-8 同一轮决定。

---

## OG-8：真实语料上验证器通过率为 0，「待审队列 82 → 约 30」不可达

- **状态**： 已实测。这是 proposal 的核心量化目标，当前数据不支持。
- **证据（本地实测，2026-09-17；只读，未写任何库）**：
  - 用**真实** `verifyProjectGene`（未注入验证器）回放 `~/.pi/agent/xpi-memo/candidates.json` 里全部 32 条 gene/constraint 候选：18 条能解析出项目根（`p-c606ac013f44` / `p-32d40dc8e7ac` / `p-dc63172e1425`）的全部 `FAILED(no-match)`；余 14 条项目根在本机不存在（`p-849721a69520`），改用本机 5 个仓库做 best-case 全扫描仍 **0 命中**。合计 **VERIFIED = 0 / 32**。
  - 生产审计 `~/.pi/agent/xpi-memo/audit.json`（200 条）中 `tool-verified` 与 `tool-verification-failed` **均为 0**。
  - 32 次 `extraction` 里只有 1 次（`2026-09-17T12:35:15Z`，即 +0800 20:35）晚于特性提交 `167af80`（2026-09-17 19:59 +0800）；那次 6 条提案全部是 `project_decision` / `project_gotcha`，没有 gene/constraint → 新路径上线后**从未被真实触发过**。
  - 待审队列：proposal 写「82 条」，实测当前 **95 条**（gene 26 + constraint 6 + decision 33 + gotcha 21 + workflow 5 + session 4），只增不减。其中 3 条 gene 产生于特性提交之前（`2026-09-17T04:58Z`），另 13 条产生于之后。
  - 根因：判据是「候选**最长一行**与仓库某行**逐字相同**」（`src/tool-verification.ts:48-55` 取最长行、`:96-124` 走 `rg -F` 固定串匹配），而候选内容是模型改写的自然语言（中英混合、常带全角标点）。`src/tool-verification.test.ts` 的「验证通过」场景是把候选内容原样写进临时仓库文件，属于对判据的构造性满足，不代表真实语料的通过率。
- **口径说明**：本测试的对象是**存量**候选，而 design 的 Non-Goals 明确声明存量不自动迁移；所以它不是「实现有 bug」的证据，而是「按同一判据处理新候选时通过率同样极低」的证据 —— 判据本身与语料形状不匹配。另外 dry-run 显式传入 `root`，生产调用传的是当时的 `process.cwd()`；离线提取在 session shutdown/compact 时运行，两者应等价，此处按等价处理。
- **影响**：
  - proposal 的副作用预测（「待审队列长度从 82 降至约 30」「全局记忆库从 5 条增至约 20-30 条」「用户交互从逐个审 82 条降为审约 30 条」）全部不成立。
  - 交付物本身是完整的（代码 + 48 项测试全绿 + 文档 + kill switch），但**对使用者的可观察收益目前为 0**。
  - 这一条不修的前提下，OG-5/OG-6/OG-7 任何一条单独落地都不会改变可观察行为。
- **建议方案**：
  - **方案 A（改口径，不动代码）** — 把 proposal 的量化副作用改写为「路径已打通；存量与新语料的通过率待观测」，spec 只承诺「验证通过则自动存储」这一条件行为，删掉对队列长度的预测。
  - **方案 B（重做验证判据，另开 change）** — 放宽为多信号判据：文件路径存在 + 关键词集合 + 短句片段，而不是整行逐字；超时与误报预算一并重新设计。风险更高，必须配误报率的度量。
  - **方案 C（承认对本语料无效，只留 kill switch）** — 默认 `XPI_MEMO_AUTO_VERIFY=false`，把它降级为可选实验特性；队列问题回到「如何降低人工审核成本」这个原始问题。
- **建议采纳**： **方案 A 立即做**（它只是把已发布文档里的预测改成事实，零代码风险），**方案 B/C 需要一个明确决定**：要不要继续投入在「自动验证」这条路上。在这个决定之前，OG-7 的注释行判定不值得单独修。
- **何时该做**： 方案 A 可随下次 spec 修订（与 OG-1/OG-2/OG-3 同一批）一起做；方案 B/C 需要先有结论。
---

## 汇总

| 编号 | 问题 | 性质 | 对外行为是否符合 spec | 建议 |
| --- | --- | --- | --- | --- |
| OG-1 | 项目级 `auto_verify_kinds` 无实现 | 能力缺失 | ~~不符~~ → **规范已纠正**（spec 不再承诺；能力仍未实现） | ~~方案 A~~ 已按方案 C（只改 spec）收口 |
| OG-2 | `accumulate` 为占位 | 能力缺失 + 措辞超前 | ~~不符~~ → **规范已纠正**（保留策略：待审） | ~~方案 A~~ 已落地（reword spec） |
| OG-3 | 两个 audit 事件名不存在 | 措辞漂移 | ~~名字不符~~ → **已对齐**（spec 记 `tool-verification-failed`） | ~~方案 A~~ 已落地 |
| OG-4 | 项目文件读取未经 trust 门控 | 边界/输入校验 | ~~spec 未覆盖~~ → **已修复**（trust 门控 + 自证校验） | 最小修法 + 完整修法一并落地 |
| OG-5 | remember 工具路径未接入自动验证 | 能力缺失 | **不符**（只对离线提取成立） | 扩白名单 + 接 `autoConfirm`（方案 A） |
| OG-6 | `shouldAutoStore` 的 gene 分支生产不可达 | 死代码 + 双判据并存 | spec 未覆盖 | 随 OG-5 接线（方案 C），否则删除（方案 B） |
| OG-7 | design 的两条风险缓解未实现 | 与自身 plan 不符 | spec 未覆盖 | 随 OG-8 决定验证策略（方案 C） |
| OG-8 | 真实语料验证通过率 0/32，队列 82→95 | **目标未达成**（量化预测失效） | spec 符合、proposal 预测不符 | 方案 A 立即改口径；B/C 待决定 |

OG-1 / OG-2 / OG-3 / OG-4 已由 `harden-local-identity-and-align-admission-spec` 处理(2026-09-17):
OG-1~OG-3 属同一个 spec 修订,已同步收口;OG-4 的 trust 门控 + 自证校验已实现并同步主规范。

要落地其中任何一条：OG-1 / OG-2 / OG-5 / OG-6 需要开 OpenSpec change（改行为 + 同步 delta spec）；
OG-3 是纯措辞修订，可与前者合并，也可单独一次。

OG-5 ~ OG-8 之间有顺序依赖：**OG-8 的方案 B/C 决定要在前**（验证策略到底留不留），OG-5 + OG-6 是一件事（接 remember 路径 + 让 `verified` 有真实来源），OG-7 的注释行判定只有在验证策略保留时才值得做。
OG-8 的方案 A（改口径）是纯文档修订，不依赖任何决定，可以立刻做。
