import { twitchEmote } from "@/lib/emotes/providers";
import type { Emote } from "@/lib/emotes/types";
import type { TwitchEmoteRange } from "@/lib/twitch/types";

export type Fragment =
  | { type: "text"; text: string }
  | { type: "emote"; emote: Emote; overlays: Emote[] }
  | { type: "mention"; text: string; login: string }
  | { type: "link"; text: string; href: string };

const URL_RE =
  /^(?:https?:\/\/\S+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+\S*|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tv|gg|io|co|me|dev|app|be|ly|xyz|live|tw|uk|de|fr|jp|ca)(?:\/\S*)?)$/i;
const TRAILING_PUNCT = /[.,!?;:)\]}'"]+$/;
const MENTION_RE = /^@([a-z0-9_]{2,25})([.,!?;:]*)$/i;

function pushText(out: Fragment[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.text += text;
  else out.push({ type: "text", text });
}

function pushEmote(out: Fragment[], emote: Emote): void {
  if (emote.zeroWidth) {
    // Overlay onto the previous emote, skipping the single space between them.
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last?.type === "emote") {
      last.overlays.push(emote);
      return;
    }
    if (last?.type === "text" && /^\s+$/.test(last.text) && prev?.type === "emote") {
      out.pop();
      prev.overlays.push(emote);
      return;
    }
  }
  out.push({ type: "emote", emote, overlays: [] });
}

function tokenizeWords(out: Fragment[], text: string, lookup: (word: string) => Emote | undefined): void {
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      pushText(out, part);
      continue;
    }
    const emote = lookup(part);
    if (emote) {
      pushEmote(out, emote);
      continue;
    }
    const mention = part.match(MENTION_RE);
    if (mention) {
      out.push({ type: "mention", text: `@${mention[1]}`, login: mention[1].toLowerCase() });
      pushText(out, mention[2]);
      continue;
    }
    const trailing = part.match(TRAILING_PUNCT)?.[0] ?? "";
    const candidate = trailing ? part.slice(0, -trailing.length) : part;
    if (candidate && URL_RE.test(candidate)) {
      const href = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
      out.push({ type: "link", text: candidate, href });
      pushText(out, trailing);
      continue;
    }
    pushText(out, part);
  }
}

/**
 * Splits a chat line into text / emote / mention / link fragments.
 * Twitch emote ranges are code-point offsets, so we index by code point, not UTF-16 unit.
 */
export function tokenize(
  text: string,
  twitchEmotes: TwitchEmoteRange[],
  lookup: (word: string) => Emote | undefined,
): Fragment[] {
  const out: Fragment[] = [];
  if (!twitchEmotes.length) {
    tokenizeWords(out, text, lookup);
    return out;
  }

  const chars = Array.from(text);
  let cursor = 0;
  for (const range of twitchEmotes) {
    if (range.start < cursor || range.end >= chars.length) continue;
    tokenizeWords(out, chars.slice(cursor, range.start).join(""), lookup);
    const name = chars.slice(range.start, range.end + 1).join("");
    out.push({ type: "emote", emote: twitchEmote(range.id, name), overlays: [] });
    cursor = range.end + 1;
  }
  tokenizeWords(out, chars.slice(cursor).join(""), lookup);
  return out;
}
