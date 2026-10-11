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

/** Gecko morph colours for channel tags in the merged feed. */
export const CHANNEL_TAG_COLORS = [
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

export function hashString(text: string): number {
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

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const readableCache = new Map<string, string>();

/** Lifts dark name colours (pure blue, dark green…) so they stay legible on the dark UI. */
export function readableNameColor(color: string | undefined, login: string): string {
  const source = color || DEFAULT_NAME_COLORS[hashString(login) % DEFAULT_NAME_COLORS.length];
  const cached = readableCache.get(source);
  if (cached) return cached;
  const rgb = hexToRgb(source);
  let result = source;
  if (rgb) {
    const [h, s, l] = rgbToHsl(...rgb);
    const minLightness = h > 200 && h < 290 ? 0.68 : 0.6;
    if (l < minLightness) result = `hsl(${h.toFixed(0)} ${(Math.min(s, 0.9) * 100).toFixed(0)}% ${(minLightness * 100).toFixed(0)}%)`;
  }
  readableCache.set(source, result);
  return result;
}
