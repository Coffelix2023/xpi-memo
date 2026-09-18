import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type KeybindingsManager,
  type SelectItem,
  SelectList,
  type SettingItem,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { l0Status } from "./cli/l0.js";
import type { XpiMemoConfig } from "./config.js";
import { describeMemoryKindOrNull } from "./kinds.js";
import type { PendingCandidate } from "./pending-candidate.js";
import { formatStatusJson, type MemoryStatus } from "./status.js";

export type ConsoleSettings = Partial<
  Pick<
    XpiMemoConfig,
    | "confirmStore"
    | "globalLimit"
    | "language"
    | "limit"
    | "paused"
    | "projectLimit"
    | "recallPolicy"
    | "retrievalMode"
    | "searchBackend"
  >
>;

export interface ConsoleActions {
  confirm(title: string, message: string): Promise<boolean>;
  reviewCandidate(candidate: PendingCandidate): Promise<void>;
  save(values: ConsoleSettings): void;
  sleep(): Promise<void>;
}

/**
 * Panel chrome is 8 rows: border top carrying the title, tab bar, two
 * field-detail rows, two info-bar rows, the key-hint footer, border bottom.
 * The body is whatever the height budget left, floored at 3 rows.
 */
export const PANEL_CHROME_ROWS = 8;
export const MIN_BODY_ROWS = 3;
/**
 * Documented height budget (`TUI-DESIGN.md`): a 24-row panel, never more than
 * 70% of the terminal, so a tall viewport no longer gets a full-height panel.
 */
export const PANEL_HEIGHT = 24;
/** Documented overlay width in columns; the overlay clamps it to the viewport. */
export const PANEL_WIDTH = 94;
export const PANEL_MAX_HEIGHT_SHARE = 0.7;
/** `TUI-DESIGN.md` Do's: the overlay must clear the input area by at least this. */
export const OVERLAY_MARGIN_BOTTOM = 4;

export function bodyRows(terminalRows: number): number {
  return Math.max(panelHeight(terminalRows) - PANEL_CHROME_ROWS, MIN_BODY_ROWS);
}

/** Panel height before the viewport clamp; always chrome plus the body floor. */
function panelHeight(terminalRows: number): number {
  return Math.max(
    Math.min(PANEL_HEIGHT, Math.floor(terminalRows * PANEL_MAX_HEIGHT_SHARE)),
    PANEL_CHROME_ROWS + MIN_BODY_ROWS,
  );
}

/**
 * Fixed panel geometry, computed once when the panel opens. A viewport of
 * `terminalRows` can never show more than `terminalRows`, so the height is the
 * smaller of the height budget and the viewport, with the body re-derived from
 * that height so the parts always add up.
 */
export function panelLayout(terminalRows: number): {
  body: number;
  height: number;
} {
  const height = Math.min(panelHeight(terminalRows), terminalRows);
  return {
    body: Math.max(height - PANEL_CHROME_ROWS, 0),
    height,
  };
}
/** Tab order is fixed: 0 Pending, 1 Recent, 2 Settings, 3 Status. Overview is the info bar. */
const TAB_TITLE_KEYS = [
  "tab.pending",
  "tab.recent",
  "tab.settings",
  "tab.status",
] as const;
export const TAB_COUNT = TAB_TITLE_KEYS.length;

/** Active tab name, in the configured language. */
export function tabTitle(model: ConsoleViewModel, tab: number): string {
  return panelText(TAB_TITLE_KEYS[tab] ?? "", model.language);
}

/** Tab titles, so a tab switch may keep the list cursor where it was. */
export const PENDING_TAB = 0;
export const RECENT_TAB = 1;
export const SETTINGS_TAB = 2;
export const STATUS_TAB = 3;

/** Tab step that stops at the first and last tab instead of wrapping around. */
export function nextTab(current: number, step: number): number {
  return Math.max(0, Math.min(current + step, TAB_COUNT - 1));
}

/** Index inside a list, wrapping at both ends. Empty lists stay at 0. */
export function moveRow(index: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}

/**
 * `SelectList` / `SettingsList` add a scroll-indicator row when the list is
 * longer than `maxVisible`, which would grow the fixed body. Reserving that row
 * only when the list really scrolls keeps the child inside the body region.
 */
export function listMaxVisible(count: number, rows: number): number {
  return count > rows ? Math.max(rows - 1, 1) : rows;
}

/** Hard guard on the body region: never more, never fewer than `rows`. */
export function fit(rows: string[], count: number): string[] {
  const sliced = rows.slice(0, count);
  while (sliced.length < count) sliced.push("");
  return sliced;
}

export interface ConsoleViewModel {
  env: NodeJS.ProcessEnv;
  /** Language the whole panel renders in; comes from the effective config. */
  language: PanelLanguage;
  pending: PendingCandidate[];
  rows: SettingItem[];
  status: MemoryStatus;
  /** Indented JSON shown on the Status tab (rendered status + L0 summary). */
  statusJson: string;
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = [
    "KB",
    "MB",
    "GB",
    "TB",
  ];
  let value = bytes;
  let index = -1;
  do {
    value /= 1024;
    index += 1;
  } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(1)} ${units[index]}`;
}

/**
 * Panel copy: chrome, tab titles, group names, field labels and field notes.
 * Only the panel reads it — injection and hint copy lives in `index.ts`, which
 * renders prose rather than a 78-column grid, so the two are deliberately
 * separate dictionaries (design D7).
 */
type PanelLanguage = XpiMemoConfig["language"];

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
    "choice.offlineExtractionEnabled":
      "Recommend: off · off=rules only · on=extract without a model",
    "choice.offlineExtractionModel":
      "Read-only · session-model reuses the chat model, or name one explicitly",
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
    "detail.offlineExtractionEnabled":
      "Extract memories without a model · affects Agent recall · Space toggles, Enter saves",
    "detail.offlineExtractionModel":
      "Model for offline extraction · human-only · read-only, edit the config file",
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
    "field.eventPresentation": "Event presentation",
    "field.excludeToolResults": "Tool results",
    "field.globalLimit": "Global limit",
    "field.l0Enabled": "Session trace",
    "field.language": "Language",
    "field.limit": "Recall limit",
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
    "group.display": "Display",
    "group.pipeline": "Pipeline",
    "group.privacy": "Privacy",
    "group.retrieval": "Retrieval",
    "group.storage": "Storage",
    "info.bank": "bank",
    "info.disk": "disk",
    "info.pause": "pause",
    "info.pending": "pending",
    "info.tier": "L0 session trace → T1 xpi-memo → T2 deferred → T3 deferred",
    "info.today": "today",
    "info.total": "total",
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
    "note.eventPresentation": "Show events in footer",
    "note.excludeToolResults": "Do not log tool output",
    "note.globalLimit": "Cap across projects",
    "note.l0Enabled": "Keep this session's trace",
    "note.language": "Panel and hint language",
    "note.limit": "Rows injected per turn",
    "note.offlineExtractionEnabled": "Works without a model",
    "note.offlineExtractionModel": "Read-only, edit the config file",
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
    "tab.pending": "Pending",
    "tab.recent": "Recent",
    "tab.settings": "Settings",
    "tab.status": "Status",
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
    "choice.eventPresentation": "推荐: on · off=不显示事件 · on=页脚显示记忆事件",
    "choice.excludeToolResults": "推荐: off · off=记录工具输出 · on=不写入记忆",
    "choice.globalLimit": "推荐: 5 · 1/5/10/20 是所有项目的每轮上限",
    "choice.l0Enabled": "推荐: on · off=不留轨迹 · on=保留本轮轨迹供召回",
    "choice.language": "推荐: 你的母语 · en=English · zh=中文",
    "choice.limit": "推荐: 5 · 1/5/10/20 是 Agent 每轮可注入的条数",
    "choice.offlineExtractionEnabled": "推荐: off · off=只用规则 · on=无模型也能提取",
    "choice.offlineExtractionModel":
      "只读 · session-model 复用当前聊天模型, 也可写具体模型 id",
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
    "detail.eventPresentation":
      "在 Pi 页脚显示记忆事件 · 只与你有关 · 空格切换 on/off, Enter 保存",
    "detail.excludeToolResults": "不把工具输出写进记忆 · 空格切换 on/off, Enter 保存",
    "detail.globalLimit":
      "所有项目的总上限 · 限制 Agent 注入 · 空格切换 1/5/10/20, Enter 保存",
    "detail.l0Enabled": "保留本轮会话轨迹供以后召回 · 空格切换 on/off, Enter 保存",
    "detail.language": "面板与提示的语言 · 只与你有关 · 空格切换 en/zh, Enter 保存",
    "detail.limit": "Agent 每轮注入的条数 · 空格切换 1/5/10/20, Enter 保存",
    "detail.offlineExtractionEnabled":
      "无模型时也能提取记忆 · 影响 Agent 召回 · 空格切换 on/off, Enter 保存",
    "detail.offlineExtractionModel": "离线提取用的模型 · 只读, 改配置文件或环境变量",
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
    "field.eventPresentation": "事件与页脚提示",
    "field.excludeToolResults": "排除工具输出",
    "field.globalLimit": "全局召回上限",
    "field.l0Enabled": "记录会话轨迹",
    "field.language": "界面语言",
    "field.limit": "单次召回条数",
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
    "group.display": "界面与反馈",
    "group.pipeline": "记忆管道",
    "group.privacy": "隐私与维护",
    "group.retrieval": "召回与检索",
    "group.storage": "存储与提取",
    "info.bank": "库",
    "info.disk": "占用",
    "info.pause": "暂停",
    "info.pending": "待审",
    "info.tier": "L0 会话轨迹 → T1 xpi-memo → T2 延后 → T3 延后",
    "info.today": "今日",
    "info.total": "总数",
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
    "note.eventPresentation": "页脚展示记忆事件",
    "note.excludeToolResults": "不记录工具输出",
    "note.globalLimit": "跨项目的上限",
    "note.l0Enabled": "保留本轮会话轨迹",
    "note.language": "面板与提示语言",
    "note.limit": "每次注入的条数",
    "note.offlineExtractionEnabled": "无模型也能提取",
    "note.offlineExtractionModel": "只读, 改它要编辑配置",
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
    "tab.pending": "待审",
    "tab.recent": "最近",
    "tab.settings": "设置",
    "tab.status": "状态",
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
 * Persistent two-row Overview info bar: fixed tier ownership, then bank,
 * totals, today, pending, and visible-bank disk usage. It reads the view-model
 * only, so it never runs recall.
 */
export function infoBarLines(model: ConsoleViewModel, width: number): string[] {
  const { status } = model;
  const text = (key: string) => panelText(key, model.language);
  const total = (status.counts.global ?? 0) + (status.counts.project ?? 0);
  const inner = Math.max(width - 4, 1);
  const segments = [
    `${text("info.bank")}: ${status.currentProject?.bank ?? "global-only"}`,
    `${text("info.total")}: ${total}`,
    `${text("info.today")}: ${status.todayStored}`,
    `${text("info.pending")}: ${status.pendingCandidates}`,
    `${text("info.disk")}: ${status.diskBytes === null ? "unknown" : humanBytes(status.diskBytes)}`,
    `${text("info.pause")}: ${status.paused ? "on" : "off"}`,
  ];
  return [
    truncateToWidth(text("info.tier"), inner, "…"),
    truncateToWidth(segments.join(" · "), inner, "…"),
  ];
}

/** Product title, rendered in the top border in both languages at once. */
export const PANEL_TITLE = "xpi-memo · pi 的 DNA 记忆体 / pi's DNA memory";

/**
 * Top border with `PANEL_TITLE` embedded: the documented TUI pattern, so the
 * title costs no body row. The fill is measured with `visibleWidth`, which
 * counts CJK glyphs as two columns, so the right corner stays in the same
 * column on every row.
 */
export function titleBorder(width: number, theme: Pick<Theme, "fg">): string {
  const inner = Math.max(width - 2, 1);
  const label = truncateToWidth(`─ ${PANEL_TITLE} `, inner, "…");
  const fill = "─".repeat(Math.max(inner - visibleWidth(label), 0));
  return theme.fg("borderAccent", `╭${label}${fill}╮`);
}
/** Tab bar: every tab label, so ←/→ has visible destinations. */
export function tabBarLines(
  model: ConsoleViewModel,
  tab: number,
  width: number,
  theme: Pick<Theme, "fg">,
): string[] {
  const inner = Math.max(width - 4, 1);
  const labels = TAB_TITLE_KEYS.map((_, index) => {
    const label =
      index === PENDING_TAB
        ? `${tabTitle(model, index)} ${model.pending.length}`
        : tabTitle(model, index);
    return index === tab ? theme.fg("accent", label) : theme.fg("muted", label);
  });
  return [
    truncateToWidth(labels.join(" · "), inner, "…"),
  ];
}

/** Pending rows for `SelectList`: kind and bank as the label, summary as description. */
export function pendingItems(pending: PendingCandidate[]): SelectItem[] {
  return pending.map((candidate) => ({
    description: candidate.content.slice(0, 80),
    label: `${describeMemoryKindOrNull(candidate.kind)?.label ?? candidate.kind} · ${candidate.targetBank}`,
    value: candidate.id,
  }));
}

/** Audit metadata only: action, kind, bank, status, timestamp. */
export function recentLines(status: MemoryStatus): string[] {
  return (status.recentEntries ?? []).map(
    (entry) =>
      `${entry.action} · ${describeMemoryKindOrNull(entry.kind)?.label ?? entry.kind ?? "-"} · ${entry.bank ?? "-"} · ${entry.status ?? "-"} · ${entry.timestamp}`,
  );
}

/** Split the Status-tab JSON into display lines. */
export function statusLines(json: string): string[] {
  return json.split("\n");
}
/** A config key the Settings tab can show, or the one-shot `sleep` action. */
export type SettingsFieldId = keyof XpiMemoConfig | "sleep";

export interface SettingsGroup {
  /** Field ids in this group, in display order. */
  fields: readonly SettingsFieldId[];
  /** Group id, and the `group.<id>` dictionary key for its name. */
  id: string;
}

/**
 * The Settings tab's groups, in display order. Every id in
 * `SETTINGS_FIELD_SPECS` appears in exactly one group; `console.test.ts`
 * pairs the two structures so a new field cannot be added without a group.
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: "retrieval",
    fields: [
      "recallPolicy",
      "retrievalMode",
      "searchBackend",
      "limit",
      "globalLimit",
      "projectLimit",
    ],
  },
  {
    id: "storage",
    fields: [
      "confirmStore",
      "autoExport",
      "offlineExtractionEnabled",
      "offlineExtractionModel",
      "excludeToolResults",
      "dataDir",
    ],
  },
  {
    id: "pipeline",
    fields: [
      "autoAdmit",
      "paused",
      "l0Enabled",
      "profileInjection",
    ],
  },
  {
    id: "admission",
    fields: [
      "admissionAllowGlobalPreference",
      "admissionAllowGlobalWorkflow",
      "admissionAllowProjectConstraint",
      "admissionAllowProjectDecision",
      "admissionAllowProjectGene",
      "admissionAllowProjectGotcha",
      "admissionAllowSessionContext",
      "admissionEvidenceFloor",
      "admissionMaxAgeDays",
      "admissionMinConfidence",
      "admissionSourceScope",
      "archiveRetentionDays",
    ],
  },
  {
    id: "display",
    fields: [
      "language",
      "eventPresentation",
      "passiveFeedback",
    ],
  },
  {
    id: "privacy",
    fields: [
      "privacy",
      "sleepMode",
      "sleep",
    ],
  },
];

interface SettingsFieldSpec {
  /**
   * Environment variable that pins this field, or `null` when nothing
   * governs it. Every name listed here is already read by `loadConfig` in
   * `config.ts`; this table only surfaces them in the panel.
   */
  environment: string | null;
  /** Empty for fields the panel never writes, such as the data directory. */
  values: readonly string[];
}

/**
 * Settings metadata keyed by field id. `Record` over the id union makes the
 * compiler refuse a partial table, so widening `XpiMemoConfig` cannot
 * silently leave a field out of the panel.
 */
const SETTINGS_FIELD_SPECS: Record<SettingsFieldId, SettingsFieldSpec> = {
  admissionAllowGlobalPreference: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_PREFERENCE",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowGlobalWorkflow: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_WORKFLOW",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectConstraint: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_CONSTRAINT",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectDecision: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_DECISION",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectGene: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GENE",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectGotcha: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GOTCHA",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowSessionContext: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_SESSION_CONTEXT",
    values: [
      "off",
      "on",
    ],
  },
  admissionEvidenceFloor: {
    environment: "XPI_MEMO_ADMISSION_EVIDENCE_FLOOR",
    values: [
      "repository-fact",
      "session-conclusion",
    ],
  },
  admissionMaxAgeDays: {
    environment: "XPI_MEMO_ADMISSION_MAX_AGE_DAYS",
    values: [
      "7",
      "30",
      "90",
      "365",
    ],
  },
  admissionMinConfidence: {
    environment: "XPI_MEMO_ADMISSION_MIN_CONFIDENCE",
    values: [
      "0.5",
      "0.7",
      "0.9",
    ],
  },
  admissionSourceScope: {
    environment: "XPI_MEMO_ADMISSION_SOURCE_SCOPE",
    values: [
      "all",
      "current-project",
    ],
  },
  archiveRetentionDays: {
    environment: "XPI_MEMO_ARCHIVE_RETENTION_DAYS",
    values: [
      "7",
      "30",
      "90",
      "180",
    ],
  },
  autoAdmit: {
    environment: "XPI_MEMO_AUTO_ADMIT",
    values: [
      "off",
      "on",
    ],
  },
  autoExport: {
    environment: "XPI_MEMO_AUTO_EXPORT",
    values: [
      "off",
      "on",
    ],
  },
  confirmStore: {
    environment: "XPI_MEMO_CONFIRM_STORE",
    values: [
      "off",
      "on",
    ],
  },
  dataDir: {
    environment: "XPI_MEMO_DATA_DIR",
    values: [],
  },
  eventPresentation: {
    environment: "XPI_MEMO_EVENT_PRESENTATION",
    values: [
      "off",
      "on",
    ],
  },
  excludeToolResults: {
    environment: "XPI_MEMO_EXCLUDE_TOOL_RESULTS",
    values: [
      "off",
      "on",
    ],
  },
  globalLimit: {
    environment: "XPI_MEMO_GLOBAL_LIMIT",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  l0Enabled: {
    environment: "XPI_MEMO_L0_ENABLED",
    values: [
      "off",
      "on",
    ],
  },
  language: {
    environment: "XPI_MEMO_LANGUAGE",
    values: [
      "en",
      "zh",
    ],
  },
  limit: {
    environment: "XPI_MEMO_LIMIT",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  offlineExtractionEnabled: {
    environment: "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
    values: [
      "off",
      "on",
    ],
  },
  // Read-only in the panel: a model id is free text, and the row shows the
  // configured one plus the hint to edit the config file or the environment.
  offlineExtractionModel: {
    environment: "XPI_MEMO_OFFLINE_EXTRACTION_MODEL",
    values: [],
  },
  passiveFeedback: {
    environment: "XPI_MEMO_PASSIVE_FEEDBACK",
    values: [
      "off",
      "on",
    ],
  },
  paused: {
    environment: "XPI_MEMO_PAUSED",
    values: [
      "off",
      "on",
    ],
  },
  privacy: {
    environment: "XPI_MEMO_PRIVACY",
    values: [
      "off",
      "on",
    ],
  },
  profileInjection: {
    environment: "XPI_MEMO_PROFILE_INJECTION",
    values: [
      "off",
      "on",
    ],
  },
  projectLimit: {
    environment: "XPI_MEMO_PROJECT_LIMIT",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  recallPolicy: {
    environment: "XPI_MEMO_RECALL_POLICY",
    values: [
      "active",
      "assist",
      "high-value-auto",
    ],
  },
  retrievalMode: {
    environment: "XPI_MEMO_RETRIEVAL_MODE",
    values: [
      "fts5",
      "hybrid",
    ],
  },
  searchBackend: {
    environment: "XPI_MEMO_SEARCH_BACKEND",
    values: [
      "auto",
      "mnemosyne",
      "ripgrep",
      "qmd",
    ],
  },
  sleep: {
    environment: null,
    values: [
      "off",
      "run",
    ],
  },
  sleepMode: {
    environment: "XPI_MEMO_SLEEP_MODE",
    values: [
      "disabled",
      "dedicated",
      "session-model",
      "mechanical",
    ],
  },
};

/**
 * Every settings row, in group order. A field pinned by an environment
 * variable or never written by the panel omits `values`, which makes Enter a
 * no-op on it, so the panel cannot persist a value it does not own.
 */
export function settingsItems(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): SettingItem[] {
  return SETTINGS_GROUPS.flatMap((group) =>
    group.fields.map((id) => settingsItem(id, config, env)),
  );
}

function settingsItem(
  id: SettingsFieldId,
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): SettingItem {
  const spec = SETTINGS_FIELD_SPECS[id];
  const environment = spec.environment;
  const locked = environment !== null && Boolean(env[environment]);
  const writable = !locked && spec.values.length > 0;
  return {
    currentValue: settingsValue(id, config),
    // A pinned field names its variable in the note slot; the label stays the
    // dictionary key so the row renders in the configured language.
    ...(environment !== null && locked
      ? {
          description: `⊘ ${environment}`,
        }
      : {}),
    id,
    label: id,
    ...(writable
      ? {
          values: [
            ...spec.values,
          ],
        }
      : {}),
  };
}

/** `on`/`off` for booleans, the bare string for everything else. */
function settingsValue(id: SettingsFieldId, config: XpiMemoConfig): string {
  if (id === "sleep") return "off";
  const value = config[id];
  if (typeof value !== "boolean") return String(value);
  return value ? "on" : "off";
}

/**
 * Panel value → persisted config value, typed by the field's own configured
 * value. A boolean switch must never reach `saveUserConfig` as `Number("on")`:
 * `NaN` serializes to `null`, which the next load rejects, so the setting looks
 * saved and silently reverts. Typing off the config also keeps a field added
 * later correct without touching this code.
 */
export function settingsSaveValue(
  id: string,
  value: string,
  config: XpiMemoConfig,
): ConsoleSettings {
  // `SettingsFieldId` is a subset of the config's keys, so this lookup is sound
  // for every id the panel can pass; the key is widened only for indexing.
  const current = config[id as keyof XpiMemoConfig];
  if (typeof current === "boolean")
    return {
      [id]: value === "on",
    } as ConsoleSettings;
  if (typeof current === "number")
    return {
      [id]: Number(value),
    } as ConsoleSettings;
  return {
    [id]: value,
  } as ConsoleSettings;
}
/** One row the Settings tab can show: a group header or a field. */
export type SettingsRow =
  | {
      /** Number of field rows this header opens. */
      count: number;
      group: SettingsGroup;
      kind: "group";
      /** Whether this group's field rows are currently visible. */
      open: boolean;
    }
  | {
      groupId: string;
      item: SettingItem;
      kind: "field";
    };

/**
 * The Settings tab's visible rows, in display order: every group header, then
 * the fields of every group that is not collapsed. The cursor indexes into
 * this sequence, so a group header is a real landing spot for up/down.
 */
export function settingsRows(
  items: readonly SettingItem[],
  collapsed: ReadonlySet<string>,
): SettingsRow[] {
  const byId = new Map(
    items.map((item) => [
      item.id,
      item,
    ]),
  );
  const rows: SettingsRow[] = [];
  for (const group of SETTINGS_GROUPS) {
    const fields = group.fields
      .map((id) => byId.get(id))
      .filter((item): item is SettingItem => item !== undefined);
    const open = !collapsed.has(group.id);
    rows.push({
      count: fields.length,
      group,
      kind: "group",
      open,
    });
    if (!open) continue;
    for (const item of fields) {
      rows.push({
        groupId: group.id,
        item,
        kind: "field",
      });
    }
  }
  return rows;
}

/**
 * Next window start for a cursor-driven list. Unlike `windowSlice`, which
 * centres one fixed row, this keeps the cursor inside the window and only
 * moves once the cursor would leave it, so the sequence decides where the
 * window sits rather than the other way round.
 */
export function cursorWindowStart(
  previous: number,
  cursor: number,
  total: number,
  rows: number,
): number {
  let start = previous;
  if (cursor < start) start = cursor;
  else if (cursor >= start + rows) start = cursor - rows + 1;
  return Math.max(0, Math.min(start, Math.max(total - rows, 0)));
}

/** Index of a group's header row. Falls back to the first row. */
export function groupHeaderIndex(
  rows: readonly SettingsRow[],
  groupId: string,
): number {
  const index = rows.findIndex(
    (row) => row.kind === "group" && row.group.id === groupId,
  );
  return index < 0 ? 0 : index;
}

/**
 * Clamp a cursor onto a row that exists. Collapsing a group can leave the
 * previous index past the end of the shortened sequence.
 */
export function clampCursor(cursor: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(cursor, total - 1));
}

/** Label column width at the documented 94-column basis. */
export const LABEL_COLUMN_WIDTH = 22;
/** Below this the note column is dropped entirely rather than showing `…`. */
export const MIN_NOTE_COLUMN_WIDTH = 8;
/** Fixed separator between the label and the note column. */
export const LABEL_NOTE_GAP = 2;
/** Fixed separator between the note and the value column. */
export const NOTE_VALUE_GAP = 1;

/** One Settings row as panel text, without the surrounding borders. */
export function settingsRowText(
  row: SettingsRow,
  selected: boolean,
  width: number,
  theme: Pick<Theme, "bold" | "fg">,
  language: PanelLanguage,
): string {
  if (row.kind === "group") {
    const text = `${row.open ? "▾" : "▸"} ${panelText(`group.${row.group.id}`, language)} (${row.count})`;
    return selected ? theme.fg("accent", text) : theme.bold(text);
  }
  // A pinned field carries its variable name as the description.
  const note = row.item.description ?? panelText(`note.${row.item.id}`, language);
  const value = row.item.currentValue;
  const budget = width;
  const valueWidth = visibleWidth(value);
  // Three columns at the documented 94-column basis: label 22, a 2-space
  // separator, the note flexible, a 1-space separator, then the right-aligned
  // value. Degradation order is note first, then the label; value always kept.
  let labelWidth = Math.min(LABEL_COLUMN_WIDTH, Math.max(budget - valueWidth - 2, 1));
  let noteWidth = budget - labelWidth - LABEL_NOTE_GAP - valueWidth - NOTE_VALUE_GAP;
  if (noteWidth < MIN_NOTE_COLUMN_WIDTH) {
    noteWidth = 0;
    labelWidth = Math.max(budget - valueWidth - NOTE_VALUE_GAP, 1);
  }
  const label = truncateToWidth(
    `  ${panelText(`field.${row.item.id}`, language)}`,
    labelWidth,
    "…",
  );
  const noteText = noteWidth === 0 ? "" : truncateToWidth(note, noteWidth, "…");
  // The separator is fixed, so only the trailing gap absorbs the slack left by
  // a truncated label or note.
  const noteSection = noteText === "" ? "" : `${padding(LABEL_NOTE_GAP)}${noteText}`;
  const gap = Math.max(
    budget - visibleWidth(label) - visibleWidth(noteSection) - valueWidth,
    NOTE_VALUE_GAP,
  );
  return selected
    ? theme.fg("accent", `${label}${noteSection}${padding(gap)}${value}`)
    : `${label}${theme.fg("dim", noteSection)}${padding(gap)}${theme.fg("muted", value)}`;
}

function padding(count: number): string {
  return " ".repeat(Math.max(count, 0));
}

/** Windowed audit lines for the Recent tab, always exactly `rows` long. */
export function recentWindow(
  status: MemoryStatus,
  row: number,
  rows: number,
): string[] {
  const lines = recentLines(status);
  return windowSlice(
    lines.length
      ? lines
      : [
          "No recent activity",
        ],
    row,
    rows,
  );
}

/** Windowed Status-tab JSON lines, always exactly `rows` long. */
export function statusWindow(json: string, row: number, rows: number): string[] {
  return windowSlice(statusLines(json), row, rows);
}
function windowSlice(lines: string[], row: number, rows: number): string[] {
  const count = lines.length;
  const safe = count === 0 ? 0 : Math.max(0, Math.min(row, count - 1));
  const start =
    count === 0
      ? 0
      : Math.max(
          0,
          Math.min(safe - Math.floor((rows - 1) / 2), Math.max(count - rows, 0)),
        );
  return fit(lines.slice(start, start + rows), rows);
}

export interface ConsoleComponentOptions {
  actions: ConsoleActions;
  config: XpiMemoConfig;
  done(): void;
  env: NodeJS.ProcessEnv;
  keybindings: Pick<KeybindingsManager, "matches">;
  pending: PendingCandidate[];
  status: MemoryStatus;
  statusJson: string;
  terminalRows: number;
  theme: Pick<Theme, "bold" | "fg">;
  tui: {
    requestRender(): void;
    terminal: {
      rows: number;
    };
  };
}

export function createConsoleComponent(options: ConsoleComponentOptions) {
  const { actions, done, keybindings, theme, tui } = options;
  const model: ConsoleViewModel = {
    env: options.env,
    language: options.config.language,
    pending: options.pending,
    rows: settingsItems(options.config, options.env),
    status: options.status,
    statusJson: options.statusJson,
  };
  // Height is fixed at open time; the render guard only ever shrinks it. The
  // open-time source is the real terminal, not the caller's snapshot, so a
  // component built on a stale snapshot still honours the 70% budget.
  let { body, height } = panelLayout(tui.terminal.rows);
  let tab = PENDING_TAB;
  let recentRow = 0;

  const pendingList = new SelectList(
    pendingItems(options.pending),
    listMaxVisible(model.pending.length, body),
    {
      description: (text: string) => theme.fg("muted", text),
      noMatch: (text: string) => theme.fg("warning", text),
      scrollInfo: (text: string) => theme.fg("dim", text),
      selectedPrefix: (text: string) => theme.fg("accent", text),
      selectedText: (text: string) => theme.fg("accent", text),
    },
  );
  pendingList.onSelect = (item) => {
    const candidate = model.pending.find(({ id }) => id === item.value);
    if (candidate) void actions.reviewCandidate(candidate).then(done);
  };

  // Settings state: which groups are folded, where the cursor sits, and the
  // window start that keeps the cursor visible. The cursor indexes into
  // `settingsRows(...)`, so a group header is a normal landing spot.
  const collapsed = new Set(SETTINGS_GROUPS.slice(1).map((group) => group.id));
  let cursor = 0;
  let settingsStart = 0;
  /** Set by the save action, cleared by the next keystroke that navigates. */
  let savedNotice = false;
  const recentText = new Text("", 0, 0);

  return {
    getBodyRows: () => body,
    getHeight: () => height,
    getRecentRow: () => recentRow,
    getSettingsCursor: () => cursor,
    getTab: () => tab,
    handleInput(data: string): void {
      // Any keystroke other than the one that saved clears the save notice.
      savedNotice = false;
      // The panel owns Escape and ←/→; the lists never see them.
      if (keybindings.matches(data, "tui.select.cancel") || data === "\u001b") {
        done();
        return;
      }
      if (keybindings.matches(data, "tui.editor.cursorLeft")) {
        tab = nextTab(tab, -1);
        tui.requestRender();
        return;
      }
      if (keybindings.matches(data, "tui.editor.cursorRight")) {
        tab = nextTab(tab, 1);
        tui.requestRender();
        return;
      }
      // Tab walks Settings fields and is inert on the other two tabs.
      // Tab walks Settings fields; Shift+Tab walks them backwards. The
      // keybinding only covers forward, so the raw CSI Z sequence is the
      // fallback, the same way Escape falls back to "\u001b" above.
      if (keybindings.matches(data, "tui.input.tab") || data === "\u001b[Z") {
        if (tab === SETTINGS_TAB) settingsMoveField(data === "\u001b[Z" ? -1 : 1);
        tui.requestRender();
        return;
      }
      if (tab === RECENT_TAB || tab === STATUS_TAB) {
        let step = 0;
        if (keybindings.matches(data, "tui.select.up")) step = -1;
        else if (keybindings.matches(data, "tui.select.down")) step = 1;
        const lineCount =
          tab === RECENT_TAB
            ? Math.max(recentLines(model.status).length, 1)
            : Math.max(statusLines(model.statusJson).length, 1);
        recentRow = moveRow(recentRow, step, lineCount);
        tui.requestRender();
        return;
      }
      // ↑/↓/Enter go to the active list; anything else (number keys included) is inert.
      if (tab === PENDING_TAB) pendingList.handleInput(data);
      if (tab === SETTINGS_TAB) settingsHandleInput(data);
      tui.requestRender();
    },
    invalidate(): void {
      pendingList.invalidate();
      recentText.invalidate();
    },
    render(width: number): string[] {
      const guard = panelLayout(tui.terminal.rows);
      body = Math.min(body, guard.body);
      height = Math.min(height, guard.height);
      const inner = Math.max(width - 4, 1);
      const lines: string[] = [
        titleBorder(width, theme),
        `│ ${padRow(tabBarLines(model, tab, width, theme)[0] ?? "", inner)} │`,
      ];
      for (const row of fit(bodyRowsFor(inner), body))
        lines.push(`│ ${padRow(row, inner)} │`);
      for (const row of detailLines())
        lines.push(`│ ${padRow(theme.fg("muted", row), inner)} │`);
      const info = infoBarLines(model, width);
      lines.push(`│ ${padRow(theme.fg("dim", info[0] ?? ""), inner)} │`);
      lines.push(`│ ${padRow(theme.fg("muted", info[1] ?? ""), inner)} │`);
      // Key hints sit on the last line before the border, in the same dim
      // style as the footer status line.
      lines.push(
        `│ ${padRow(theme.fg("dim", panelText("chrome.hint", model.language)), inner)} │`,
      );
      lines.push(theme.fg("borderAccent", `╰${"─".repeat(Math.max(width - 2, 1))}╯`));
      // Cap the rendered height at the budget. The body list, info bar and
      // border always add up to more than `height` on tall terminals, so the
      // tail is trimmed rather than the panel stretching to the viewport.
      return lines.slice(0, height);
    },
  };

  /** Visible Settings rows for the current fold state and cursor position. */
  function settingsLines(width: number): string[] {
    const rows = settingsRows(model.rows, collapsed);
    cursor = clampCursor(cursor, rows.length);
    settingsStart = cursorWindowStart(settingsStart, cursor, rows.length, body);
    return rows
      .slice(settingsStart, settingsStart + body)
      .map((row, index) =>
        settingsRowText(
          row,
          settingsStart + index === cursor,
          width,
          theme,
          model.language,
        ),
      );
  }

  function settingsMove(step: number): void {
    cursor = moveRow(cursor, step, settingsRows(model.rows, collapsed).length);
  }

  function settingsMoveField(step: number): void {
    const rows = settingsRows(model.rows, collapsed);
    let index = cursor;
    // Skip group headers: Tab only ever lands on a field row.
    for (let i = 0; i < rows.length; i += 1) {
      index = moveRow(index, step, rows.length);
      if (rows[index]?.kind === "field") break;
    }
    cursor = index;
  }

  /** Space: fold a group header, cycle a writable field, ignore the rest. */
  function settingsActivate(): void {
    const rows = settingsRows(model.rows, collapsed);
    const row = rows[cursor];
    if (row === undefined) return;
    if (row.kind === "group") {
      settingsToggleGroup(row.group.id);
      return;
    }
    const { values } = row.item;
    // Locked and never-written fields carry no values, so Enter is a no-op.
    if (values === undefined || values.length === 0) return;
    const index = values.indexOf(row.item.currentValue);
    const next = values[(index + 1) % values.length];
    if (next === undefined || next === row.item.currentValue) return;
    // The panel owns the displayed value now that `SettingsList` is gone, so
    // the row must carry the new value before the save round-trips.
    row.item.currentValue = next;
    changeField(row.item.id, next);
  }

  function settingsToggleGroup(id: string): void {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    // Land on the group header, which exists in both fold states.
    const rows = settingsRows(model.rows, collapsed);
    cursor = groupHeaderIndex(rows, id);
    settingsStart = cursorWindowStart(settingsStart, cursor, rows.length, body);
  }

  function settingsHandleInput(data: string): void {
    if (keybindings.matches(data, "tui.select.up")) settingsMove(-1);
    else if (keybindings.matches(data, "tui.select.down")) settingsMove(1);
    else if (data === " ") settingsActivate();
    else if (data === "\r" || data === "\n") settingsSave();
  }

  /** Enter: persist the panel's state. The panel stays open. */
  function settingsSave(): void {
    actions.save({});
    savedNotice = true;
  }

  /**
   * The two fixed detail rows for the row under the cursor: what the field
   * does and who it is for, then the recommended value with the meaning of
   * every option. Group headers and the non-Settings tabs explain nothing,
   * so both rows stay blank and the detail area never changes height.
   */
  function detailLines(): string[] {
    if (savedNotice)
      return [
        panelText("chrome.saved", model.language),
        "",
      ];
    const blank = [
      "",
      "",
    ];
    if (tab !== SETTINGS_TAB) return blank;
    const row = settingsRows(model.rows, collapsed)[cursor];
    if (row === undefined || row.kind === "group") return blank;
    return [
      panelText(`detail.${row.item.id}`, model.language),
      panelText(`choice.${row.item.id}`, model.language),
    ];
  }

  function bodyRowsFor(width: number): string[] {
    if (tab === RECENT_TAB) {
      recentText.setText(
        recentWindow(model.status, recentRow, body)
          .map((line) => truncateToWidth(line, width, ""))
          .join("\n"),
      );
      return recentText.render(width);
    }
    if (tab === STATUS_TAB) {
      recentText.setText(
        statusWindow(model.statusJson, recentRow, body)
          .map((line) => truncateToWidth(line, width, ""))
          .join("\n"),
      );
      return recentText.render(width);
    }
    if (tab === SETTINGS_TAB) return settingsLines(width);
    return pendingList.render(width);
  }

  function changeField(id: string, value: string): void {
    if (id === "sleep") {
      void actions
        .confirm(
          "Run one-shot sleep",
          "Sleep performs one authorized T1 consolidation and is not persisted.",
        )
        .then((confirmed) => {
          if (!confirmed) {
            const sleep = model.rows.find((item) => item.id === "sleep");
            if (sleep) sleep.currentValue = "off";
            tui.requestRender();
            return;
          }
          return actions.sleep().then(done);
        });
      return;
    }
    if (id === "language") {
      // The panel renders its own labels, and `model.language` is what they read,
      // so the row must land in the view-model or the panel keeps the old
      // language until it is reopened.
      if (value === "en" || value === "zh") {
        actions.save({
          language: value,
        } as ConsoleSettings);
        model.language = value;
      }
    } else actions.save(settingsSaveValue(id, value, options.config));
    tui.requestRender();
  }
}

function padRow(text: string, width: number): string {
  const line = truncateToWidth(text, width, "");
  return line + " ".repeat(Math.max(width - visibleWidth(line), 0));
}

export async function openConsole(
  ctx: ExtensionContext,
  status: MemoryStatus,
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
  pending: PendingCandidate[],
  actions: ConsoleActions,
): Promise<void> {
  await ctx.ui.custom(
    (tui, theme, keybindings, done) =>
      createConsoleComponent({
        actions,
        config,
        done: () => done(undefined),
        env,
        keybindings,
        pending,
        status,
        statusJson: formatStatusJson(
          status,
          l0Status({
            env,
          }),
        ),
        terminalRows: tui.terminal.rows,
        theme,
        tui,
      }),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: PANEL_WIDTH,
        margin: {
          bottom: OVERLAY_MARGIN_BOTTOM,
          left: 2,
          right: 2,
          top: 2,
        },
      },
    },
  );
}
