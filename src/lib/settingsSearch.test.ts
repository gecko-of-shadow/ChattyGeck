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
    const chat = SETTINGS_SEARCH_CATALOG.find((section) => section.title === "Chat display");
    expect(filterSection(chat!, "mention sound")).toEqual({ kind: "rows", ids: new Set(["mention-sound"]) });
    const window = SETTINGS_SEARCH_CATALOG.find((section) => section.title === "Window");
    expect(filterSection(window!, "hide sidebar")).toBeNull();
  });
});

describe("anySectionMatches", () => {
  it("is true for blank queries and false when nothing hits", () => {
    expect(anySectionMatches(sample, "")).toBe(true);
    expect(anySectionMatches(sample, "window")).toBe(true);
    expect(anySectionMatches(sample, "zzzz-nope")).toBe(false);
  });
});
