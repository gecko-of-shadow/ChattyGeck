import { describe, expect, it } from "vitest";

// Source checks for the bottom-bar redesign: the top bar is gone and channels are added only from a pane's picker.
// (Screen behaviour is checked by scripts/e2e-mock.mjs in a real browser.)
const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.ts"], { query: "?raw", import: "default", eager: true });

/** Every app source file, named from src/ (e.g. "components/layout/Views.tsx"). */
const files = Object.entries(sources).map(([key, text]) => ({ name: key.replace(/^\/src\//, ""), text }));

it("reads the app's source files", () => {
  expect(files.some((f) => f.name === "App.tsx")).toBe(true);
  expect(files.some((f) => f.name === "components/layout/Views.tsx")).toBe(true);
});

describe("no top bar", () => {
  it("has no top bar, channel strip or add tile left in the code", () => {
    for (const { name, text } of files) {
      expect(text, name).not.toMatch(/\bTopBar\b|\bChannelStrip\b|data-testid="top-bar"|add-channel-tile|AddTile\b/);
    }
    expect(files.some((f) => f.name === "components/layout/ChannelStrip.tsx")).toBe(false);
  });

  it("the app shell renders the bottom bar and nothing of the old strip", () => {
    const app = files.find((f) => f.name === "App.tsx")!.text;
    expect(app).toContain("<BottomBar");
    expect(app).not.toMatch(/<Composer|<LoginPrompt|<ViewSwitch/);
  });
});

describe("adding a channel happens only in the pane picker", () => {
  it("only the picker's helpers call chat.addChannel", () => {
    const callers = files.filter((f) => /\bchat\.addChannel\(/.test(f.text)).map((f) => f.name);
    // loadIntoPane: a picked or typed channel; ChannelMenu: "Open alone" on a picker row for a follow not open yet;
    // SettingsDialog: restoring a backup joins the channels saved in it (not an add box).
    expect(callers.sort()).toEqual(["components/dialogs/SettingsDialog.tsx", "components/layout/ChannelMenu.tsx", "lib/view/loadIntoPane.ts"]);
    const settings = files.find((f) => f.name === "components/dialogs/SettingsDialog.tsx")!.text;
    expect(settings.match(/\bchat\.addChannel\(/g)).toHaveLength(1);
    expect(settings).toMatch(/for \(const channel of added\) chat\.addChannel\(channel\);/);
    const loaders = files.filter((f) => /\bloadIntoPane\(/.test(f.text) && f.name !== "lib/view/loadIntoPane.ts").map((f) => f.name);
    expect(loaders).toEqual(["components/layout/ChannelPicker.tsx"]);
  });

  it("has no other add box, add menu or Ctrl+K add row", () => {
    for (const { name, text } of files) {
      expect(text, name).not.toMatch(/AddChannelForm|quick-switch-add|Add a channel…|aria-label="Join channel"/);
    }
  });
});
