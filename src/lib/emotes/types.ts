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
}

export type ProviderStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; count: number }
  | { state: "none" }
  | { state: "error"; error: string };

export const PROVIDER_LABELS: Record<EmoteProvider, string> = {
  twitch: "Twitch",
  "7tv": "7TV",
  bttv: "BetterTTV",
  ffz: "FrankerFaceZ",
};

export const THIRD_PARTY_PROVIDERS: ThirdPartyProvider[] = ["7tv", "bttv", "ffz"];
