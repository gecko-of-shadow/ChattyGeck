const env = import.meta.env;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Endpoint overrides exist so the mock Twitch server (scripts/mock-twitch.mjs) can stand in for Twitch. */
export const config = {
  ircUrl: env.VITE_TWITCH_IRC_URL || "wss://irc-ws.chat.twitch.tv:443",
  authBase: trimSlash(env.VITE_TWITCH_AUTH_BASE || "https://id.twitch.tv"),
  helixBase: trimSlash(env.VITE_TWITCH_HELIX_BASE || "https://api.twitch.tv/helix"),
  sevenTvBase: trimSlash(env.VITE_7TV_API || "https://7tv.io/v3"),
  bttvBase: trimSlash(env.VITE_BTTV_API || "https://api.betterttv.net/3"),
  ffzBase: trimSlash(env.VITE_FFZ_API || "https://api.frankerfacez.com/v1"),
  builtInClientId: (env.TWITCH_CLIENT_ID || "").trim(),
  // user:read:follows: the top strip shows the channels you follow on Twitch (Bran's choice, Q1 A).
  scopes: ["chat:read", "chat:edit", "user:read:follows"],
  messageCapPerChannel: 400,
} as const;
