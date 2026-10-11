// Recent emote-download failures, kept so Settings → Problems can show why a source went quiet.
// Mirrors Geckmotes' errlog: the last MAX entries, newest last, persisted in localStorage.
import type { EmoteScope, ThirdPartyProvider } from "./types";

const KEY = "zoochattr.problems";
const MAX = 20;

export interface EmoteProblem {
  /** Stable id for React keys. */
  id: string;
  at: number;
  provider: ThirdPartyProvider;
  scope: EmoteScope;
  /** Channel login when the failure was for a channel set. */
  channel?: string;
  message: string;
}

type Listener = () => void;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(store: Storage): EmoteProblem[] {
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const out: EmoteProblem[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== "object" || typeof e.provider !== "string" || typeof e.message !== "string") continue;
      out.push({
        id: typeof e.id === "string" ? e.id : `${e.at}-${e.provider}`,
        at: Number(e.at) || 0,
        provider: e.provider as ThirdPartyProvider,
        scope: e.scope === "channel" ? "channel" : "global",
        channel: typeof e.channel === "string" ? e.channel : undefined,
        message: String(e.message),
      });
    }
    return out.slice(-MAX);
  } catch {
    return [];
  }
}

class ProblemLog {
  private entries: EmoteProblem[] = [];
  private listeners = new Set<Listener>();
  private booted = false;

  private ensure(): void {
    if (this.booted) return;
    this.booted = true;
    const store = storage();
    if (store) this.entries = read(store);
  }

  list(): EmoteProblem[] {
    this.ensure();
    return this.entries.slice();
  }

  get size(): number {
    this.ensure();
    return this.entries.length;
  }

  record(provider: ThirdPartyProvider, scope: EmoteScope, message: string, channel?: string): void {
    this.ensure();
    const entry: EmoteProblem = {
      id: `${Date.now()}-${provider}-${scope}-${channel ?? ""}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      provider,
      scope,
      channel,
      message,
    };
    this.entries = [...this.entries, entry].slice(-MAX);
    const store = storage();
    if (store) {
      try {
        store.setItem(KEY, JSON.stringify(this.entries));
      } catch {
        // Quota / private mode: keep the in-memory list for this session.
      }
    }
    for (const listener of this.listeners) listener();
  }

  clear(): void {
    this.ensure();
    this.entries = [];
    const store = storage();
    if (store) {
      try {
        store.removeItem(KEY);
      } catch {
        // nothing more to do
      }
    }
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const problemLog = new ProblemLog();
