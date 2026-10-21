import * as platform from "@/lib/platform";
import { preferContraction, rankSuggestions, spellSuggestions } from "./misspellings";
import type { NSpellInstance } from "./nspell-types";

export interface SpellEngine {
  /** "windows" is Windows' own spell checker; "nspell" is the bundled dictionary (browser, mock, other systems). */
  kind: "windows" | "nspell";
  /** False when the dictionary waves every ALL-CAPS word through, so "TEH" can't stand in for "teh". */
  judgesAllCaps: boolean;
  /** For each word, whether it is spelled right. */
  check(words: readonly string[]): Promise<boolean[]>;
  /** The dictionary's own suggestions for one word. */
  suggest(word: string): Promise<string[]>;
}

/** How the Windows engine reaches Windows: through Rust in the desktop app, or a stand-in in tests. */
export interface SpellBackend {
  check(language: string, words: string[]): Promise<boolean[]>;
  suggest(language: string, word: string): Promise<string[]>;
}

const DESKTOP: SpellBackend = { check: platform.spellCheck, suggest: platform.spellSuggest };

/** Languages the checker knows how to load. Add a dictionary pair here to offer another. */
const SPELL_LANGUAGES = [{ id: "en-US", label: "English (US)", aff: "en-US.aff", dic: "en-US.dic" }] as const;

export type SpellLanguageId = (typeof SPELL_LANGUAGES)[number]["id"];

/** Answers remembered per engine, so checking the same line again doesn't ask Windows again. */
const CHECK_MEMORY = 5_000;
const SUGGEST_MEMORY = 500;
/** Short all-lowercase words that may be acronyms typed in lowercase ("nasa", "fbi"). */
const ACRONYM = /^[a-z]{2,5}$/;

const engines = new Map<string, Promise<SpellEngine>>();

/** Map order doubles as least-recently-used order: re-inserting moves a key to the end. */
function remember<V>(map: Map<string, V>, key: string, value: V, cap: number): void {
  map.delete(key);
  map.set(key, value);
  if (map.size <= cap) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) map.delete(oldest);
}

/**
 * Windows' own spell checker (Check and Suggest only). It skips ALL-CAPS words, so "nasa" can't be
 * tested as "NASA"; a short lowercase word passes instead when Windows itself suggests its capitals.
 */
export function windowsEngine(language: string, backend: SpellBackend = DESKTOP): SpellEngine {
  const known = new Map<string, boolean>();
  const fixes = new Map<string, string[]>();
  const suggest = async (word: string): Promise<string[]> => {
    const hit = fixes.get(word);
    if (hit) return hit;
    const list = await backend.suggest(language, word);
    remember(fixes, word, list, SUGGEST_MEMORY);
    return list;
  };
  return {
    kind: "windows",
    judgesAllCaps: false,
    async check(words) {
      const verdicts = new Map<string, boolean>();
      for (const word of words) {
        const hit = known.get(word);
        if (hit !== undefined) verdicts.set(word, hit);
      }
      const missing = [...new Set(words)].filter((word) => !verdicts.has(word));
      if (missing.length) {
        const answers = await backend.check(language, missing);
        for (const [i, word] of missing.entries()) {
          let ok = answers[i] !== false;
          if (!ok && ACRONYM.test(word)) ok = (await suggest(word)).includes(word.toUpperCase());
          verdicts.set(word, ok);
          remember(known, word, ok, CHECK_MEMORY);
        }
      }
      return words.map((word) => verdicts.get(word) !== false);
    },
    suggest,
  };
}

function nspellEngine(checker: NSpellInstance): SpellEngine {
  return {
    kind: "nspell",
    judgesAllCaps: true,
    check: async (words) => words.map((word) => checker.correct(word)),
    suggest: async (word) => checker.suggest(word),
  };
}

function dictionaryUrl(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}spell/${file}`;
}

async function readAsset(file: string): Promise<string> {
  const response = await fetch(dictionaryUrl(file));
  if (!response.ok) throw new Error(`Couldn't load spell dictionary ${file}`);
  return response.text();
}

function factoryOf(mod: unknown): (aff: string, dic: string) => NSpellInstance {
  const record = mod as { default?: unknown };
  const candidate = typeof record.default === "function" ? record.default : mod;
  if (typeof candidate === "function") return candidate as (aff: string, dic: string) => NSpellInstance;
  throw new Error("nspell did not load");
}

/**
 * Load a language off the keystroke path. Repeated calls share one in-flight promise. Inside the
 * desktop app this is Windows' own checker; the browser dev build, the mock and other systems (or a
 * Windows without that language) use the bundled dictionary.
 */
export function loadSpellEngine(language: SpellLanguageId = "en-US"): Promise<SpellEngine> {
  const existing = engines.get(language);
  if (existing) return existing;
  const spec = SPELL_LANGUAGES.find((item) => item.id === language) ?? SPELL_LANGUAGES[0];
  const pending = (async () => {
    if (platform.isTauri) {
      const windows = windowsEngine(spec.id);
      try {
        await windows.check(["hello"]);
        return windows;
      } catch {
        // No Windows checker here; fall through to the bundled dictionary.
      }
    }
    const [mod, aff, dic] = await Promise.all([import("nspell"), readAsset(spec.aff), readAsset(spec.dic)]);
    return nspellEngine(factoryOf(mod)(aff, dic));
  })();
  engines.set(spec.id, pending);
  return pending;
}

/**
 * Up to `limit` fixes for a flagged word, best first. Windows' order is kept; the bundled
 * dictionary's is re-ranked. Either way a matching contraction ("don't" for "dont") leads.
 */
export async function suggestFixes(engine: SpellEngine, word: string, limit = 5): Promise<string[]> {
  const raw = await engine.suggest(word);
  const ordered = engine.kind === "nspell" ? rankSuggestions(word, raw, raw.length) : raw;
  return spellSuggestions(word, () => preferContraction(word, ordered), limit);
}
