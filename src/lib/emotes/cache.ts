// Remember emotes: every downloaded emote list is kept in localStorage (which lives in the ZooChattr-data folder),
// so pictures show the moment a channel opens instead of after three downloads. Stale-while-revalidate: an old
// list is used right away and refreshed in the background. Bounded: at most MAX_SETS lists, least recently used
// dropped first (roughly 60-120 KB for a 1,000-emote channel).
import type { Emote, EmoteScope } from "./types";

const HOUR = 3_600_000;
/** How old a list may get before it's downloaded again (it keeps being used meanwhile). */
export const FRESH_FOR: Record<EmoteScope, number> = { channel: 1 * HOUR, global: 12 * HOUR };
const MAX_SETS = 60;
const PREFIX = "zoochattr.emotes.";
const INDEX_KEY = `${PREFIX}index`;

interface Entry {
  at: number;
  scope: EmoteScope;
  emotes: Emote[];
}

export interface CacheHit {
  emotes: Emote[];
  /** Older than FRESH_FOR: use it, but download a fresh copy too. */
  stale: boolean;
}

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readIndex(store: Storage): Record<string, number> {
  try {
    const parsed = JSON.parse(store.getItem(INDEX_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export class EmoteCache {
  constructor(private readonly store: Storage | null = storage(), private readonly now: () => number = Date.now) {}

  get available(): boolean {
    return this.store !== null;
  }

  get(key: string): CacheHit | null {
    const store = this.store;
    if (!store) return null;
    try {
      const raw = store.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as Partial<Entry>;
      if (!Array.isArray(entry.emotes) || typeof entry.at !== "number" || !(entry.scope! in FRESH_FOR)) return null;
      const stale = this.now() - entry.at > FRESH_FOR[entry.scope as EmoteScope];
      this.touch(store, key);
      return { emotes: entry.emotes as Emote[], stale };
    } catch {
      return null;
    }
  }

  put(key: string, scope: EmoteScope, emotes: Emote[]): void {
    const store = this.store;
    if (!store) return;
    try {
      store.setItem(PREFIX + key, JSON.stringify({ at: this.now(), scope, emotes } satisfies Entry));
      this.touch(store, key, true);
    } catch {
      // Quota or private mode: live without the cache.
    }
  }

  clear(): void {
    const store = this.store;
    if (!store) return;
    const index = readIndex(store);
    for (const key of Object.keys(index)) store.removeItem(PREFIX + key);
    store.removeItem(INDEX_KEY);
  }

  /** Number of lists kept. */
  get size(): number {
    return this.store ? Object.keys(readIndex(this.store)).length : 0;
  }

  /** Marks `key` as just used; drops the oldest lists when there are too many. */
  private touch(store: Storage, key: string, prune = false): void {
    const index = readIndex(store);
    index[key] = this.now();
    if (prune) {
      const keys = Object.keys(index).sort((a, b) => index[a] - index[b]);
      for (const drop of keys.slice(0, Math.max(0, keys.length - MAX_SETS))) {
        delete index[drop];
        store.removeItem(PREFIX + drop);
      }
    }
    store.setItem(INDEX_KEY, JSON.stringify(index));
  }
}

export const emoteCache = new EmoteCache();
