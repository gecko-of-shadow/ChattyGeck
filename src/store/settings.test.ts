import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, clampTextSize, makeBackup, parseWordList, readBackup, sanitizeSettings } from "./settings";

describe("sanitizeSettings", () => {
  it("starts from defaults when nothing is saved", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("turns the old merged feed into the grid", () => {
    expect(sanitizeSettings({ mode: "merged" }).mode).toBe("grid");
    expect(sanitizeSettings({ mode: "focused" }).mode).toBe("focused");
  });

  it("moves removed gecko skins to the crested gecko", () => {
    for (const skin of ["shadow", "leopard", "tokay", "day", "nonsense"]) {
      expect(sanitizeSettings({ skin }).skin).toBe("crested");
    }
    expect(sanitizeSettings({ skin: "penguin" }).skin).toBe("penguin");
  });

  it("cleans the channel list and keeps the focused channel valid", () => {
    const settings = sanitizeSettings({ channels: ["#XQC", "xqc", "bad name", "twitch.tv/summit1g"], focused: "gone" });
    expect(settings.channels).toEqual(["xqc", "summit1g"]);
    expect(settings.focused).toBe("xqc");
  });

  it("closes to the tray unless told otherwise", () => {
    expect(sanitizeSettings({}).closeToTray).toBe(true);
    expect(sanitizeSettings({ closeToTray: false }).closeToTray).toBe(false);
  });

  it("turns the old small/medium/large text sizes into pixels and clamps new ones", () => {
    expect(sanitizeSettings({ fontSize: "sm" }).textSize).toBe(12.5);
    expect(sanitizeSettings({ fontSize: "lg" }).textSize).toBe(15.5);
    expect(sanitizeSettings({ textSize: 32 }).textSize).toBe(32);
    expect(sanitizeSettings({ textSize: 400 }).textSize).toBe(40);
    expect(sanitizeSettings({ textSize: "nope" }).textSize).toBe(13.5);
    expect(clampTextSize(11.26)).toBe(11.5);
  });

  it("keeps every emote switch, with unknown values falling back", () => {
    const s = sanitizeSettings({
      emoteProviders: { bttv: false },
      emoteSize: 1.5,
      emoteAnimation: "hover",
      overlayEmotes: false,
      blockedEmotes: [" KEKW ", "KEKW", "", 5, "Clap"],
      pickerTab: "nope",
      favoriteEmotes: ["7tv:abc"],
    });
    expect(s.emoteProviders).toEqual({ "7tv": true, bttv: false, ffz: true });
    expect(s.emoteSize).toBe(1.5);
    expect(s.emoteAnimation).toBe("hover");
    expect(s.overlayEmotes).toBe(false);
    expect(s.blockedEmotes).toEqual(["KEKW", "Clap"]);
    expect(s.pickerTab).toBe("all");
    expect(s.favoriteEmotes).toEqual(["7tv:abc"]);
    expect(sanitizeSettings({ emoteSize: 3 }).emoteSize).toBe(1);
  });
});

describe("word lists", () => {
  it("splits on lines, commas and spaces", () => {
    expect(parseWordList("gecko\nlizard, newt  frog\n\n")).toEqual(["gecko", "lizard", "newt", "frog"]);
  });
});

describe("backups", () => {
  it("round-trips through a backup file", () => {
    const settings = sanitizeSettings({ channels: ["xqc"], textSize: 20, highlightWords: ["gecko"] });
    const text = JSON.stringify(makeBackup(settings));
    expect(readBackup(text)).toEqual(settings);
  });

  it("accepts a bare settings.json (new or old) and rejects other files", () => {
    expect(readBackup(JSON.stringify({ channels: ["xqc"], skin: "penguin", textSize: 15 }))?.channels).toEqual(["xqc"]);
    expect(readBackup(JSON.stringify({ skin: "penguin", fontSize: "lg" }))?.textSize).toBe(15.5);
    expect(readBackup("not json")).toBeNull();
    expect(readBackup(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(readBackup("[]")).toBeNull();
    // Looks like settings only by accident (package.json, tsconfig…): must not reset everything.
    expect(readBackup(JSON.stringify({ name: "zoochattr", version: "0.3.0" }))).toBeNull();
    expect(readBackup(JSON.stringify({ mode: "production", channels: 4 }))).toBeNull();
  });
});
