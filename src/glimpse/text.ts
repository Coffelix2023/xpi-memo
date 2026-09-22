import { fillTemplate, type PanelLanguage, panelText } from "../panel-text.js";

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
    "pending.evidence.format": "{type} from {source} ({provenance})",
    "pending.later": "Later",
    "pending.notice.later": "Kept for later",
    "pending.notice.rejected": "Rejected",
    "pending.notice.stored": "Stored",
    "pending.rationale": "rationale",
    "pending.reject": "Reject",
    "pending.store": "Store",
    "pending.title": "Candidates",
    "pending.type": "type",
    // Literal theme names, not prose: they read the same in both languages.
    "principle.atlas": "Atlas",
    "principle.default": "Default",
    "recent.action": "action",
    "recent.action.candidate": "candidate",
    "recent.action.confirmation": "confirmation",
    "recent.action.deletion": "deletion",
    "recent.action.extraction": "extraction",
    "recent.action.fallback": "fallback",
    "recent.action.feedback": "feedback",
    "recent.action.recall": "recall",
    "recent.action.rejection": "rejection",
    "recent.action.sleep-authorization": "sleep authorization",
    "recent.action.write": "write",
    "recent.bank": "bank",
    "recent.count.candidates": "{count} candidates",
    "recent.count.hits": "{count} hits",
    "recent.count.injected": "{count} injected",
    "recent.count.stored": "{count} stored",
    "recent.detail": "detail",
    "recent.empty": "No recent activity",
    "recent.emptyHint": "Memory events appear here over time",
    "recent.feedbackMode.explicit": "explicit",
    "recent.feedbackMode.passive": "passive",
    "recent.hint": "The last few memory events, newest first, read from the audit log.",
    "recent.kind": "kind",
    "recent.status": "status",
    "recent.status.budget-exhausted": "budget exhausted",
    "recent.status.conflict": "conflict",
    "recent.status.degraded": "degraded",
    "recent.status.deleted": "deleted",
    "recent.status.executed": "executed",
    "recent.status.failed": "failed",
    "recent.status.no-backend": "no backend",
    "recent.status.pending": "pending",
    "recent.status.recalled": "recalled",
    "recent.status.rejected": "rejected",
    "recent.status.reported": "reported",
    "recent.status.routing_rejected": "routing rejected",
    "recent.status.skipped": "skipped",
    "recent.status.stored": "stored",
    "recent.status.timed-out": "timed out",
    "recent.status.unresolved": "unresolved",
    "recent.time": "time",
    "recent.usage.injected": "injected",
    "recent.usage.recalled": "recalled",
    "state.loading": "Loading",
    "status.disk": "disk",
    "status.embeddingAvailable": "available",
    "status.embeddingUnavailable": "unavailable",
    "status.extraction": "extraction {gate} · {outcome}",
    "status.extractionNoRun": "no run yet",
    "status.extractionOff": "off",
    "status.extractionOn": "on",
    // Slot order lives here, not in the view, so a language can reorder it.
    "status.recall": "recall {mode} · backend {backend} · embedding {embedding}",
    "status.records": "records",
    "status.snapshot": "raw snapshot",
    "status.today": "today",
    "status.trend": "last 7d",
    "status.usage": "today events",
    "toggle.lang": "Toggle language",
    "toggle.principle": "Theme principle",
    "toggle.theme": "Toggle theme",
    "triggers.admission": "admission",
    "triggers.capture": "capture triggers",
    "triggers.hint":
      "Read-only. These rules live in code; change the recall mode and admission preferences in Settings.",
    "triggers.mode": "recall mode",
    "triggers.recall": "recall triggers",
    "triggers.rule.constraint": "Constraint",
    "triggers.rule.decision": "Decision",
    "triggers.rule.gotcha": "Gotcha",
    "triggers.rule.preference": "Preference",
    "triggers.rule.project": "Project wording",
    "triggers.rule.project-fact": "Repository fact",
    "triggers.rule.session": "Session wording",
    "triggers.rule.workflow": "Workflow",
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
    "pending.evidence.format": "{type} · 来自 {source}（{provenance}）",
    "pending.later": "稍后",
    "pending.notice.later": "已跳过",
    "pending.notice.rejected": "已拒绝",
    "pending.notice.stored": "已存入",
    "pending.rationale": "理由",
    "pending.reject": "拒绝",
    "pending.store": "存入",
    "pending.title": "候选",
    "pending.type": "类型",
    // 主题名是字面值，不是文案：两种语言同形
    "principle.atlas": "Atlas",
    "principle.default": "Default",
    "recent.action": "动作",
    "recent.action.candidate": "候选生成",
    "recent.action.confirmation": "确认",
    "recent.action.deletion": "删除",
    "recent.action.extraction": "提取",
    "recent.action.fallback": "降级",
    "recent.action.feedback": "使用反馈",
    "recent.action.recall": "召回",
    "recent.action.rejection": "拒绝",
    "recent.action.sleep-authorization": "整理授权",
    "recent.action.write": "写入",
    "recent.bank": "库",
    "recent.count.candidates": "候选 {count}",
    "recent.count.hits": "命中 {count}",
    "recent.count.injected": "注入 {count}",
    "recent.count.stored": "入库 {count}",
    "recent.detail": "详情",
    "recent.empty": "暂无活动",
    "recent.emptyHint": "记忆事件会按时间出现在这里",
    "recent.feedbackMode.explicit": "显式",
    "recent.feedbackMode.passive": "被动",
    "recent.hint": "最近发生的记忆事件，取自审计日志（新事件在前）",
    "recent.kind": "类型",
    "recent.status": "状态",
    "recent.status.budget-exhausted": "预算耗尽",
    "recent.status.conflict": "冲突",
    "recent.status.degraded": "降级",
    "recent.status.deleted": "已删除",
    "recent.status.executed": "已执行",
    "recent.status.failed": "失败",
    "recent.status.no-backend": "无可用后端",
    "recent.status.pending": "待定",
    "recent.status.recalled": "已召回",
    "recent.status.rejected": "已拒绝",
    "recent.status.reported": "已产出",
    "recent.status.routing_rejected": "路由拒绝",
    "recent.status.skipped": "跳过",
    "recent.status.stored": "已存入",
    "recent.status.timed-out": "超时",
    "recent.status.unresolved": "未解决",
    "recent.time": "时间",
    "recent.usage.injected": "已注入",
    "recent.usage.recalled": "已召回",
    "state.loading": "加载中",
    "status.disk": "磁盘",
    "status.embeddingAvailable": "可用",
    "status.embeddingUnavailable": "不可用",
    "status.extraction": "提取 {gate} · {outcome}",
    "status.extractionNoRun": "未运行",
    "status.extractionOff": "关",
    "status.extractionOn": "开",
    "status.recall": "召回 {mode} · 后端 {backend} · 嵌入 {embedding}",
    "status.records": "记录",
    "status.snapshot": "原始快照",
    "status.today": "今日",
    "status.trend": "近 7 日",
    "status.usage": "今日事件",
    "toggle.lang": "切换语言",
    "toggle.principle": "主题原则",
    "toggle.theme": "切换主题",
    "triggers.admission": "准入裁决",
    "triggers.capture": "自动捕获",
    "triggers.hint": "只读。这些规则写在代码里；召回档位与准入偏好在「设置」页修改。",
    "triggers.mode": "召回档位",
    "triggers.recall": "自动召回",
    "triggers.rule.constraint": "约束",
    "triggers.rule.decision": "决策",
    "triggers.rule.gotcha": "坑点",
    "triggers.rule.preference": "偏好",
    "triggers.rule.project": "项目措辞",
    "triggers.rule.project-fact": "仓库事实",
    "triggers.rule.session": "会话措辞",
    "triggers.rule.workflow": "工作流",
  },
};

/** Keys this window owns outright; used by the parity test. */
export const WINDOW_TEXT_KEYS = Object.keys(WINDOW_TEXT.en);

/**
 * One window string: this table first, then `panelText` for the shared keys.
 *
 * `panelText` already falls back selected language → `en` → the key itself, so
 * a missing entry renders readable text rather than an empty element.
 */
export function glimpseText(key: string, language: PanelLanguage): string {
  return WINDOW_TEXT[language]?.[key] ?? panelText(key, language);
}

/** Re-exported: the dictionary owns the slot syntax, this module used to. */
export { fillTemplate };

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

/**
 * The offline-extraction line: whether the gate is open and how the last
 * attempt ended.
 *
 * The outcome code is printed verbatim. It is the same bounded diagnostic the
 * audit carries, and `executed-without-proposals` and `runner-unavailable` mean
 * very different things to whoever is debugging; a translated label would cost
 * the reader the ability to match it against a log or a bug report. Only the
 * gate half, which mirrors a setting, is localized.
 *
 * Takes the shape it needs rather than `MemoryStatus`, so this module keeps
 * owning copy and nothing else.
 */
export function extractionLine(
  extraction:
    | {
        enabled: boolean;
        lastOutcome?: string;
        model?: string;
      }
    | undefined,
  language: PanelLanguage,
): string {
  return fillTemplate(glimpseText("status.extraction", language), {
    gate: glimpseText(
      extraction?.enabled === true ? "status.extractionOn" : "status.extractionOff",
      language,
    ),
    outcome: [
      extraction?.lastOutcome ?? glimpseText("status.extractionNoRun", language),
      // The model it resolved to, when there is one: the silent fallback to
      // the session model is the thing this line exists to make visible.
      ...(extraction?.model
        ? [
            `→ ${extraction.model}`,
          ]
        : []),
    ].join(" "),
  });
}
