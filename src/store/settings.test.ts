import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./settings";

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
});
