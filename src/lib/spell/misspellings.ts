/** A word the spell checker wants underlined. Indexes are into the original text. */
export interface SpellSpan {
  start: number;
  end: number;
  word: string;
}

export interface SpellContext {
  /** True when this token is an emote name on the channel (any provider). */
  isEmote: (word: string) => boolean;
  /** Logins and display names that have spoken, compared case-insensitively. */
  chatters: ReadonlySet<string>;
  /** User dictionary, compared case-insensitively. */
  dictionary: ReadonlySet<string>;
  /** Ignored for this session, compared case-insensitively. */
  ignored: ReadonlySet<string>;
  /** Joined channels (logins and display names), compared case-insensitively. */
  channelNames?: ReadonlySet<string>;
  /** True for words lots of different chatters use (see chatWords.ts). */
  communityWord?: (word: string) => boolean;
  /** False when the dictionary waves every ALL-CAPS word through (Windows does), so "TEH" proves nothing. Default true. */
  allCapsForms?: boolean;
  /** Hunspell-style correct() — true when the word is in the language dictionary. */
  correct: (word: string) => boolean;
}

/** Everything but the dictionary: what's needed to decide which words to look up. */
export type VocabularyContext = Omit<SpellContext, "correct">;

const TOKEN = /\S+/g;
const WORD = /^[A-Za-z]+(?:'[A-Za-z]+)*$/;
/** Punctuation around a word: "(hello!!" -> "hello". */
const EDGES = /^[^A-Za-z']+|[^A-Za-z']+$/g;
/** The same letter three or more times in a row: "noooo", "yesss". */
const STRETCH = /([A-Za-z])\1{2,}/g;

function has(set: ReadonlySet<string>, word: string): boolean {
  return set.has(word.toLowerCase());
}

/** URLs and bare domains (twitch.tv, https://example.com/a). */
export function isUrlOrDomain(token: string): boolean {
  const bare = token.replace(/[),.;!?]+$/g, "");
  if (/^https?:\/\//i.test(bare)) return true;
  if (/^www\./i.test(bare)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(bare);
}

/**
 * The checkable word inside one chat token ("hello!!" -> "hello"), or "" for chat commands
 * (!uptime, /ban), @mentions, links, anything with digits, and tokens that are not plain letters.
 */
export function wordOf(raw: string): string {
  if (/^[!/@]/.test(raw) || /\d/.test(raw) || isUrlOrDomain(raw)) return "";
  const trimmed = raw.replace(EDGES, "");
  return WORD.test(trimmed) ? trimmed : "";
}

/**
 * Spellings worth trying before a word is underlined: stretched letters squeezed back
 * ("noooo" -> "noo", "no"), and for all-lowercase words the Capitalised and (when the
 * dictionary can judge them) ALL-CAPS forms ("chinese" -> "Chinese", "nasa" -> "NASA").
 */
export function spellVariants(word: string, allCaps = true): string[] {
  const forms = new Set([word, word.replace(STRETCH, "$1$1"), word.replace(STRETCH, "$1")]);
  for (const form of [...forms]) {
    if (form !== form.toLowerCase()) continue;
    forms.add(form[0].toUpperCase() + form.slice(1));
    if (allCaps) forms.add(form.toUpperCase());
  }
  return [...forms];
}

/** Chat vocabulary: emotes, people, channels, community words, and your own lists. */
function inVocabulary(word: string, ctx: VocabularyContext): boolean {
  return (
    ctx.isEmote(word) ||
    has(ctx.chatters, word) ||
    has(ctx.dictionary, word) ||
    has(ctx.ignored, word) ||
    (ctx.channelNames !== undefined && has(ctx.channelNames, word)) ||
    ctx.communityWord?.(word) === true
  );
}

/** Words that need a dictionary verdict: not commands, mentions, links, digits, emotes, single letters or short ALL-CAPS. */
function* checkable(text: string, ctx: VocabularyContext): Generator<{ word: string; start: number; forms: string[] }> {
  for (const match of text.matchAll(TOKEN)) {
    const raw = match[0];
    const word = wordOf(raw);
    if (!word || ctx.isEmote(raw)) continue;
    if (word.length === 1) continue;
    if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) continue;
    const forms = spellVariants(word, ctx.allCapsForms !== false);
    if (forms.some((form) => inVocabulary(form, ctx))) continue;
    yield { word, start: (match.index ?? 0) + raw.indexOf(word), forms };
  }
}

/** Every spelling to ask the dictionary about for this line, so one round trip answers the whole check. */
export function spellCandidates(text: string, ctx: VocabularyContext): string[] {
  const out = new Set<string>();
  for (const { forms } of checkable(text, ctx)) for (const form of forms) out.add(form);
  return [...out];
}

/**
 * Words that should be underlined. Never flags emotes, mentions, chatters, joined
 * channels, community words, a leading ! or / command, URLs, words with digits, short
 * ALL-CAPS, single letters, or the user/session dictionaries. Stretched ("noooo") and
 * lowercase ("chinese") spellings pass when their plain form does.
 */
export function findMisspellings(text: string, ctx: SpellContext): SpellSpan[] {
  const spans: SpellSpan[] = [];
  for (const { word, start, forms } of checkable(text, ctx)) {
    if (forms.some((form) => ctx.correct(form))) continue;
    spans.push({ start, end: start + word.length, word });
  }
  return spans;
}

/** Everyday words. Hunspell ranks "ten" ahead of "the" for "teh"; these win that tie. */
const COMMON_WORDS = new Set(
  "the be to of and a in that have i it for not on with he as you do at this but his by from they we her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take into your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us message hello".split(
    " ",
  ),
);

/**
 * At most `limit` suggestions. Common words and a shared first letter outrank the raw hunspell order,
 * so "teh" offers "the" before "ten".
 */
export function rankSuggestions(word: string, raw: readonly string[], limit = 5): string[] {
  const lower = word.toLowerCase();
  const ranked = raw.map((item, index) => {
    const key = item.toLowerCase();
    let score = index;
    if (COMMON_WORDS.has(key)) score -= 30;
    if (key[0] === lower[0]) score -= 2;
    score += Math.abs(key.length - lower.length) * 2;
    return { item, score };
  });
  ranked.sort((a, b) => a.score - b.score || a.item.localeCompare(b.item));
  return spellSuggestions(word, () => ranked.map((entry) => entry.item), limit);
}

/**
 * When a suggestion is the typed letters plus an apostrophe ("dont" -> "don't", "im" -> "I'm"),
 * it goes first. Everything else keeps its order.
 */
export function preferContraction(word: string, suggestions: readonly string[]): string[] {
  const bare = word.toLowerCase();
  const at = suggestions.findIndex((item) => /['’]/.test(item) && item.replace(/['’]/g, "").toLowerCase() === bare);
  if (at <= 0) return [...suggestions];
  return [suggestions[at], ...suggestions.slice(0, at), ...suggestions.slice(at + 1)];
}

/** At most `limit` unique suggestions, in the checker's order. */
export function spellSuggestions(word: string, suggest: (word: string) => readonly string[], limit = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of suggest(word)) {
    const clean = item.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Character index whose glyph sits under an x offset measured in the same units as `widthAt`.
 * `widthAt(i)` is the width of `text.slice(0, i)`.
 */
export function indexAtWidth(text: string, x: number, widthAt: (end: number) => number): number {
  if (x <= 0) return 0;
  let previous = 0;
  for (let i = 1; i <= text.length; i++) {
    const width = widthAt(i);
    if (width >= x) return width - x < x - previous ? i : i - 1;
    previous = width;
  }
  return text.length;
}

/**
 * Replace one flagged span. The caret goes just after the new word, or, when it was already past
 * the old word (after the space you typed), stays that far past the new one.
 */
export function replaceSpellWord(
  text: string,
  span: Pick<SpellSpan, "start" | "end">,
  next: string,
  caret?: number,
): { text: string; caret: number } {
  const shift = next.length - (span.end - span.start);
  return {
    text: `${text.slice(0, span.start)}${next}${text.slice(span.end)}`,
    caret: caret !== undefined && caret >= span.end ? caret + shift : span.start + next.length,
  };
}

/**
 * The flagged word you just typed: the one the caret is in or at the end of, or just past
 * by punctuation and at most one space ("teh|", "teh |", "teh,|"). Null when the spans are
 * stale for this text or the caret has moved on to another word.
 */
export function spellTarget(text: string, spans: readonly SpellSpan[], caret: number): SpellSpan | null {
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (caret < span.start) continue;
    if (text.slice(span.start, span.end) !== span.word) return null;
    if (caret <= span.end) return span;
    return /^[^\sA-Za-z']*\s?$/.test(text.slice(span.end, caret)) ? span : null;
  }
  return null;
}

/** A fix you picked, kept so the very next Backspace can put the old word back. */
export interface SpellFix {
  before: string;
  caretBefore: number;
  after: string;
  caretAfter: number;
}

/** What Backspace restores: the text before the fix, but only if nothing changed since and the caret sits where the fix left it. */
export function undoSpellFix(
  fix: SpellFix | null,
  text: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { text: string; caret: number } | null {
  if (!fix || text !== fix.after || selectionStart !== fix.caretAfter || selectionEnd !== fix.caretAfter) return null;
  return { text: fix.before, caret: fix.caretBefore };
}
