import { normalizeChannelName } from "@/lib/twitch/messages";

export type Skin = "shadow" | "leopard" | "crested" | "tokay" | "day";
export type FontSize = "sm" | "md" | "lg";
export type ViewMode = "merged" | "focused";

export interface Settings {
  version: 1;
  channels: string[];
  mode: ViewMode;
  focused: string | null;
  /** Composer target while in merged mode. */
  sendTarget: string | null;
  skin: Skin;
  showTimestamps: boolean;
  use24h: boolean;
  showBadges: boolean;
  fontSize: FontSize;
  /** Alternate row shading. */
  zebra: boolean;
  /** Overrides the Client ID baked in at build time. */
  clientId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  channels: [],
  mode: "focused",
  focused: null,
  sendTarget: null,
  skin: "shadow",
  showTimestamps: true,
  use24h: true,
  showBadges: true,
  fontSize: "md",
  zebra: false,
  clientId: "",
};

export const SKINS: { id: Skin; name: string; blurb: string }[] = [
  { id: "shadow", name: "Shadow gecko", blurb: "Neon green on midnight. The house style." },
  { id: "leopard", name: "Leopard gecko", blurb: "Sunny yellow with dark spots." },
  { id: "crested", name: "Crested gecko", blurb: "Warm tangerine with cream crests." },
  { id: "tokay", name: "Tokay gecko", blurb: "Slate blue with orange spots." },
  { id: "day", name: "Day gecko", blurb: "Electric green with red speckles." },
];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Accepts whatever was on disk and returns a valid Settings object. */
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
  const sendTarget =
    typeof input.sendTarget === "string" && channels.includes(input.sendTarget) ? input.sendTarget : focused;

  return {
    version: 1,
    channels,
    mode: pick(input.mode, ["merged", "focused"] as const, DEFAULT_SETTINGS.mode),
    focused,
    sendTarget,
    skin: pick(input.skin, SKINS.map((s) => s.id), DEFAULT_SETTINGS.skin),
    showTimestamps: bool(input.showTimestamps, DEFAULT_SETTINGS.showTimestamps),
    use24h: bool(input.use24h, DEFAULT_SETTINGS.use24h),
    showBadges: bool(input.showBadges, DEFAULT_SETTINGS.showBadges),
    fontSize: pick(input.fontSize, ["sm", "md", "lg"] as const, DEFAULT_SETTINGS.fontSize),
    zebra: bool(input.zebra, DEFAULT_SETTINGS.zebra),
    clientId: typeof input.clientId === "string" ? input.clientId.trim() : "",
  };
}
