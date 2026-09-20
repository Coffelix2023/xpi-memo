import { type PanelLanguage, panelText } from "../panel-text.js";

/**
 * Copy the Glimpse window owns, on top of what `panel-text.ts` already has.
 *
 * The window and the terminal panel MUST show the same labels for the same
 * state, so this table deliberately holds only keys the terminal panel has no
 * equivalent for: the window's own chrome, the four view headings, the table
 * headers, and the action buttons.
 *
 * Everything else resolves through `panelText` — view names (`tab.*`), the info
 * bar (`info.*`), settings groups (`group.*`), and every settings field label,
 * note, detail line, and choice hint (`field.*` / `note.*` / `detail.*` /
 * `choice.*`). A second copy of those would be free to drift from the panel's.
 */
const WINDOW_TEXT: Record<PanelLanguage, Record<string, string>> = {
  en: {
    "app.name": "XpiMemo T1 Console",
    "app.paused": "PAUSED",
    "app.running": "RUNNING",
    close: "Close window",
    "error.save":
      "Save failed: config directory is not writable, nothing was persisted",
    // Literal config values, not prose: they read the same in both languages.
    "info.off": "off",
    "info.on": "on",
    "pending.age": "age",
    "pending.bank": "bank",
    "pending.conflict": "conflict",
    "pending.content": "content",
    "pending.empty": "No pending memories",
    "pending.evidence": "evidence",
    "pending.later": "Later",
    "pending.rationale": "rationale",
    "pending.reject": "Reject",
    "pending.store": "Store",
    "pending.title": "Candidates",
    "pending.type": "type",
    "recent.action": "action",
    "recent.bank": "bank",
    "recent.empty": "No recent activity",
    "recent.emptyHint": "Memory events appear here over time",
    "recent.kind": "kind",
    "recent.status": "status",
    "recent.time": "time",
    "state.loading": "Loading",
    "status.disk": "disk",
    "status.embeddingAvailable": "available",
    "status.embeddingUnavailable": "unavailable",
    // Slot order lives here, not in the view, so a language can reorder it.
    "status.recall": "recall {mode} · backend {backend} · embedding {embedding}",
    "status.records": "records",
    "status.snapshot": "raw snapshot",
    "status.today": "today",
    "status.trend": "last 7d",
    "status.usage": "today events",
    "toggle.lang": "Toggle language",
    "toggle.theme": "Toggle theme",
  },
  zh: {
    "app.name": "XpiMemo T1 Console",
    "app.paused": "已暂停",
    "app.running": "运行中",
    close: "关闭窗口",
    "error.save": "保存失败：配置目录不可写，改动未落盘",
    // 字面配置值, 不是文案: 两种语言同形
    "info.off": "off",
    "info.on": "on",
    "pending.age": "时间",
    "pending.bank": "库",
    "pending.conflict": "冲突",
    "pending.content": "内容",
    "pending.empty": "当前没有待审记忆",
    "pending.evidence": "证据",
    "pending.later": "稍后",
    "pending.rationale": "理由",
    "pending.reject": "拒绝",
    "pending.store": "存入",
    "pending.title": "候选",
    "pending.type": "类型",
    "recent.action": "动作",
    "recent.bank": "库",
    "recent.empty": "暂无活动",
    "recent.emptyHint": "记忆事件会按时间出现在这里",
    "recent.kind": "类型",
    "recent.status": "状态",
    "recent.time": "时间",
    "state.loading": "加载中",
    "status.disk": "磁盘",
    "status.embeddingAvailable": "可用",
    "status.embeddingUnavailable": "不可用",
    "status.recall": "召回 {mode} · 后端 {backend} · 嵌入 {embedding}",
    "status.records": "记录",
    "status.snapshot": "原始快照",
    "status.today": "今日",
    "status.trend": "近 7 日",
    "status.usage": "今日事件",
    "toggle.lang": "切换语言",
    "toggle.theme": "切换主题",
  },
};

/** Keys this window owns outright; used by the parity test. */
export const WINDOW_TEXT_KEYS = Object.keys(WINDOW_TEXT.en);

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * One window string: this table first, then `panelText` for the shared keys.
 *
 * `panelText` already falls back selected language → `en` → the key itself, so
 * a missing entry renders readable text rather than an empty element.
 */
export function glimpseText(key: string, language: PanelLanguage): string {
  return WINDOW_TEXT[language]?.[key] ?? panelText(key, language);
}

/** Replace `{name}` slots, leaving unknown slots visible instead of blank. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (slot, name: string) => values[name] ?? slot,
  );
}

/** The `status.recall` line, composed from the live retrieval state. */
export function recallLine(
  mode: string,
  backend: string,
  embeddingAvailable: boolean,
  language: PanelLanguage,
): string {
  return fillTemplate(glimpseText("status.recall", language), {
    backend,
    embedding: glimpseText(
      embeddingAvailable ? "status.embeddingAvailable" : "status.embeddingUnavailable",
      language,
    ),
    mode,
  });
}
