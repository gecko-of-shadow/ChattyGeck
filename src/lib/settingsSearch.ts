import { SKIN_ORDER, THEMES } from "@/lib/themes";
import { TAB_COMPLETE_HINT, TAB_COMPLETE_LABEL } from "@/store/settings";

/** One settings control that can be shown or hidden by search. */
export interface SettingsSearchRow {
  id: string;
  label: string;
  hint?: string;
  /** Choice button labels (e.g. Always, On hover, 1.5×). */
  choices?: string[];
}

export interface SettingsSearchSection {
  title: string;
  /** How many settings the section holds (shown next to it in the Settings list). */
  count?: number;
  rows: SettingsSearchRow[];
}

export type SectionFilterResult = { kind: "all" } | { kind: "rows"; ids: Set<string> } | null;

/**
 * Normalize query and row text the same way: trim, strip diacritics, Unicode
 * case-fold, turn punctuation/symbols into spaces (× → x so 1× matches 1x),
 * collapse repeated spaces.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/×/g, "x")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Non-empty normalized terms from a query (order irrelevant for matching). */
export function queryTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

/** True when every term is a substring of the normalized haystack. */
export function matchesTerms(haystack: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = normalizeSearchText(haystack);
  return terms.every((term) => hay.includes(term));
}

function rowSearchText(sectionTitle: string, row: SettingsSearchRow): string {
  return [sectionTitle, row.label, row.hint ?? "", ...(row.choices ?? [])].join(" ");
}

/**
 * Blank query → show everything.
 * Section title alone matches every term → keep header and all rows.
 * Else keep only matching rows; hide the section when none remain.
 */
export function filterSection(section: SettingsSearchSection, query: string): SectionFilterResult {
  const terms = queryTerms(query);
  if (terms.length === 0) return { kind: "all" };
  if (matchesTerms(section.title, terms)) return { kind: "all" };
  const ids = section.rows.filter((row) => matchesTerms(rowSearchText(section.title, row), terms)).map((row) => row.id);
  if (ids.length === 0) return null;
  return { kind: "rows", ids: new Set(ids) };
}

/** Whether any section would still show something for this query. */
export function anySectionMatches(sections: SettingsSearchSection[], query: string): boolean {
  if (queryTerms(query).length === 0) return true;
  return sections.some((section) => filterSection(section, query) !== null);
}

/**
 * Searchable catalog mirroring SettingsBody. Labels/hints/choices must stay in
 * sync with the UI copy — search only hides rows; it never changes values.
 */
export const SETTINGS_SEARCH_CATALOG: SettingsSearchSection[] = [
  {
    title: "Appearance",
    count: 6,
    rows: [
      // Built from the theme list so a new theme can't be missing from search.
      ...SKIN_ORDER.map((id) => ({ id, label: THEMES[id].name, hint: `Theme. ${THEMES[id].tag}. ${THEMES[id].blurb}` })),
      {
        id: "auto-choices",
        label: "Auto theme",
        hint: "When Windows is light use one theme, when dark use another. Follows Windows light and dark mode.",
      },
      {
        id: "text-size",
        label: "Text size",
        hint: "Any size from 10 to 40px. Emotes grow and shrink with the text.",
        choices: ["Small", "Medium", "Large", "Huge"],
      },
      { id: "timestamps", label: "Timestamps" },
      { id: "24h", label: "24-hour clock" },
      { id: "badges", label: "Badges", hint: "Mod, VIP, sub and other chat badges" },
      { id: "zebra", label: "Striped rows", hint: "Shade every other line" },
    ],
  },
  {
    title: "Chat & mentions",
    count: 9,
    rows: [
      {
        id: "deleted",
        label: "Show deleted messages",
        hint: "Keep what a mod removed readable, faded and crossed out, instead of hiding it",
      },
      {
        id: "highlight",
        label: "Highlight words",
        hint: "Besides your own name, messages with these words light up and count as mentions.",
      },
      {
        id: "mention-sound",
        label: "Mention sound",
        hint: "A short chime when your name, a reply to you, or a highlight word shows up in any open chat. When on: cooldown and a Play preview.",
      },
      {
        id: "confirm-channel",
        label: "Confirm channel before typing",
        hint: "The message box stays locked until you confirm the channel, so you don't send in the wrong room when several chats are open.",
      },
      {
        id: "read-only",
        label: "Read only",
        hint: "Hide the message box so you can watch without accidentally chatting. Ctrl+Shift+R also switches it.",
      },
      {
        id: "spell",
        label: "Spell check",
        hint: "Wavy underlines in the message box. Emotes, names, commands and links are left alone. Edge's checker stays off. When on: language and your dictionary.",
        choices: ["English (US)"],
      },
    ],
  },
  {
    title: "Emotes",
    count: 11,
    rows: [
      {
        id: "sources",
        label: "Emote sources",
        hint: "Twitch's own emotes always show. Switch a source off and its emotes turn back into plain words.",
        choices: ["7TV", "BetterTTV", "FrankerFaceZ"],
      },
      { id: "size", label: "Emote size", choices: ["1×", "1.5×", "2×"] },
      { id: "anim", label: "Moving emotes", choices: ["Always", "On hover", "Never"] },
      {
        id: "overlays",
        label: "Overlay emotes",
        hint: "Zero-width emotes stack on top of the one before them",
      },
      {
        id: "preview",
        label: "Preview on hover",
        hint: "Point at an emote to see it big with its name and source",
      },
      {
        id: "tab",
        label: TAB_COMPLETE_LABEL,
        hint: TAB_COMPLETE_HINT,
      },
      {
        id: "picker",
        label: "Emote menu",
        hint: "The smiley button next to Send",
      },
      {
        id: "remember",
        label: "Remember emotes",
        hint: "Keep emote lists on this device so pictures show the moment a channel opens",
      },
      {
        id: "blocked",
        label: "Blocked emotes",
        hint: "Names that should stay plain text. One per line (spaces and commas work too).",
      },
      {
        id: "problems",
        label: "Emote problems",
        hint: "When a 7TV, BetterTTV or FrankerFaceZ download fails, the last 20 times are listed here so you can see why emotes went quiet.",
      },
    ],
  },
  {
    title: "Per channel",
    count: 1,
    rows: [
      {
        id: "overrides",
        label: "Per channel overrides",
        hint: "Switch features off on one channel only: add the channel, then untick what you don't want there.",
        choices: [
          "7TV",
          "BetterTTV",
          "FrankerFaceZ",
          "Overlay emotes",
          TAB_COMPLETE_LABEL,
          "Emote menu",
          "Preview on hover",
          "Highlight words",
          "Show deleted messages",
        ],
      },
    ],
  },
  {
    title: "Window & startup",
    count: 3,
    rows: [
      {
        id: "tray",
        label: "Close to tray",
        hint: "Closing the window keeps ZooChattr running in the system tray, so your chats stay connected. Right-click the tray icon and choose Quit to exit — you'll get a confirmation first.",
      },
      {
        id: "startup",
        label: "Start with Windows",
        hint: "Open ZooChattr when you sign in to Windows. Uses a shortcut in your Startup folder.",
      },
      {
        id: "grid-slots",
        label: "Grid slots",
        hint: "How many chats show at once; 1 is a single chat. The same switch as at the bottom right.",
        choices: ["1", "2", "3", "4", "6", "9"],
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        hint: "Ctrl+G grid and single. Ctrl+K switch channel. The ⋯ on a pane picks or adds a channel. Menu key or Shift+F10 in the channel picker. Ctrl+1 to 9. Ctrl+Tab. Alt+Shift+Arrow. Esc. Ctrl+Shift+R read only. Ctrl+Shift+H hide the bottom bar. Ctrl+Enter saves a word list.",
      },
    ],
  },
  {
    title: "Account & history",
    count: 4,
    rows: [
      {
        id: "login",
        label: "Twitch account",
        hint: "Log in with Twitch, log out. Not logged in: you can read any channel anonymously. Can chat.",
      },
      {
        id: "client-id",
        label: "Twitch Client ID",
        hint: "This copy of ZooChattr ships with a Client ID, so login works out of the box. Custom Client ID: clear the field and save to go back to the built-in one. Reading chat works anyway; login needs one.",
      },
      {
        id: "history",
        label: "Remember chat history",
        hint: "Keeps about 48 hours of messages per channel in ZooChattr-data so logs come back after you quit. Turn off to stop saving (and wipe what's stored).",
      },
      {
        id: "history-server",
        label: "History server",
        hint: "Your own chat logger. At startup ZooChattr fills in what was said while it was closed. Address and read token.",
      },
      { id: "clear-history", label: "Clear saved chat history", hint: "Deletes the chat saved on this PC." },
    ],
  },
  {
    title: "About & data",
    count: 1,
    rows: [
      {
        id: "auto-updates",
        label: "Check for updates automatically",
        hint: "Looks on GitHub when ZooChattr starts and every few hours. You'll get a toast if a newer portable build is out.",
      },
      {
        id: "check-now",
        label: "Check now",
        hint: "Install update Releases version",
      },
      {
        id: "paths",
        label: "This copy of ZooChattr",
        hint: "Portable data lives next to ZooChattr. Mode, settings folder, login store, version.",
      },
      {
        id: "backup",
        label: "Back up, restore and reset",
        hint: "Back up, Restore from file, and Reset settings. Backups hold your preferences, favourites and channel list as plain JSON.",
      },
    ],
  },
];

export interface SettingsSearchHelpers {
  query: string;
  hasMatches: boolean;
  sectionVisible: (title: string) => boolean;
  rowVisible: (title: string, id: string) => boolean;
}

/** Precompute visibility for every catalog section against a query. */
export function settingsSearchHelpers(query: string): SettingsSearchHelpers {
  const results = new Map(
    SETTINGS_SEARCH_CATALOG.map((section) => [section.title, filterSection(section, query)] as const),
  );
  return {
    query,
    hasMatches: anySectionMatches(SETTINGS_SEARCH_CATALOG, query),
    sectionVisible: (title) => results.get(title) != null,
    rowVisible: (title, id) => {
      const result = results.get(title);
      if (result == null) return false;
      if (result.kind === "all") return true;
      return result.ids.has(id);
    },
  };
}
