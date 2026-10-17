/** Words the user chose Ignore for, until ZooChattr is closed. Not written to settings. */
const ignored = new Set<string>();
const listeners = new Set<() => void>();

export function ignoredSpellWords(): ReadonlySet<string> {
  return ignored;
}

export function ignoreSpellWord(word: string): void {
  const key = word.toLowerCase();
  if (ignored.has(key)) return;
  ignored.add(key);
  for (const listener of listeners) listener();
}

export function subscribeSpellIgnore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
