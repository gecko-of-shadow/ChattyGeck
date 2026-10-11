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

/**
 * Third-party emote maps: global sets once per session, channel sets per joined channel
 * (refetched every time the channel is joined). Each provider fails independently.
 */
export class EmoteRegistry {
  private global = emptyEmotes();
  private globalStatus = statuses({ state: "idle" });
  private globalLoad: Promise<void> | null = null;
  private channels = new Map<string, ChannelEntry>();
  private lookups = new Map<string, Map<string, Emote>>();
  private listeners = new Set<Listener>();
  private loadCounter = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(channel: string | null): void {
    if (channel === null) this.lookups.clear();
    else this.lookups.delete(channel);
    for (const listener of this.listeners) listener(channel);
  }

  loadGlobal(force = false): Promise<void> {
    if (this.globalLoad && !force) return this.globalLoad;
    this.globalStatus = statuses({ state: "loading" });
    this.emit(null);
    this.globalLoad = Promise.all(
      THIRD_PARTY_PROVIDERS.map(async (provider) => {
        try {
          const emotes = await globalFetchers[provider]();
          this.global[provider] = emotes;
          this.globalStatus[provider] = emotes.length ? { state: "ok", count: emotes.length } : { state: "none" };
        } catch (err) {
          this.globalStatus[provider] = { state: "error", error: describeError(err) };
        }
        this.emit(null);
      }),
    ).then(() => undefined);
    return this.globalLoad;
  }

  async loadChannel(channel: string, roomId: string): Promise<void> {
    const entry: ChannelEntry = {
      roomId,
      emotes: emptyEmotes(),
      status: statuses({ state: "loading" }),
      loadId: ++this.loadCounter,
    };
    this.channels.set(channel, entry);
    this.emit(channel);

    await Promise.all(
      THIRD_PARTY_PROVIDERS.map(async (provider) => {
        let status: ProviderStatus;
        let emotes: Emote[] = [];
        try {
          emotes = await channelFetchers[provider](roomId);
          status = emotes.length ? { state: "ok", count: emotes.length } : { state: "none" };
        } catch (err) {
          status = err instanceof NotFoundError ? { state: "none" } : { state: "error", error: describeError(err) };
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

  /** Name -> emote, channel sets over global sets, 7TV over BTTV over FFZ. */
  lookup(channel: string): Map<string, Emote> {
    const cached = this.lookups.get(channel);
    if (cached) return cached;
    const map = new Map<string, Emote>();
    const order: ThirdPartyProvider[] = ["ffz", "bttv", "7tv"];
    for (const provider of order) for (const emote of this.global[provider]) map.set(emote.name, emote);
    const entry = this.channels.get(channel);
    if (entry) for (const provider of order) for (const emote of entry.emotes[provider]) map.set(emote.name, emote);
    this.lookups.set(channel, map);
    return map;
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
}

export const emoteRegistry = new EmoteRegistry();
