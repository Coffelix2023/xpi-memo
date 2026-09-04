import type { MemoryKind } from "./kinds.js";

const WHITESPACE = /\s+/g;
const NEAR_JACCARD = 0.8;

export interface DuplicateSubject {
  bank: string;
  content: string;
  id: string;
  kind: MemoryKind | string;
}

export function normalizeMemoryContent(content: string): string {
  return content.trim().replace(WHITESPACE, " ");
}

export function markExactDuplicates<T extends DuplicateSubject>(
  items: T[],
  recency: (item: T) => number,
): Array<
  T & {
    supersededBy?: string;
  }
> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.bank}\0${item.kind}\0${normalizeMemoryContent(item.content)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else
      groups.set(key, [
        item,
      ]);
  }
  const superseded = new Map<string, string>();
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    bucket.sort(
      (left, right) =>
        recency(left) - recency(right) || left.id.localeCompare(right.id),
    );
    const keeper = bucket.at(-1);
    if (!keeper) continue;
    for (const item of bucket.slice(0, -1)) superseded.set(item.id, keeper.id);
  }
  return items.map((item) => {
    const supersededBy = superseded.get(item.id);
    return supersededBy === undefined
      ? item
      : {
          ...item,
          supersededBy,
        };
  });
}

export function nearDuplicatePairs(items: DuplicateSubject[]): Array<{
  a: string;
  b: string;
  bank: string;
  kind: string;
}> {
  const groups = new Map<string, DuplicateSubject[]>();
  for (const item of items) {
    const key = `${item.bank}\0${item.kind}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else
      groups.set(key, [
        item,
      ]);
  }
  const pairs: Array<{
    a: string;
    b: string;
    bank: string;
    kind: string;
  }> = [];
  for (const bucket of groups.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const left = bucket[i];
        const right = bucket[j];
        if (!left || !right) continue;
        if (
          normalizeMemoryContent(left.content) === normalizeMemoryContent(right.content)
        )
          continue;
        if (jaccard(left.content, right.content) < NEAR_JACCARD) continue;
        const [a, b] = [
          left.id,
          right.id,
        ].sort((one, two) => one.localeCompare(two));
        pairs.push({
          a,
          b,
          bank: left.bank,
          kind: String(left.kind),
        });
      }
    }
  }
  return pairs;
}

function jaccard(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 && b.size === 0) return 1;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function tokens(content: string): Set<string> {
  return new Set(
    normalizeMemoryContent(content)
      .toLowerCase()
      .split(" ")
      .filter((token) => token.length > 0),
  );
}
