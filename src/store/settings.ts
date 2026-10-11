import { DEFAULT_SKIN, SKIN_ORDER, type Skin } from "@/lib/themes";
import { normalizeChannelName } from "@/lib/twitch/messages";

export type { Skin } from "@/lib/themes";
export type FontSize = "sm" | "md" | "lg";
/** `grid`: every channel in its own box. `focused`: one channel fills the window. */
export type ViewMode = "grid" | "focused";

export interface Settings {
  version: 1;
  channels: string[];
  mode: ViewMode;
  focused: string | null;
  skin: Skin;
  showTimestamps: boolean;
  use24h: boolean;
  showBadges: boolean;
  fontSize: FontSize;
  /** Alternate row shading. */
  zebra: boolean;
  /** Closing the window hides ZooChattr in the system tray instead of quitting. */
  closeToTray: boolean;
  /** Overrides the Client ID baked in at build time. */
  clientId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  channels: [],
  mode: "grid",
  focused: null,
  skin: DEFAULT_SKIN,
  showTimestamps: true,
  use24h: true,
  showBadges: true,
  fontSize: "md",
  zebra: false,
  closeToTray: true,
  clientId: "",
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Accepts whatever was on disk (including older versions) and returns a valid Settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const channels: string[] = [];
  if (Array.isArray(input.channels)) {
    for (const entry of input.channels) {
      const name = typeof entry === "string" ? normalizeChannelName(entry) : null;
      if (name && !channels.includes(name)) channels.push(name);
    }
  }
  const focused = typeof input.focused === "string" && channels.includes(input.focused) ? input.focused : (channels[0] ?? null);
  // Older builds had a "merged" feed; the grid replaces it.
  const mode = input.mode === "merged" ? "grid" : pick(input.mode, ["grid", "focused"] as const, DEFAULT_SETTINGS.mode);

  return {
    version: 1,
    channels,
    mode,
    focused,
    skin: pick(input.skin, SKIN_ORDER, DEFAULT_SETTINGS.skin),
    showTimestamps: bool(input.showTimestamps, DEFAULT_SETTINGS.showTimestamps),
    use24h: bool(input.use24h, DEFAULT_SETTINGS.use24h),
    showBadges: bool(input.showBadges, DEFAULT_SETTINGS.showBadges),
    fontSize: pick(input.fontSize, ["sm", "md", "lg"] as const, DEFAULT_SETTINGS.fontSize),
    zebra: bool(input.zebra, DEFAULT_SETTINGS.zebra),
    closeToTray: bool(input.closeToTray, DEFAULT_SETTINGS.closeToTray),
    clientId: typeof input.clientId === "string" ? input.clientId.trim() : "",
  };
}
