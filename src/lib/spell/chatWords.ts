import type { ChatMessage } from "@/lib/twitch/types";
import { wordOf } from "./misspellings";

/** A word keeps counting this long after a chatter used it. Same window as saved chat history. */
const WORD_TTL_MS = 48 * 60 * 60_000;
/** Different chatters who must use a word before the spell checker treats it as chat vocabulary. */
const MIN_CHATTERS = 3;
/** Most words (and Twitch emote names) kept; the least recently used go first. */
const MAX_WORDS = 50_000;
const MAX_TWITCH_EMOTES = 20_000;
const PRUNE_EVERY_MS = 10 * 60_000;

/**
 * Contractions typed without the apostrophe. Plenty of chatters write "dont", but it stays
 * underlined so the checker can still offer "don't".
 */
const MISSING_APOSTROPHE = new Set(
  "dont doesnt didnt isnt arent wasnt werent hasnt havent hadnt wouldnt couldnt shouldnt mustnt neednt im ive youre youve youll youd theyre theyve theyll theyd weve hes shes thats whats wheres whos theres heres hows aint itll thatll wouldve couldve shouldve mightve mustve".split(
    " ",
  ),
);

/** Who used a word and when, newest first, at most MIN_CHATTERS entries. */
type Uses = [chatter: string, ts: number][];

/** Map order doubles as least-recently-used order: re-inserting moves a key to the end. */
function remember<V>(map: Map<string, V>, key: string, value: V, cap: number): void {
  map.delete(key);
  map.set(key, value);
  if (map.size <= cap) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) map.delete(oldest);
}

/**
 * Chat vocabulary the spell checker leaves alone: words three different chatters used in the
 * last 48 hours, and Twitch emote names seen in chat. Only the newest three users of each word
 * are kept, which is all that rule needs.
 */
export class ChatWords {
  private readonly ttl: number;
  private words = new Map<string, Uses>();
  private twitchEmotes = new Map<string, number>();
  private prunedAt = 0;

  constructor(ttl = WORD_TTL_MS) {
    this.ttl = ttl;
  }

  /** Fold in chat rows, live or restored from disk. Noting the same row twice changes nothing. */
  note(messages: readonly ChatMessage[], now = Date.now()): void {
    for (const message of messages) {
      if ((message.kind !== "chat" && message.kind !== "action") || message.pending) continue;
      if (message.twitchEmotes?.length) this.noteTwitchEmotes(message);
      // Your own lines and moderator-deleted ones don't teach the checker any words.
      if (message.self || message.deleted) continue;
      const chatter = message.userId || message.login;
      if (!chatter) continue;
      for (const raw of message.text.split(/\s+/)) {
        const word = wordOf(raw).toLowerCase();
        if (word) this.use(word, chatter, message.ts);
      }
    }
    if (now - this.prunedAt > PRUNE_EVERY_MS) this.prune(now);
  }

  /** Like note(), a couple of thousand rows at a time, so a big restored history doesn't stall the window. */
  async noteGradually(messages: readonly ChatMessage[], chunk = 2_000): Promise<void> {
    for (let start = 0; start < messages.length; start += chunk) {
      if (start > 0) await new Promise((resolve) => setTimeout(resolve, 0));
      this.note(messages.slice(start, start + chunk));
    }
  }

  /** Three different chatters used `word` in the last 48 hours. Missing-apostrophe contractions never count. */
  isCommunityWord(word: string, now = Date.now()): boolean {
    const key = word.toLowerCase();
    if (MISSING_APOSTROPHE.has(key)) return false;
    const uses = this.words.get(key);
    return !!uses && uses.length >= MIN_CHATTERS && uses[MIN_CHATTERS - 1][1] >= now - this.ttl;
  }

  /** A Twitch emote with this name showed up in chat in the last 48 hours. */
  isTwitchEmote(word: string, now = Date.now()): boolean {
    const seen = this.twitchEmotes.get(word.toLowerCase());
    return seen !== undefined && seen >= now - this.ttl;
  }

  /** Drops words and emotes nobody used in the last 48 hours. */
  prune(now = Date.now()): void {
    this.prunedAt = now;
    const cutoff = now - this.ttl;
    for (const [word, uses] of this.words) if (uses[0][1] < cutoff) this.words.delete(word);
    for (const [name, seen] of this.twitchEmotes) if (seen < cutoff) this.twitchEmotes.delete(name);
  }

  private use(word: string, chatter: string, ts: number): void {
    const uses = this.words.get(word) ?? [];
    const mine = uses.findIndex(([who]) => who === chatter);
    if (mine >= 0) {
      if (uses[mine][1] >= ts) return;
      uses.splice(mine, 1);
    }
    const at = uses.findIndex(([, seen]) => seen < ts);
    uses.splice(at < 0 ? uses.length : at, 0, [chatter, ts]);
    if (uses.length > MIN_CHATTERS) uses.length = MIN_CHATTERS;
    remember(this.words, word, uses, MAX_WORDS);
  }

  private noteTwitchEmotes(message: ChatMessage): void {
    // Emote ranges count code points, so emoji earlier in the line don't shift them.
    const chars = Array.from(message.text);
    for (const range of message.twitchEmotes) {
      if (range.start < 0 || range.end >= chars.length) continue;
      const name = chars.slice(range.start, range.end + 1).join("").toLowerCase();
      if ((this.twitchEmotes.get(name) ?? -Infinity) >= message.ts) continue;
      remember(this.twitchEmotes, name, message.ts, MAX_TWITCH_EMOTES);
    }
  }
}

/** One shared copy: the chat controller feeds it, every message box reads it. */
export const chatWords = new ChatWords();
