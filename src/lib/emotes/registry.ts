import type { ChannelFeature } from "@/store/settings";
import { emoteCache, type EmoteCache } from "./cache";
import { problemLog } from "./problems";
import { NotFoundError, channelFetchers, globalFetchers } from "./providers";
import { THIRD_PARTY_PROVIDERS, type Emote, type ProviderStatus, type ThirdPartyProvider } from "./types";

type ProviderRecord<T> = Record<ThirdPartyProvider, T>;
type Listener = (channel: string | null) => void;

interface ChannelEntry {
  roomId: string;
  emotes: ProviderRecord<Emote[]>;
  status: ProviderRecord<ProviderStatus>;
  loadId: number;
}

/** The user's emote switches. The registry applies them when building lookups. */
export interface EmotePrefs {
  providers: ProviderRecord<boolean>;
  overlays: boolean;
  blocked: Set<string>;
  remember: boolean;
  /** Features switched off for one channel only. */
  off: Record<string, ReadonlySet<ChannelFeature>>;
}

const DEFAULT_PREFS: EmotePrefs = {
  providers: { "7tv": true, bttv: true, ffz: true },
  overlays: true,
  blocked: new Set(),
  remember: true,
  off: {},
};

function sameOff(a: EmotePrefs["off"], b: EmotePrefs["off"]): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const sa = a[key];
    const sb = b[key];
    if (!sb || sa.size !== sb.size) return false;
    for (const feature of sa) if (!sb.has(feature)) return false;
  }
  return true;
}

const emptyEmotes = (): ProviderRecord<Emote[]> => ({ "7tv": [], bttv: [], ffz: [] });
const statuses = (state: ProviderStatus): ProviderRecord<ProviderStatus> => ({
  "7tv": state,
  bttv: state,
  ffz: state,
});

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message === "Failed to fetch" ? "network error" : err.message;
  return "unknown error";
}

/** Lowest priority first, so later providers overwrite: FFZ, then BTTV, then 7TV wins name clashes. */
const PRIORITY: ThirdPartyProvider[] = ["ffz", "bttv", "7tv"];

/**
 * Third-party emote maps: global sets once per session, channel sets per joined channel
 * (refetched every time the channel is joined). Each provider fails independently.
 * With "remember emotes" on, cached lists are shown at once and refreshed when stale.
 */
export class EmoteRegistry {
  private global = emptyEmotes();
  private globalStatus = statuses({ state: "idle" });
  private globalLoad: Promise<void> | null = null;
  private globalLoadId = 0;
  private channels = new Map<string, ChannelEntry>();
  private lookups = new Map<string, Map<string, Emote>>();
  private listeners = new Set<Listener>();
  private loadCounter = 0;
  private prefs: EmotePrefs = DEFAULT_PREFS;
  /** Bumped whenever any emote list or preference changes; cheap "did anything change" check for indexes. */
  version = 0;

  constructor(private readonly cache: EmoteCache = emoteCache) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(channel: string | null): void {
    if (channel === null) this.lookups.clear();
    else this.lookups.delete(channel);
    this.version++;
    for (const listener of this.listeners) listener(channel);
  }

  setPrefs(prefs: EmotePrefs): void {
    const before = this.prefs;
    this.prefs = prefs;
    const same =
      before.overlays === prefs.overlays &&
      before.remember === prefs.remember &&
      THIRD_PARTY_PROVIDERS.every((p) => before.providers[p] === prefs.providers[p]) &&
      before.blocked.size === prefs.blocked.size &&
      [...prefs.blocked].every((name) => before.blocked.has(name)) &&
      sameOff(before.off, prefs.off);
    if (!same) this.emit(null);
  }

  getPrefs(): EmotePrefs {
    return this.prefs;
  }

  loadGlobal(force = false): Promise<void> {
    if (this.globalLoad && !force) return this.globalLoad;
    const loadId = ++this.loadCounter;
    this.globalLoadId = loadId;
    // A forced reload keeps showing what's there until the fresh list arrives.
    if (!force) this.globalStatus = statuses({ state: "loading" });
    this.emit(null);
    this.globalLoad = Promise.all(
      THIRD_PARTY_PROVIDERS.map(async (provider) => {
        const key = `${provider}:global`;
        const hit = force || !this.prefs.remember ? null : this.cache.get(key);
        if (hit) {
          this.global[provider] = hit.emotes;
          this.globalStatus[provider] = hit.emotes.length ? { state: "ok", count: hit.emotes.length, cached: true } : { state: "none" };
          this.emit(null);
          if (!hit.stale) return;
        }
        try {
          const emotes = await globalFetchers[provider]();
          if (this.globalLoadId !== loadId) return; // a newer reload took over
          this.global[provider] = emotes;
          this.globalStatus[provider] = emotes.length ? { state: "ok", count: emotes.length } : { state: "none" };
          if (this.prefs.remember) this.cache.put(key, "global", emotes);
        } catch (err) {
          if (this.globalLoadId !== loadId) return;
          const message = describeError(err);
          problemLog.record(provider, "global", message);
          const hadSomething = hit || this.globalStatus[provider].state === "ok";
          if (!hadSomething) this.globalStatus[provider] = { state: "error", error: message };
        }
        this.emit(null);
      }),
    ).then(() => undefined);
    return this.globalLoad;
  }

  async loadChannel(channel: string, roomId: string, force = false): Promise<void> {
    const previous = this.channels.get(channel);
    // A forced reload of the same room keeps the current lists on screen until fresh ones arrive.
    const keep = force && previous?.roomId === roomId ? previous : null;
    const entry: ChannelEntry = {
      roomId,
      emotes: keep ? { ...keep.emotes } : emptyEmotes(),
      status: keep ? { ...keep.status } : statuses({ state: "loading" }),
      loadId: ++this.loadCounter,
    };
    this.channels.set(channel, entry);
    this.emit(channel);

    await Promise.all(
      THIRD_PARTY_PROVIDERS.map(async (provider) => {
        const key = `${provider}:channel:${roomId}`;
        const hit = force || !this.prefs.remember ? null : this.cache.get(key);
        if (hit) {
          entry.emotes[provider] = hit.emotes;
          entry.status[provider] = hit.emotes.length ? { state: "ok", count: hit.emotes.length, cached: true } : { state: "none" };
          this.emit(channel);
          if (!hit.stale) return;
        }
        let status: ProviderStatus;
        let emotes: Emote[] = [];
        try {
          emotes = await channelFetchers[provider](roomId);
          status = emotes.length ? { state: "ok", count: emotes.length } : { state: "none" };
          if (this.prefs.remember) this.cache.put(key, "channel", emotes);
        } catch (err) {
          if (err instanceof NotFoundError) {
            status = { state: "none" };
          } else {
            const message = describeError(err);
            problemLog.record(provider, "channel", message, channel);
            if (hit || keep) return; // keep showing what we have; the failure is still in Problems
            status = { state: "error", error: message };
          }
        }
        if (this.channels.get(channel)?.loadId !== entry.loadId) return;
        entry.emotes[provider] = emotes;
        entry.status[provider] = status;
        this.emit(channel);
      }),
    );
  }

  removeChannel(channel: string): void {
    this.channels.delete(channel);
    this.lookups.delete(channel);
  }

  private providerOn(provider: ThirdPartyProvider, channel: string): boolean {
    return this.prefs.providers[provider] && !this.prefs.off[channel]?.has(provider);
  }

  private overlaysOn(channel: string): boolean {
    return this.prefs.overlays && !this.prefs.off[channel]?.has("overlayEmotes");
  }

  /** The provider's emotes with the user's switches (and this channel's overrides) applied. */
  private usable(emotes: Emote[], provider: ThirdPartyProvider, channel: string): Emote[] {
    if (!this.providerOn(provider, channel)) return [];
    const { blocked } = this.prefs;
    const overlays = this.overlaysOn(channel);
    if (!blocked.size && overlays) return emotes;
    const out: Emote[] = [];
    for (const emote of emotes) {
      if (blocked.has(emote.name)) continue;
      out.push(!overlays && emote.zeroWidth ? { ...emote, zeroWidth: false } : emote);
    }
    return out;
  }

  /** Name -> emote, channel sets over global sets, 7TV over BTTV over FFZ. */
  lookup(channel: string): Map<string, Emote> {
    const cached = this.lookups.get(channel);
    if (cached) return cached;
    const map = new Map<string, Emote>();
    for (const provider of PRIORITY) for (const emote of this.usable(this.global[provider], provider, channel)) map.set(emote.name, emote);
    const entry = this.channels.get(channel);
    if (entry) {
      for (const provider of PRIORITY) for (const emote of this.usable(entry.emotes[provider], provider, channel)) map.set(emote.name, emote);
    }
    this.lookups.set(channel, map);
    return map;
  }

  /** Every emote usable in `channel` (the lookup's values): channel emotes first, then global. */
  allEmotes(channel: string): Emote[] {
    const out = Array.from(this.lookup(channel).values());
    return out.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "channel" ? -1 : 1));
  }

  getGlobalStatus(): ProviderRecord<ProviderStatus> {
    return { ...this.globalStatus };
  }

  getChannelStatus(channel: string): ProviderRecord<ProviderStatus> | null {
    const entry = this.channels.get(channel);
    return entry ? { ...entry.status } : null;
  }

  channelEmotes(channel: string): Emote[] {
    const entry = this.channels.get(channel);
    if (!entry) return [];
    return THIRD_PARTY_PROVIDERS.flatMap((provider) => entry.emotes[provider]);
  }

  /** Forgets every remembered emote list. */
  forgetCache(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }
}

export const emoteRegistry = new EmoteRegistry();
