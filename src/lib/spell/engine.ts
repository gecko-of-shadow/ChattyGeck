import type { NSpellInstance } from "./nspell-types";

export interface SpellEngine {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

/** Languages the checker knows how to load. Add a dictionary pair here to offer another. */
const SPELL_LANGUAGES = [{ id: "en-US", label: "English (US)", aff: "en-US.aff", dic: "en-US.dic" }] as const;

export type SpellLanguageId = (typeof SPELL_LANGUAGES)[number]["id"];

const engines = new Map<string, Promise<SpellEngine>>();

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

/** Load a language off the keystroke path. Repeated calls share one in-flight promise. */
export function loadSpellEngine(language: SpellLanguageId = "en-US"): Promise<SpellEngine> {
  const existing = engines.get(language);
  if (existing) return existing;
  const spec = SPELL_LANGUAGES.find((item) => item.id === language) ?? SPELL_LANGUAGES[0];
  const pending = (async () => {
    const [mod, aff, dic] = await Promise.all([import("nspell"), readAsset(spec.aff), readAsset(spec.dic)]);
    return factoryOf(mod)(aff, dic);
  })();
  engines.set(spec.id, pending);
  return pending;
}
