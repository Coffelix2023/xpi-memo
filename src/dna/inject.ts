/**
 * Domain detection + bounded full-file injection for DNA
 * (change add-dna-project-domain-memory, tasks 3.2/3.3).
 *
 * Delivery is whole-domain injection, never recall: a small deterministic
 * keyword gate picks the domain(s), the entire matching domain is rendered as
 * one bounded markdown block, and anything else produces nothing. Keyword
 * lists are deliberately conservative code constants — a false positive costs
 * one small bounded block; a false negative falls back to an explicit read.
 */

import { loadDna } from "./load.ts";
import { DNA_DOMAINS, type DnaDomain, type DnaEntry } from "./schema.ts";

const ART_KEYWORDS = [
  "border",
  "button",
  "css",
  "gap",
  "icon",
  "shadow",
  "tailwind",
  "ui",
  "ui ",
  "布局",
  "按钮",
  "字体",
  "工艺",
  "圆角",
  "图标",
  "卡片",
  "原型",
  "页面",
  "排版",
  "换行",
  "颜色",
  "样式",
  "线框",
  "组件",
  "视觉",
  "视觉",
  "间距",
  "高保真",
  "界面",
] as const;

const WRITE_KEYWORDS = [
  "chapter",
  "copywriting",
  "essay",
  "novel",
  "outline",
  "story",
  "大纲",
  "故事",
  "小说",
  "文章",
  "措辞",
  "散文",
  "正文",
  "润色",
  "稿件",
  "章节",
  "续写",
  "写作",
  "文案",
  "段落",
  "剧本",
] as const;

export const DNA_MAX_ENTRIES_PER_DOMAIN = 40;
export const DNA_MAX_INJECTION_CHARS = 4000;

export function detectDnaDomains(prompt: string): Record<DnaDomain, boolean> {
  const haystack = prompt.toLowerCase();
  return {
    art: ART_KEYWORDS.some((keyword) => haystack.includes(keyword)),
    write: WRITE_KEYWORDS.some((keyword) => haystack.includes(keyword)),
  };
}

function renderEntry(entry: DnaEntry): string {
  const params = entry.params
    ? ` (${Object.entries(entry.params)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ")})`
    : "";
  return `- ${entry.id}: ${entry.semantic}${params} [${entry.source}, ${entry.confidence}]`;
}

/** One bounded block per prompt; null when nothing should be injected. */
export function buildDnaInjection(options: {
  cwd: string;
  prompt: string;
  trusted: boolean;
}): string | null {
  const loaded = loadDna({
    cwd: options.cwd,
    trusted: options.trusted,
  });
  if (loaded.status !== "ok") return null;
  const detected = detectDnaDomains(options.prompt);
  const lines: string[] = [
    "项目文件上下文(.pi/DNA.yaml)",
  ];
  let chars = lines[0].length;
  let omitted = 0;
  let rendered = 0;
  stop: for (const domain of DNA_DOMAINS) {
    if (!detected[domain]) continue;
    const entries = loaded.file[domain] ?? [];
    if (entries.length === 0) continue;
    const heading = `[${domain}]`;
    if (chars + heading.length + 1 > DNA_MAX_INJECTION_CHARS) {
      omitted += entries.length;
      continue;
    }
    lines.push(heading);
    chars += heading.length + 1;
    for (const entry of entries.slice(0, DNA_MAX_ENTRIES_PER_DOMAIN)) {
      const line = renderEntry(entry);
      if (chars + line.length + 1 > DNA_MAX_INJECTION_CHARS) {
        omitted += entries.length - rendered;
        break stop;
      }
      lines.push(line);
      chars += line.length + 1;
      rendered += 1;
    }
    if (entries.length > DNA_MAX_ENTRIES_PER_DOMAIN)
      omitted += entries.length - DNA_MAX_ENTRIES_PER_DOMAIN;
  }
  if (rendered === 0 && omitted === 0) return null;
  if (omitted > 0) lines.push(`…(超出注入预算,省略 ${omitted} 条)`);
  return lines.join("\n");
}
