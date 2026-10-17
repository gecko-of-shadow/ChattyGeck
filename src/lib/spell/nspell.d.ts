declare module "nspell" {
  interface NSpellInstance {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): void;
  }
  function nspell(aff: string, dic: string): NSpellInstance;
  export default nspell;
}
