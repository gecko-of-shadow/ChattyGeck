import { contrastRatio, THEME_TOKENS } from "@/lib/themeTokens";
import type { ConcreteSkin } from "@/lib/themes";

/** Twitch's default name colours, used when a chatter never picked one. */
const DEFAULT_NAME_COLORS = [
  "#FF0000",
  "#0000FF",
  "#008000",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#1E90FF",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
];

/** Accent colours for channel avatars. */
const CHANNEL_TAG_COLORS = [
  "#9be15d",
  "#f6b73c",
  "#ff8a4c",
  "#b9a2ff",
  "#6cc4ff",
  "#ff6f91",
  "#5fe0c0",
  "#e8d27a",
  "#c2f07a",
  "#ffa6c9",
];

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function channelColor(channel: string): string {
  return CHANNEL_TAG_COLORS[hashString(channel) % CHANNEL_TAG_COLORS.length];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: [number, number, number], b: [number, number, number], amount: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

/** Warm themes pull every name a little toward their text colour so bright blues don't undo the low-glare idea. */
const WARM_BLEND: Partial<Record<ConcreteSkin, number>> = { eyecomfort: 0.4, "eyecomfort-light": 0.25 };
const MIN_NAME_CONTRAST = 4.5;

/** Zebra stripes tint rows 4% toward the text colour (index.css). */
const ZEBRA_TINT = 0.04;

/** Every background a chat row can sit on: page, panel, mention highlight, and the striped versions of the first two. */
export function rowBackgrounds(skin: ConcreteSkin): string[] {
  const t = THEME_TOKENS[skin];
  const text = hexToRgb(t.text)!;
  const striped = (hex: string) => toHex(mix(hexToRgb(hex)!, text, ZEBRA_TINT));
  return [t.bg, t.surface, t.mention, striped(t.bg), striped(t.surface)];
}

const readableCache = new Map<string, string>();

/**
 * A chatter's name colour, nudged toward the theme's text colour until it reads at 4.5:1 or better on every row
 * background ({@link rowBackgrounds}).
 */
export function readableNameColor(color: string | undefined, login: string, skin: ConcreteSkin = "crested"): string {
  const source = color || DEFAULT_NAME_COLORS[hashString(login) % DEFAULT_NAME_COLORS.length];
  const key = `${skin}|${source}`;
  const cached = readableCache.get(key);
  if (cached) return cached;
  const tokens = THEME_TOKENS[skin];
  const text = hexToRgb(tokens.text)!;
  let rgb = hexToRgb(source);
  let result = source;
  if (rgb) {
    rgb = mix(rgb, text, WARM_BLEND[skin] ?? 0);
    const backgrounds = rowBackgrounds(skin);
    const readable = (hex: string) => backgrounds.every((bg) => contrastRatio(hex, bg) >= MIN_NAME_CONTRAST);
    let step = 0;
    while (!readable(toHex(rgb)) && step < 20) {
      rgb = mix(rgb, text, 0.1);
      step++;
    }
    result = readable(toHex(rgb)) ? toHex(rgb) : tokens.text;
  }
  readableCache.set(key, result);
  return result;
}
