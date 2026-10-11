export type EmoteProvider = "twitch" | "7tv" | "bttv" | "ffz";
export type ThirdPartyProvider = Exclude<EmoteProvider, "twitch">;
export type EmoteScope = "global" | "channel";

export interface Emote {
  id: string;
  name: string;
  provider: EmoteProvider;
  scope: EmoteScope;
  url1x: string;
  url2x?: string;
  url4x?: string;
  /** Size at 1x, when the provider tells us. */
  width?: number;
  height?: number;
  /** Overlays the previous emote instead of taking its own slot. */
  zeroWidth: boolean;
  /** The picture moves. Still frames (`still*`) exist only for these. */
  animated?: boolean;
  still1x?: string;
  still2x?: string;
  still4x?: string;
}

export type ProviderStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; count: number; cached?: boolean }
  | { state: "none" }
  | { state: "error"; error: string };

export const PROVIDER_LABELS: Record<EmoteProvider, string> = {
  twitch: "Twitch",
  "7tv": "7TV",
  bttv: "BetterTTV",
  ffz: "FrankerFaceZ",
};

export const PROVIDER_SHORT: Record<EmoteProvider, string> = {
  twitch: "Twitch",
  "7tv": "7TV",
  bttv: "BTTV",
  ffz: "FFZ",
};

export const THIRD_PARTY_PROVIDERS: ThirdPartyProvider[] = ["7tv", "bttv", "ffz"];

/** "provider:id", the key favourites are stored under. */
export const emoteKey = (emote: Emote): string => `${emote.provider}:${emote.id}`;

/** Picture URLs for an emote, moving or still. Falls back to the moving picture when no still frame exists. */
export function emoteUrls(emote: Emote, still: boolean): { url1x: string; url2x?: string; url4x?: string } {
  if (still && emote.animated && emote.still1x) {
    return { url1x: emote.still1x, url2x: emote.still2x, url4x: emote.still4x };
  }
  return { url1x: emote.url1x, url2x: emote.url2x, url4x: emote.url4x };
}

/** The biggest picture we know of. */
export function emoteBigUrl(emote: Emote, still = false): string {
  const urls = emoteUrls(emote, still);
  return urls.url4x ?? urls.url2x ?? urls.url1x;
}
