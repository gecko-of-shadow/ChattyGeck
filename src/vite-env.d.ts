/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly TWITCH_CLIENT_ID?: string;
  readonly VITE_TWITCH_IRC_URL?: string;
  readonly VITE_TWITCH_AUTH_BASE?: string;
  readonly VITE_TWITCH_HELIX_BASE?: string;
  readonly VITE_7TV_API?: string;
  readonly VITE_BTTV_API?: string;
  readonly VITE_FFZ_API?: string;
  /** Built-in history server address (an https origin). Never a token. */
  readonly VITE_HISTORY_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
