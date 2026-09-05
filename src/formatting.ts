const SENTENCE_SEPARATOR = /[.!?。！？\n]/;
const MAX_TITLE_LENGTH = 50;

/** Extract a compact title from the first sentence of a memory. */
export function extractMemoryTitle(content: string): string {
  const firstSentence = content.trim().split(SENTENCE_SEPARATOR, 1)[0]?.trim() ?? "";
  const title = firstSentence || content.trim();
  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : title;
}

export interface FormattableMemory {
  content: string;
  id: string | null;
}

/** Format memory rows for concise, user-visible tool output. */
export function formatMemoryList(memories: readonly FormattableMemory[]): string {
  if (memories.length === 0) return "No memories found.";
  return memories
    .map(
      (memory, index) =>
        `${index + 1}. ${extractMemoryTitle(memory.content)}${memory.id ? ` [${memory.id}]` : ""}`,
    )
    .join("\n");
}
