// Finding emotes by the start of their name (Tab to finish names, the picker's search box).
import type { Emote } from "./types";

export const MAX_MATCHES = 50;

export interface NameIndex {
  entries: { lower: string; emote: Emote }[];
}

/** Sorted by lowercase name, so prefix lookups are a binary search. Build once per emote list version. */
export function buildNameIndex(emotes: Iterable<Emote>): NameIndex {
  const entries = Array.from(emotes, (emote) => ({ lower: emote.name.toLowerCase(), emote }));
  entries.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
  return { entries };
}

/**
 * Names starting with the typed letters first (exact case first, then shortest), then names that merely
 * contain them. Mirrors FrankerFaceZ's Tab behaviour.
 */
export function findEmotes(index: NameIndex, typed: string, limit = MAX_MATCHES): Emote[] {
  const prefix = typed.toLowerCase();
  if (!prefix) return [];
  const { entries } = index;
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].lower < prefix) lo = mid + 1;
    else hi = mid;
  }
  const starts: Emote[] = [];
  for (let i = lo; i < entries.length && entries[i].lower.startsWith(prefix); i++) starts.push(entries[i].emote);
  const contains: Emote[] = [];
  if (starts.length < limit) {
    for (const entry of entries) {
      if (!entry.lower.startsWith(prefix) && entry.lower.includes(prefix)) contains.push(entry.emote);
    }
  }
  const byName = (a: Emote, b: Emote) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
  starts.sort(
    (a, b) =>
      Number(!a.name.startsWith(typed)) - Number(!b.name.startsWith(typed)) || a.name.length - b.name.length || byName(a, b),
  );
  contains.sort((a, b) => a.name.length - b.name.length || byName(a, b));
  return starts.concat(contains).slice(0, limit);
}

/** The word around `caret` in `text` (whitespace-delimited), or null when the caret sits on a space. */
export function wordAt(text: string, caret: number): { start: number; end: number; word: string } | null {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const word = text.slice(start, end);
  return word ? { start, end, word } : null;
}
