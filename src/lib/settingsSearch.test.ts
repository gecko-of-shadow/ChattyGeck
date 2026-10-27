import { describe, expect, it } from "vitest";
import {
  SETTINGS_SEARCH_CATALOG,
  anySectionMatches,
  filterSection,
  matchesTerms,
  normalizeSearchText,
  queryTerms,
  type SettingsSearchSection,
} from "./settingsSearch";
import { SKIN_ORDER, THEMES } from "./themes";

const sample: SettingsSearchSection[] = [
  {
    title: "Window",
    rows: [
      { id: "tray", label: "Close to tray", hint: "Keeps ZooChattr running in the system tray" },
      { id: "startup", label: "Start with Windows", hint: "Open ZooChattr when you sign in" },
    ],
  },
  {
    title: "Emotes",
    rows: [
      {
        id: "tab",
        label: "Tab finishes emote names",
        hint: "Type the first letters, press Tab; Tab again cycles the matches",
      },
      {
        id: "anim",
        label: "Moving emotes",
        choices: ["Always", "On hover", "Never"],
      },
      {
        id: "size",
        label: "Emote size",
        choices: ["1×", "1.5×", "2×"],
      },
    ],
  },
  {
    title: "Chat display",
    rows: [{ id: "clock", label: "24-hour clock" }],
  },
];

describe("normalizeSearchText", () => {
  it("strips diacritics and case-folds", () => {
    expect(normalizeSearchText("  ÉMote ")).toBe("emote");
  });

  it("turns punctuation into spaces and unifies × with x", () => {
    expect(normalizeSearchText("24-hour")).toBe("24 hour");
    expect(normalizeSearchText("1×")).toBe("1x");
    expect(normalizeSearchText("1.5×")).toBe("1 5x");
  });

  it("collapses repeated spaces", () => {
    expect(normalizeSearchText("tab   emote")).toBe("tab emote");
  });
});

describe("queryTerms / matchesTerms", () => {
  it("splits into terms and requires every term as a substring", () => {
    expect(queryTerms("  tab  emote ")).toEqual(["tab", "emote"]);
    const hay = "Emotes Tab finishes emote names";
    expect(matchesTerms(hay, queryTerms("tab emote"))).toBe(true);
    expect(matchesTerms(hay, queryTerms("emote tab"))).toBe(true);
    expect(matchesTerms(hay, queryTerms("tab zebra"))).toBe(false);
  });

  it("treats blank query as no terms", () => {
    expect(queryTerms("   ")).toEqual([]);
    expect(matchesTerms("anything", [])).toBe(true);
  });
});

describe("filterSection", () => {
  it("shows everything for a blank query", () => {
    expect(filterSection(sample[0], "")).toEqual({ kind: "all" });
    expect(filterSection(sample[0], "  ")).toEqual({ kind: "all" });
  });

  it("keeps the whole section when the title alone matches", () => {
    expect(filterSection(sample[0], "window")).toEqual({ kind: "all" });
  });

  it("keeps only matching rows otherwise", () => {
    const result = filterSection(sample[1], "tab emote");
    expect(result).toEqual({ kind: "rows", ids: new Set(["tab"]) });
  });

  it("matches choice labels like 1× via 1x", () => {
    const result = filterSection(sample[1], "1x");
    expect(result).toEqual({ kind: "rows", ids: new Set(["size"]) });
  });

  it("matches hyphenated labels when the query uses spaces", () => {
    const result = filterSection(sample[2], "24 hour");
    expect(result).toEqual({ kind: "rows", ids: new Set(["clock"]) });
  });

  it("hides the section when nothing matches", () => {
    expect(filterSection(sample[0], "penguin")).toBeNull();
  });
});

describe("settings catalog", () => {
  it("lists the live rows and not the ones that were removed", () => {
    const rows = SETTINGS_SEARCH_CATALOG.flatMap((section) => section.rows);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain("mention-sound");
    expect(ids).toContain("confirm-channel");
    expect(ids).not.toContain("chrome");
    expect(rows.find((row) => row.id === "backup")?.hint ?? "").not.toMatch(/clipboard/i);
    const chat = SETTINGS_SEARCH_CATALOG.find((section) => section.title === "Chat & mentions");
    expect(filterSection(chat!, "mention sound")).toEqual({ kind: "rows", ids: new Set(["mention-sound"]) });
    const window = SETTINGS_SEARCH_CATALOG.find((section) => section.title === "Window & startup");
    expect(filterSection(window!, "hide sidebar")).toBeNull();
  });

  it("has the 7 approved sections with 35 settings in all", () => {
    expect(SETTINGS_SEARCH_CATALOG.map((s) => [s.title, s.count])).toEqual([
      ["Appearance", 6],
      ["Chat & mentions", 9],
      ["Emotes", 11],
      ["Per channel", 1],
      ["Window & startup", 3],
      ["Account & history", 4],
      ["About & data", 1],
    ]);
    expect(SETTINGS_SEARCH_CATALOG.reduce((sum, s) => sum + (s.count ?? 0), 0)).toBe(35);
  });

  it("finds each of the 35 settings by its name, in its own section", () => {
    // [what someone types, section, row that must show]
    const all: [string, string, string][] = [
      ["theme", "Appearance", "crested"],
      ["text size", "Appearance", "text-size"],
      ["timestamps", "Appearance", "timestamps"],
      ["24-hour clock", "Appearance", "24h"],
      ["badges", "Appearance", "badges"],
      ["striped rows", "Appearance", "zebra"],
      ["show deleted messages", "Chat & mentions", "deleted"],
      ["highlight words", "Chat & mentions", "highlight"],
      ["mention sound", "Chat & mentions", "mention-sound"],
      ["cooldown", "Chat & mentions", "mention-sound"],
      ["confirm channel", "Chat & mentions", "confirm-channel"],
      ["read only", "Chat & mentions", "read-only"],
      ["spell check", "Chat & mentions", "spell"],
      ["language", "Chat & mentions", "spell"],
      ["dictionary", "Chat & mentions", "spell"],
      ["7tv", "Emotes", "sources"],
      ["betterttv", "Emotes", "sources"],
      ["frankerfacez", "Emotes", "sources"],
      ["emote size", "Emotes", "size"],
      ["moving emotes", "Emotes", "anim"],
      ["overlay emotes", "Emotes", "overlays"],
      ["preview on hover", "Emotes", "preview"],
      ["tab finishes", "Emotes", "tab"],
      ["emote menu", "Emotes", "picker"],
      ["remember emotes", "Emotes", "remember"],
      ["blocked emotes", "Emotes", "blocked"],
      ["per channel", "Per channel", "overrides"],
      ["close to tray", "Window & startup", "tray"],
      ["start with windows", "Window & startup", "startup"],
      ["grid slots", "Window & startup", "grid-slots"],
      ["remember chat history", "Account & history", "history"],
      ["history server", "Account & history", "history-server"],
      ["read token", "Account & history", "history-server"],
      ["client id", "Account & history", "client-id"],
      ["check for updates automatically", "About & data", "auto-updates"],
    ];
    expect(all).toHaveLength(35);
    for (const [query, title, id] of all) {
      const section = SETTINGS_SEARCH_CATALOG.find((s) => s.title === title)!;
      const result = filterSection(section, query);
      expect(result, `"${query}" in ${title}`).not.toBeNull();
      if (result?.kind === "rows") expect(result.ids.has(id), `"${query}" -> ${id}`).toBe(true);
    }
  });
});

describe("anySectionMatches", () => {
  it("is true for blank queries and false when nothing hits", () => {
    expect(anySectionMatches(sample, "")).toBe(true);
    expect(anySectionMatches(sample, "window")).toBe(true);
    expect(anySectionMatches(sample, "zzzz-nope")).toBe(false);
  });
});

describe("theme search", () => {
  it("finds every one of the 13 themes by name", () => {
    const theme = SETTINGS_SEARCH_CATALOG.find((s) => s.title === "Appearance")!;
    expect(theme.rows.map((r) => r.id).slice(0, SKIN_ORDER.length)).toEqual(SKIN_ORDER);
    for (const id of SKIN_ORDER) {
      const result = filterSection(theme, THEMES[id].name);
      expect(result, THEMES[id].name).not.toBeNull();
      if (result?.kind === "rows") expect(result.ids.has(id)).toBe(true);
    }
    const paper = filterSection(theme, "paper");
    expect(paper?.kind === "rows" && paper.ids.has("eyecomfort-light")).toBe(true);
    const auto = filterSection(theme, "follows windows");
    expect(auto?.kind === "rows" && auto.ids.has("auto")).toBe(true);
  });
});