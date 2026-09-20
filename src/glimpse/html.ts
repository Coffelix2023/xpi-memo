/**
 * HTML building helpers.
 *
 * Every dynamic string in the window goes through `esc` before it reaches the
 * document. The values here are not attacker-controlled in the usual sense —
 * they come from the local memory bank — but a memory body is arbitrary user
 * text, and it lands in `innerHTML`-shaped output, so escaping is the boundary
 * that keeps a stored `</pre><script>` from becoming markup.
 */

/** Escape the five characters that can change HTML parsing. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type AttrValue = string | number | boolean | null | undefined;

/**
 * One element. Attributes with `null`/`undefined`/`false` are dropped, `true`
 * renders as a bare attribute, and `class` is always written first so the
 * rendered document diffs cleanly.
 *
 * Attribute *values* are escaped too: a field id or bank name reaching an
 * attribute is the same trust problem as one reaching text.
 */
export function el(
  tagName: string,
  attrs: Record<string, AttrValue>,
  inner: string,
): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) {
      parts.push(name);
      continue;
    }
    parts.push(`${name}="${esc(value)}"`);
  }
  const open = parts.length > 0 ? `<${tagName} ${parts.join(" ")}>` : `<${tagName}>`;
  return `${open}${inner}</${tagName}>`;
}

/** A text-only element; `inner` is escaped. */
export function textEl(
  tagName: string,
  attrs: Record<string, AttrValue>,
  inner: unknown,
): string {
  return el(tagName, attrs, esc(inner));
}
