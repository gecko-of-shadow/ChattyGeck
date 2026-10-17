export interface NSpellInstance {
  correct(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): void;
}
