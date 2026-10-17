/** Higher is a better match. Null means it does not match. */
function fuzzyScore(query: string, name: string): number | null {
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  if (!q) return 1;
  if (n.startsWith(q)) return 200 - n.length;
  const at = n.indexOf(q);
  if (at >= 0) return 100 - at;
  let qi = 0;
  for (const ch of n) {
    if (ch === q[qi]) qi += 1;
    if (qi === q.length) return 10;
  }
  return null;
}

/** Followed channels that match `query`, best first. */
export function fuzzyChannels(channels: readonly string[], query: string): string[] {
  return channels
    .map((name) => ({ name, score: fuzzyScore(query, name) }))
    .filter((item): item is { name: string; score: number } => item.score !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((item) => item.name);
}
