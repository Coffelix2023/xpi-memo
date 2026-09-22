import type { Language } from "./config.js";

/**
 * Panel copy: chrome, tab titles, group names, field labels, field notes,
 * detail lines, choice hints, and info-bar labels.
 *
 * Lives on its own so both surfaces read one dictionary. The Glimpse window and
 * the terminal panel MUST show the same labels for the same state, and a second
 * copy of these strings would be free to drift from this one.
 *
 * Injection and hint copy is deliberately NOT here: `index.ts` renders prose
 * rather than a grid, so it keeps its own dictionary.
 */
export type PanelLanguage = Language;

const PANEL_TEXT: Record<PanelLanguage, Record<string, string>> = {
  en: {
    "choice.admissionAllowGlobalPreference":
      "Recommend: on · off=keep preferences pending · on=auto-store them",
    "choice.admissionAllowGlobalWorkflow":
      "Recommend: on · off=keep workflows pending · on=auto-store them",
    "choice.admissionAllowProjectConstraint":
      "Recommend: on · off=keep constraints pending · on=auto-store them",
    "choice.admissionAllowProjectDecision":
      "Recommend: on · off=keep decisions pending · on=auto-store them",
    "choice.admissionAllowProjectGene":
      "Recommend: on · off=keep repo facts pending · on=auto-store them",
    "choice.admissionAllowProjectGotcha":
      "Recommend: on · off=keep gotchas pending · on=auto-store them",
    "choice.admissionAllowSessionContext":
      "Recommend: on · off=keep session context pending · on=auto-store it",
    "choice.admissionEvidenceFloor":
      "Recommend: session-conclusion · session-conclusion=ok · repository-fact=needs file",
    "choice.admissionMaxAgeDays":
      "Recommend: 30 · 7/30/90/365 days back a candidate may auto-enter",
    "choice.admissionMinConfidence":
      "Recommend: 0.7 · 0.5/0.7/0.9 minimum extraction confidence",
    "choice.admissionSourceScope":
      "Recommend: all · all=every project bank · current-project=this project only",
    "choice.archiveRetentionDays":
      "Recommend: 30 · 7/30/90/180 days an archived candidate stays recoverable",
    "choice.autoAdmit":
      "Recommend: on · off=keep verified genes pending · on=auto-store them",
    "choice.autoExport": "Recommend: on · off=no backup · on=periodic Markdown export",
    "choice.confirmStore":
      "Recommend: off · off=store silently · on=ask before every write",
    "choice.dataDir": "Read-only · change it in the config file or XPI_MEMO_DATA_DIR",
    "choice.decisionCalibrationEnabled":
      "Recommend: off · off=keep extracted confidence · on=ask for a calibrated one",
    "choice.decisionRepeatJudgmentEnabled":
      "Recommend: off · off=never propose from repeats · on=judge a repeated prompt",
    "choice.decisionRepeatThreshold":
      "Recommend: 3 · 3/5/10 repeats before one judgment",
    "choice.decisionRerankEnabled":
      "Recommend: off · off=keep coarse order · on=rerank a close head",
    "choice.decisionRerankGapThreshold":
      "Recommend: 0.05 · 0.02/0.05/0.1 head gap that opens the gate",
    "choice.decisionRunnerEnabled":
      "Recommend: off · off=no decision call at all · on=allow the boundary",
    "choice.decisionStabilityThreshold":
      "Recommend: 0.9 · 0.8/0.9/0.95 probability needed to propose",
    "choice.embeddingApiUrl":
      "Used by api mode only · empty keeps mnemosyne's own endpoint",
    "choice.embeddingMode":
      "Recommend: off · off=no embedding work · local=this machine · api=remote endpoint",
    "choice.embeddingModel":
      "Empty keeps mnemosyne's default (BAAI/bge-small-en-v1.5) · dim must match",
    "choice.eventPresentation":
      "Recommend: on · off=hide memory events · on=show them in the Pi footer",
    "choice.excludeToolResults":
      "Recommend: off · off=log tool output · on=keep it out of memory",
    "choice.globalLimit": "Recommend: 5 · 1/5/10/20 rows per turn across all projects",
    "choice.l0Enabled":
      "Recommend: on · off=drop this session · on=keep its trace for recall",
    "choice.language": "Recommend: yours · en=English panel · zh=中文面板",
    "choice.limit":
      "Recommend: 5 · 1/5/10/20 memory rows the Agent may inject per turn",
    "choice.mentalModelDefinitions":
      "Empty projects nothing · ids come from code, never from a conversation",
    "choice.mentalModelSynthesisEnabled":
      "Recommend: off · off=local freshness only · on=model refresh at session end",
    "choice.offlineExtractionEnabled":
      "Recommend: off · off=rules only · on=extract without a model",
    "choice.offlineExtractionModel":
      "session-model reuses the chat model, or name one explicitly",
    "choice.passiveFeedback":
      "Recommend: on · off=no usage signal · on=rank recall by what you used",
    "choice.paused": "Recommend: off · off=memory runs · on=stop all memory work",
    "choice.privacy": "Recommend: off · off=store memory · on=persist nothing at all",
    "choice.profileInjection":
      "Recommend: on · off=no profile · on=inject your preference profile",
    "choice.projectLimit": "Recommend: 5 · 1/5/10/20 rows per turn inside this project",
    "choice.recallPolicy":
      "Recommend: high-value-auto · active=ask · assist=useful · high-value-auto=auto-inject",
    "choice.retrievalMode":
      "Recommend: hybrid · fts5=keywords only · hybrid=adds semantic search",
    "choice.searchBackend":
      "Recommend: auto · auto=first · ripgrep=no setup · mnemosyne=semantic · qmd=local index",
    "choice.sleep": "On demand · off=idle · run=consolidate now, then confirm",
    "choice.sleepMode":
      "Recommend: disabled (off) · dedicated=own model · session-model=chat · mechanical=rules",
    "chrome.edit": "type to edit · Enter save · Esc cancel",
    "chrome.hint":
      "←/→ tab · ↑/↓ move · Space change · Enter save · Tab field · Esc close",
    "chrome.saved": "Saved · configuration written",
    "detail.admissionAllowGlobalPreference":
      "Auto-store preferences without asking · Space toggles on/off, Enter saves",
    "detail.admissionAllowGlobalWorkflow":
      "Auto-store workflows without asking · Space toggles on/off, Enter saves",
    "detail.admissionAllowProjectConstraint":
      "Auto-store constraints without asking · Space toggles on/off, Enter saves",
    "detail.admissionAllowProjectDecision":
      "Auto-store decisions without asking · Space toggles on/off, Enter saves",
    "detail.admissionAllowProjectGene":
      "Auto-store repo facts without asking · Space toggles on/off, Enter saves",
    "detail.admissionAllowProjectGotcha":
      "Auto-store gotchas without asking · Space toggles on/off, Enter saves",
    "detail.admissionAllowSessionContext":
      "Auto-store session context without asking · Space toggles on/off, Enter saves",
    "detail.admissionEvidenceFloor":
      "How strong the evidence must be · Space cycles the value, Enter saves",
    "detail.admissionMaxAgeDays":
      "How far back a candidate may auto-enter · Space cycles, Enter saves",
    "detail.admissionMinConfidence":
      "Lowest extraction confidence allowed · Space cycles, Enter saves",
    "detail.admissionSourceScope":
      "Which banks may auto-admit · Space cycles the scope, Enter saves",
    "detail.archiveRetentionDays":
      "Recoverable window before an archived candidate expires · Space cycles, Enter saves",
    "detail.autoAdmit":
      "Store a verified project_gene without asking · Space toggles on/off, Enter saves",
    "detail.autoExport":
      "Periodic Markdown backup of the bank · human-only · Space toggles on/off, Enter saves",
    "detail.confirmStore":
      "Ask you before the Agent stores a memory · Space toggles on/off, Enter saves",
    "detail.dataDir":
      "Where memories live on disk · human-only · read-only, edit the config file",
    "detail.decisionCalibrationEnabled":
      "Rewrite a candidate's confidence from a decision call · Space toggles",
    "detail.decisionRepeatJudgmentEnabled":
      "Count repeats locally, then ask once if they are a stable preference",
    "detail.decisionRepeatThreshold":
      "Same-meaning repeats before the judge is asked · Space cycles, Enter saves",
    "detail.decisionRerankEnabled":
      "Rerank a close recall head through the decision boundary · Space toggles",
    "detail.decisionRerankGapThreshold":
      "Head score gap at or below this opens the rerank gate · Space cycles, Enter saves",
    "detail.decisionRunnerEnabled":
      "Master switch for the optional decision boundary · off issues no call",
    "detail.decisionStabilityThreshold":
      "Judged probability needed to propose a candidate · Space cycles, Enter saves",
    "detail.embeddingApiUrl":
      "Endpoint for api mode · Space edits it inline, Esc cancels",
    "detail.embeddingMode":
      "Vector search for recall · Space cycles off/local/api, Enter saves",
    "detail.embeddingModel": "Embedding model id · Space edits it inline, Esc cancels",
    "detail.eventPresentation":
      "Memory events in the Pi footer · human-only · Space toggles on/off, Enter saves",
    "detail.excludeToolResults":
      "Keep tool output out of the Agent's memory · Space toggles on/off, Enter saves",
    "detail.globalLimit":
      "Agent cap across all projects · Space cycles 1/5/10/20, Enter saves",
    "detail.l0Enabled":
      "Keep this session's trace for Agent recall · Space toggles on/off, Enter saves",
    "detail.language":
      "Language of this panel · human-only · Space switches en/zh, Enter saves",
    "detail.limit":
      "Rows the Agent may inject per turn · Space cycles 1/5/10/20, Enter saves",
    "detail.mentalModelDefinitions":
      "Which built-in standing questions may project · Space edits the list inline",
    "detail.mentalModelSynthesisEnabled":
      "Refresh stale projections with a model · off keeps checks local · Space toggles",
    "detail.offlineExtractionEnabled":
      "Extract memories without a model · affects Agent recall · Space toggles, Enter saves",
    "detail.offlineExtractionModel":
      "Model for offline extraction · human-only · Space edits it inline, Esc cancels",
    "detail.passiveFeedback":
      "Ranking signal for the Agent's recall · Space toggles on/off, Enter saves",
    "detail.paused":
      "Stop all memory work for the Agent · Space toggles on/off, Enter saves",
    "detail.privacy":
      "Persist nothing · the Agent reads no memory · Space toggles on/off, Enter saves",
    "detail.profileInjection":
      "Inject your preference profile into the Agent's context · Space toggles, Enter saves",
    "detail.projectLimit":
      "Agent cap inside this project · Space cycles 1/5/10/20, Enter saves",
    "detail.recallPolicy":
      "When the Agent recalls memory on its own · Space cycles, Enter saves",
    "detail.retrievalMode":
      "How the Agent searches memory · Space cycles fts5/hybrid, Enter saves",
    "detail.searchBackend":
      "Engine that runs the Agent's recall · Space cycles, Enter saves",
    "detail.sleep":
      "One consolidation you trigger now · human-only · Space, then confirm",
    "detail.sleepMode":
      "When the Agent consolidates memory · Space cycles, Enter saves",
    "field.admissionAllowGlobalPreference": "Auto admit: preferences",
    "field.admissionAllowGlobalWorkflow": "Auto admit: workflows",
    "field.admissionAllowProjectConstraint": "Auto admit: constraints",
    "field.admissionAllowProjectDecision": "Auto admit: decisions",
    "field.admissionAllowProjectGene": "Auto admit: repo facts",
    "field.admissionAllowProjectGotcha": "Auto admit: gotchas",
    "field.admissionAllowSessionContext": "Auto admit: session context",
    "field.admissionEvidenceFloor": "Evidence floor",
    "field.admissionMaxAgeDays": "Max candidate age",
    "field.admissionMinConfidence": "Min confidence",
    "field.admissionSourceScope": "Source scope",
    "field.archiveRetentionDays": "Archive retention",
    "field.autoAdmit": "Auto admit",
    "field.autoExport": "Auto export",
    "field.confirmStore": "Confirm store",
    "field.dataDir": "Data dir",
    "field.decisionCalibrationEnabled": "Decision: calibration",
    "field.decisionRepeatJudgmentEnabled": "Decision: repeat judgment",
    "field.decisionRepeatThreshold": "Decision: repeat threshold",
    "field.decisionRerankEnabled": "Decision: rerank",
    "field.decisionRerankGapThreshold": "Decision: rerank gap",
    "field.decisionRunnerEnabled": "Decision runner",
    "field.decisionStabilityThreshold": "Decision: stability bar",
    "field.embeddingApiUrl": "Embedding API URL",
    "field.embeddingMode": "Embedding mode",
    "field.embeddingModel": "Embedding model",
    "field.eventPresentation": "Event presentation",
    "field.excludeToolResults": "Tool results",
    "field.globalLimit": "Global limit",
    "field.l0Enabled": "Session trace",
    "field.language": "Language",
    "field.limit": "Recall limit",
    "field.mentalModelDefinitions": "Mental-model definitions",
    "field.mentalModelSynthesisEnabled": "Mental-model synthesis",
    "field.offlineExtractionEnabled": "Offline extraction",
    "field.offlineExtractionModel": "Offline model",
    "field.passiveFeedback": "Passive feedback",
    "field.paused": "Pause memory",
    "field.privacy": "Privacy mode",
    "field.profileInjection": "Preference profile",
    "field.projectLimit": "Project limit",
    "field.recallPolicy": "Recall policy",
    "field.retrievalMode": "Retrieval mode",
    "field.searchBackend": "Search backend",
    "field.sleep": "Run sleep now",
    "field.sleepMode": "Sleep mode",
    "group.admission": "Admission",
    "group.decision": "Decision",
    "group.display": "Display",
    "group.mentalModels": "Mental models",
    "group.pipeline": "Pipeline",
    "group.privacy": "Privacy",
    "group.retrieval": "Retrieval",
    "group.storage": "Storage",
    "info.bank": "bank",
    "info.disk": "disk",
    // 字面配置值, 不是文案: 两种语言同形。窗口字典有同名键，值一致。
    "info.off": "off",
    "info.on": "on",
    "info.pause": "pause",
    "info.pending": "pending",
    "info.tier": "L0 session trace → T1 xpi-memo → T2 deferred → T3 deferred",
    "info.today": "today",
    "info.total": "total",
    "kind.global_preference": "Preference",
    "kind.global_workflow": "Workflow",
    "kind.project_constraint": "Constraint",
    "kind.project_decision": "Decision",
    "kind.project_gene": "Repository fact",
    "kind.project_gotcha": "Gotcha",
    "kind.session_context": "Session context",
    "note.admissionAllowGlobalPreference": "Skip the review queue",
    "note.admissionAllowGlobalWorkflow": "Skip the review queue",
    "note.admissionAllowProjectConstraint": "Skip the review queue",
    "note.admissionAllowProjectDecision": "Skip the review queue",
    "note.admissionAllowProjectGene": "Skip the review queue",
    "note.admissionAllowProjectGotcha": "Skip the review queue",
    "note.admissionAllowSessionContext": "Skip the review queue",
    "note.admissionEvidenceFloor": "Session facts or repo facts",
    "note.admissionMaxAgeDays": "Older candidates stall",
    "note.admissionMinConfidence": "Extraction confidence floor",
    "note.admissionSourceScope": "Every bank or one project",
    "note.archiveRetentionDays": "Recoverable before deletion",
    "note.autoAdmit": "Auto-store verified genes",
    "note.autoExport": "Periodic export backup",
    "note.confirmStore": "Ask before writing",
    "note.dataDir": "Read-only, edit config file",
    "note.decisionCalibrationEnabled": "Needs the runner on",
    "note.decisionRepeatJudgmentEnabled": "Counting is free; judging is not",
    "note.decisionRepeatThreshold": "Deterministic, no model",
    "note.decisionRerankEnabled": "Only a close head is judged",
    "note.decisionRerankGapThreshold": "Smaller asks more often",
    "note.decisionRunnerEnabled": "Off = no network call",
    "note.decisionStabilityThreshold": "Lower proposes more",
    "note.embeddingApiUrl": "api mode only",
    "note.embeddingMode": "Off saves 73% CPU",
    "note.embeddingModel": "Empty = mnemosyne default",
    "note.eventPresentation": "Show events in footer",
    "note.excludeToolResults": "Do not log tool output",
    "note.globalLimit": "Cap across projects",
    "note.l0Enabled": "Keep this session's trace",
    "note.language": "Panel and hint language",
    "note.limit": "Rows injected per turn",
    "note.mentalModelDefinitions": "Built-in ids, comma-separated",
    "note.mentalModelSynthesisEnabled": "Needs a model at session end",
    "note.offlineExtractionEnabled": "Works without a model",
    "note.offlineExtractionModel": "session-model or provider/model",
    "note.passiveFeedback": "Record usage feedback",
    "note.paused": "Resume any time",
    "note.privacy": "Persist no memory at all",
    "note.profileInjection": "Inject preference profile",
    "note.projectLimit": "Cap inside this project",
    "note.recallPolicy": "Auto-inject by value",
    "note.retrievalMode": "Hybrid adds semantics",
    "note.searchBackend": "Pick first available",
    "note.sleep": "Run one consolidation",
    "note.sleepMode": "When and how to tidy",
    "rationale.offlineExtraction":
      "Proposed by offline extraction; requires T1 write governance.",
    "rationale.repoImport":
      "Imported from repository Markdown; requires T1 write governance.",
    "rationale.t1Governance":
      "This memory requires T1 write governance before persistence.",
    "rationale.userStated": "The user stated this as a durable preference.",
    "tab.pending": "Pending",
    "tab.recent": "Recent",
    "tab.settings": "Settings",
    "tab.status": "Status",
    "tab.triggers": "Triggers",
  },
  zh: {
    "choice.admissionAllowGlobalPreference":
      "推荐: on · off=偏好进待审 · on=偏好自动入库",
    "choice.admissionAllowGlobalWorkflow":
      "推荐: on · off=流程进待审 · on=流程自动入库",
    "choice.admissionAllowProjectConstraint":
      "推荐: on · off=约束进待审 · on=约束自动入库",
    "choice.admissionAllowProjectDecision":
      "推荐: on · off=决策进待审 · on=决策自动入库",
    "choice.admissionAllowProjectGene": "推荐: on · off=仓库事实进待审 · on=直接入库",
    "choice.admissionAllowProjectGotcha": "推荐: on · off=项目坑进待审 · on=坑自动入库",
    "choice.admissionAllowSessionContext":
      "推荐: on · off=会话上下文进待审 · on=直接入库",
    "choice.admissionEvidenceFloor":
      "推荐: session-conclusion · session-conclusion=会话结论即可 · repository-fact=要有文件出处",
    "choice.admissionMaxAgeDays": "推荐: 30 · 7/30/90/365 天内的候选才会自动入库",
    "choice.admissionMinConfidence": "推荐: 0.7 · 0.5/0.7/0.9 最低提取置信度",
    "choice.admissionSourceScope":
      "推荐: all · all=所有项目库 · current-project=仅当前项目",
    "choice.archiveRetentionDays": "推荐: 30 · 7/30/90/180 天归档期, 期内可恢复",
    "choice.autoAdmit": "推荐: on · off=一律进待审 · on=验证通过的基因自动入库",
    "choice.autoExport": "推荐: on · off=不备份 · on=定期导出 Markdown",
    "choice.confirmStore": "推荐: off · off=直接写入 · on=每次写入前问你",
    "choice.dataDir": "只读 · 改配置文件或 XPI_MEMO_DATA_DIR",
    "choice.decisionCalibrationEnabled":
      "推荐: off · off=保留原置信度 · on=询问校准后的置信度",
    "choice.decisionRepeatJudgmentEnabled":
      "推荐: off · off=重复不产生候选 · on=对重复提问判定一次",
    "choice.decisionRepeatThreshold": "推荐: 3 · 3/5/10 次重复后才判定一次",
    "choice.decisionRerankEnabled":
      "推荐: off · off=保留粗排顺序 · on=对接近的头部精排",
    "choice.decisionRerankGapThreshold": "推荐: 0.05 · 0.02/0.05/0.1 的分差才打开门控",
    "choice.decisionRunnerEnabled": "推荐: off · off=完全不发决策调用 · on=允许该出口",
    "choice.decisionStabilityThreshold": "推荐: 0.9 · 0.8/0.9/0.95 概率才提议候选",
    "choice.embeddingApiUrl": "仅 api 用于外部接口 · 留空沿用 mnemosyne 自己的",
    "choice.embeddingMode":
      "推荐: off · off=不做向量化 · local=本机模型 · api=外部接口",
    "choice.embeddingModel":
      "留空即用 mnemosyne 默认(BAAI/bge-small-en-v1.5) · 维度须匹配",
    "choice.eventPresentation": "推荐: on · off=不显示事件 · on=页脚显示记忆事件",
    "choice.excludeToolResults": "推荐: off · off=记录工具输出 · on=不写入记忆",
    "choice.globalLimit": "推荐: 5 · 1/5/10/20 是所有项目的每轮上限",
    "choice.l0Enabled": "推荐: on · off=不留轨迹 · on=保留本轮轨迹供召回",
    "choice.language": "推荐: 你的母语 · en=English · zh=中文",
    "choice.limit": "推荐: 5 · 1/5/10/20 是 Agent 每轮可注入的条数",
    "choice.mentalModelDefinitions": "留空则不投影 · id 由代码定义, 不能自造",
    "choice.mentalModelSynthesisEnabled":
      "推荐: off · off=只用本地新鲜度检测 · on=会话结束时用模型刷新",
    "choice.offlineExtractionEnabled": "推荐: off · off=只用规则 · on=无模型也能提取",
    "choice.offlineExtractionModel":
      "session-model 复用当前聊天模型, 也可写具体模型 id",
    "choice.passiveFeedback": "推荐: on · off=不记录 · on=按实际使用排序召回",
    "choice.paused": "推荐: off · off=记忆工作 · on=全部停止",
    "choice.privacy": "推荐: off · off=正常写入 · on=不落任何持久记忆",
    "choice.profileInjection": "推荐: on · off=不注入 · on=注入你的偏好画像",
    "choice.projectLimit": "推荐: 5 · 1/5/10/20 是本项目内的每轮上限",
    "choice.recallPolicy":
      "推荐: high-value-auto · active=先问你 · assist=有用才召回 · high-value-auto=自动注入",
    "choice.retrievalMode": "推荐: hybrid · fts5=纯关键词 · hybrid=加语义检索",
    "choice.searchBackend":
      "推荐: auto · auto=取首个可用 · ripgrep=零配置 · mnemosyne=语义 · qmd=本地索引",
    "choice.sleep": "按需 · off=不整理 · run=立即整理一次并确认",
    "choice.sleepMode":
      "推荐: disabled(关闭) · dedicated=独立模型 · session-model=聊天模型 · mechanical=机械",
    "chrome.edit": "直接输入 · Enter 保存 · Esc 取消",
    "chrome.hint":
      "←/→ 切页 · ↑/↓ 移动 · Space 切换 · Enter 保存/选择 · Tab 跳字段 · Esc 关闭",
    "chrome.saved": "已保存 · 配置已写入",
    "detail.admissionAllowGlobalPreference":
      "偏好候选无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionAllowGlobalWorkflow":
      "流程候选无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionAllowProjectConstraint":
      "约束候选无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionAllowProjectDecision":
      "决策候选无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionAllowProjectGene":
      "仓库事实候选无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionAllowProjectGotcha":
      "项目坑候选无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionAllowSessionContext":
      "会话上下文无需确认直接入库 · 空格切换 on/off, Enter 保存",
    "detail.admissionEvidenceFloor": "多强的证据才能自动入库 · 空格切换, Enter 保存",
    "detail.admissionMaxAgeDays": "多久以前的候选还能自动入库 · 空格切换, Enter 保存",
    "detail.admissionMinConfidence": "允许的最低提取置信度 · 空格切换, Enter 保存",
    "detail.admissionSourceScope": "哪些库可以自动准入 · 空格切换, Enter 保存",
    "detail.archiveRetentionDays": "归档候选到期前可恢复的天数 · 空格切换, Enter 保存",
    "detail.autoAdmit":
      "验证通过的 project_gene 无需确认直接入库 · 空格开关, Enter 保存",
    "detail.autoExport":
      "定期把记忆库导出成 Markdown 备份 · 只与你有关 · 空格切换 on/off, Enter 保存",
    "detail.confirmStore": "Agent 写记忆前先问你 · 空格切换 on/off, Enter 保存",
    "detail.dataDir": "记忆在磁盘上的位置 · 只读, 改配置文件或环境变量",
    "detail.decisionCalibrationEnabled":
      "用决策结果改写候选置信度 · 空格切换, Enter 保存",
    "detail.decisionRepeatJudgmentEnabled": "本地计数重复, 达阈值才问一次是否稳定偏好",
    "detail.decisionRepeatThreshold": "同义重复多少次才允许判定 · 空格切换, Enter 保存",
    "detail.decisionRerankEnabled":
      "对接近的召回头部精排 · 只改顺序不改成员 · 空格切换",
    "detail.decisionRerankGapThreshold":
      "分差不高于此值才开门控 · 空格切换, Enter 保存",
    "detail.decisionRunnerEnabled": "可选决策出口的总开关 · off 时零网络调用",
    "detail.decisionStabilityThreshold":
      "判定概率达到此值才生成待审候选 · 空格切换, Enter 保存",
    "detail.embeddingApiUrl": "api 模式的外部接口 · 空格进入行内编辑, Esc 取消",
    "detail.embeddingMode": "召回是否走向量检索 · 空格循环 off/local/api, Enter 保存",
    "detail.embeddingModel": "嵌入模型 id · 空格进入行内编辑, Esc 取消",
    "detail.eventPresentation":
      "在 Pi 页脚显示记忆事件 · 只与你有关 · 空格切换 on/off, Enter 保存",
    "detail.excludeToolResults": "不把工具输出写进记忆 · 空格切换 on/off, Enter 保存",
    "detail.globalLimit":
      "所有项目的总上限 · 限制 Agent 注入 · 空格切换 1/5/10/20, Enter 保存",
    "detail.l0Enabled": "保留本轮会话轨迹供以后召回 · 空格切换 on/off, Enter 保存",
    "detail.language": "面板与提示的语言 · 只与你有关 · 空格切换 en/zh, Enter 保存",
    "detail.limit": "Agent 每轮注入的条数 · 空格切换 1/5/10/20, Enter 保存",
    "detail.mentalModelDefinitions":
      "可投影的内置标准问题 · 空格行内编辑 id 列表, Esc 取消",
    "detail.mentalModelSynthesisEnabled":
      "用模型刷新过期投影 · off 只做本地检测 · 空格切换",
    "detail.offlineExtractionEnabled":
      "无模型时也能提取记忆 · 影响 Agent 召回 · 空格切换 on/off, Enter 保存",
    "detail.offlineExtractionModel": "离线提取用的模型 · 空格进入行内编辑, Esc 取消",
    "detail.passiveFeedback": "记录哪些召回记忆真被用到 · 空格切换 on/off, Enter 保存",
    "detail.paused": "全项目停用记忆 · Agent 不再读取 · 空格切换 on/off, Enter 保存",
    "detail.privacy": "开启后不写任何持久记忆 · 空格切换 on/off, Enter 保存",
    "detail.profileInjection":
      "把你的偏好画像注入 Agent 上下文 · 空格切换 on/off, Enter 保存",
    "detail.projectLimit":
      "本项目内的上限 · 限制 Agent 注入 · 空格切换 1/5/10/20, Enter 保存",
    "detail.recallPolicy": "Agent 何时自行召回记忆 · 空格切换策略, Enter 保存",
    "detail.retrievalMode": "Agent 检索记忆的方式 · 空格切换 fts5/hybrid, Enter 保存",
    "detail.searchBackend": "召回使用哪个搜索引擎 · 空格切换, Enter 保存",
    "detail.sleep": "由你触发的一次记忆整理 · 只与你有关 · 空格后确认, 不写配置",
    "detail.sleepMode": "Agent 何时整理记忆 · 空格切换整理方式, Enter 保存",
    "field.admissionAllowGlobalPreference": "自动准入: 偏好",
    "field.admissionAllowGlobalWorkflow": "自动准入: 流程",
    "field.admissionAllowProjectConstraint": "自动准入: 约束",
    "field.admissionAllowProjectDecision": "自动准入: 决策",
    "field.admissionAllowProjectGene": "自动准入: 仓库事实",
    "field.admissionAllowProjectGotcha": "自动准入: 项目坑",
    "field.admissionAllowSessionContext": "自动准入: 会话上下文",
    "field.admissionEvidenceFloor": "证据下限",
    "field.admissionMaxAgeDays": "候选时效",
    "field.admissionMinConfidence": "最低置信度",
    "field.admissionSourceScope": "来源范围",
    "field.archiveRetentionDays": "归档保留期",
    "field.autoAdmit": "基因自动准入",
    "field.autoExport": "自动导出",
    "field.confirmStore": "存储前确认",
    "field.dataDir": "数据目录",
    "field.decisionCalibrationEnabled": "决策: 置信度校准",
    "field.decisionRepeatJudgmentEnabled": "决策: 重复判定",
    "field.decisionRepeatThreshold": "决策: 重复阈值",
    "field.decisionRerankEnabled": "决策: 精排",
    "field.decisionRerankGapThreshold": "决策: 精排分差",
    "field.decisionRunnerEnabled": "决策出口",
    "field.decisionStabilityThreshold": "决策: 稳定性门槛",
    "field.embeddingApiUrl": "嵌入接口地址",
    "field.embeddingMode": "嵌入模式",
    "field.embeddingModel": "嵌入模型",
    "field.eventPresentation": "事件与页脚提示",
    "field.excludeToolResults": "排除工具输出",
    "field.globalLimit": "全局召回上限",
    "field.l0Enabled": "记录会话轨迹",
    "field.language": "界面语言",
    "field.limit": "单次召回条数",
    "field.mentalModelDefinitions": "心智模型定义",
    "field.mentalModelSynthesisEnabled": "心智模型合成",
    "field.offlineExtractionEnabled": "离线提取",
    "field.offlineExtractionModel": "离线提取模型",
    "field.passiveFeedback": "被动使用反馈",
    "field.paused": "暂停记忆",
    "field.privacy": "隐私模式",
    "field.profileInjection": "注入偏好画像",
    "field.projectLimit": "项目召回上限",
    "field.recallPolicy": "召回策略",
    "field.retrievalMode": "检索方式",
    "field.searchBackend": "搜索后端",
    "field.sleep": "立即整理一次",
    "field.sleepMode": "记忆整理方式",
    "group.admission": "自动准入",
    "group.decision": "决策接入",
    "group.display": "界面与反馈",
    "group.mentalModels": "心智模型",
    "group.pipeline": "记忆管道",
    "group.privacy": "隐私与维护",
    "group.retrieval": "召回与检索",
    "group.storage": "存储与提取",
    "info.bank": "库",
    "info.disk": "占用",
    "info.off": "off",
    "info.on": "on",
    "info.pause": "暂停",
    "info.pending": "待审",
    "info.tier": "L0 会话轨迹 → T1 xpi-memo → T2 延后 → T3 延后",
    "info.today": "今日",
    "info.total": "总数",
    // 7 类记忆的用户可见名称，与 README.zh-CN.md 的分类法一致
    "kind.global_preference": "偏好",
    "kind.global_workflow": "工作流",
    "kind.project_constraint": "约束",
    "kind.project_decision": "决策",
    "kind.project_gene": "仓库事实",
    "kind.project_gotcha": "坑点",
    "kind.session_context": "会话上下文",
    "note.admissionAllowGlobalPreference": "跳过待审队列",
    "note.admissionAllowGlobalWorkflow": "跳过待审队列",
    "note.admissionAllowProjectConstraint": "跳过待审队列",
    "note.admissionAllowProjectDecision": "跳过待审队列",
    "note.admissionAllowProjectGene": "跳过待审队列",
    "note.admissionAllowProjectGotcha": "跳过待审队列",
    "note.admissionAllowSessionContext": "跳过待审队列",
    "note.admissionEvidenceFloor": "会话结论或仓库事实",
    "note.admissionMaxAgeDays": "过老的候选不入库",
    "note.admissionMinConfidence": "提取置信度下限",
    "note.admissionSourceScope": "所有库或仅本项目",
    "note.archiveRetentionDays": "删除前可恢复",
    "note.autoAdmit": "验证通过直接入库",
    "note.autoExport": "定期导出备份",
    "note.confirmStore": "写入前先问你",
    "note.dataDir": "只读, 改它要编辑配置",
    "note.decisionCalibrationEnabled": "需要总开关打开",
    "note.decisionRepeatJudgmentEnabled": "计数免费, 判定收费",
    "note.decisionRepeatThreshold": "纯确定性, 不调模型",
    "note.decisionRerankEnabled": "只判接近的头部",
    "note.decisionRerankGapThreshold": "越小触发越频繁",
    "note.decisionRunnerEnabled": "off 即零网络调用",
    "note.decisionStabilityThreshold": "越低越容易提议",
    "note.embeddingApiUrl": "仅 api 用",
    "note.embeddingMode": "off 省 73% CPU",
    "note.embeddingModel": "留空即 mnemosyne 默认",
    "note.eventPresentation": "页脚展示记忆事件",
    "note.excludeToolResults": "不记录工具输出",
    "note.globalLimit": "跨项目的上限",
    "note.l0Enabled": "保留本轮会话轨迹",
    "note.language": "面板与提示语言",
    "note.limit": "每次注入的条数",
    "note.mentalModelDefinitions": "内置 id, 逗号分隔",
    "note.mentalModelSynthesisEnabled": "会话结束时需要模型",
    "note.offlineExtractionEnabled": "无模型也能提取",
    "note.offlineExtractionModel": "session-model 或 供应方/模型",
    "note.passiveFeedback": "记录使用反馈",
    "note.paused": "停用后可随时恢复",
    "note.privacy": "不写任何持久记忆",
    "note.profileInjection": "注入偏好画像",
    "note.projectLimit": "本项目内的上限",
    "note.recallPolicy": "按价值自动注入",
    "note.retrievalMode": "hybrid 兼顾语义",
    "note.searchBackend": "自动选可用后端",
    "note.sleep": "执行一次记忆整理",
    "note.sleepMode": "整理时机与方式",
    "rationale.offlineExtraction": "离线提取的建议 · 需经 T1 写入治理才能落库",
    "rationale.repoImport": "从仓库 Markdown 导入 · 需经 T1 写入治理才能落库",
    "rationale.t1Governance": "这条记忆需经 T1 写入治理才能落库",
    "rationale.userStated": "用户明确陈述为长期偏好",
    "tab.pending": "待审",
    "tab.recent": "最近",
    "tab.settings": "设置",
    "tab.status": "状态",
    "tab.triggers": "触发",
  },
};

/**
 * One panel string. Falls back selected language → `en` → the key itself, so a
 * missing entry renders readable text instead of an empty row.
 */
export function panelText(key: string, language: PanelLanguage): string {
  const selected: Record<string, string> | undefined = PANEL_TEXT[language];
  return selected?.[key] ?? PANEL_TEXT.en[key] ?? key;
}

/**
 * The user-facing name of one memory kind, in the panel's language.
 *
 * `kinds.ts` keeps the English taxonomy because its labels also land in exported
 * Markdown and in the stored records; this reads the same seven kinds through the
 * panel dictionary, so a Chinese panel never shows "Constraint". A kind the
 * dictionary does not know falls back to its own id — the id is what the queue
 * stores, so an unknown kind stays readable instead of rendering a `kind.*` key.
 */
export function kindLabel(kind: string, language: PanelLanguage): string {
  const key = `kind.${kind}`;
  return PANEL_TEXT[language]?.[key] ?? PANEL_TEXT.en[key] ?? kind;
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Replace `{name}` slots, leaving unknown slots visible instead of blank.
 *
 * Lives beside the dictionary because every composed panel line — the recall
 * summary, the evidence summary — is a dictionary template plus its slots.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (slot, name: string) => values[name] ?? slot,
  );
}
