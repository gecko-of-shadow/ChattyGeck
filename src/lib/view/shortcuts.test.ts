import { describe, expect, it } from "vitest";
import { viewShortcut, type ShortcutEvent } from "./shortcuts";

function press(overrides: Partial<ShortcutEvent>): ShortcutEvent {
  return { key: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides };
}

describe("viewShortcut", () => {
  it("maps the view keys", () => {
    expect(viewShortcut(press({ key: "g", ctrlKey: true }))).toEqual({ type: "toggle-mode" });
    expect(viewShortcut(press({ key: "k", metaKey: true }))).toEqual({ type: "quick-switch" });
    expect(viewShortcut(press({ key: "1", ctrlKey: true }))).toEqual({ type: "slot", index: 0 });
    expect(viewShortcut(press({ key: "9", ctrlKey: true }))).toEqual({ type: "slot", index: 8 });
    expect(viewShortcut(press({ key: "Tab", ctrlKey: true }))).toEqual({ type: "cycle", direction: 1 });
    expect(viewShortcut(press({ key: "Tab", ctrlKey: true, shiftKey: true }))).toEqual({ type: "cycle", direction: -1 });
    expect(viewShortcut(press({ key: "ArrowLeft", altKey: true, shiftKey: true }))).toEqual({ type: "move-box", direction: -1 });
    expect(viewShortcut(press({ key: "ArrowRight", altKey: true, shiftKey: true }))).toEqual({ type: "move-box", direction: 1 });
    expect(viewShortcut(press({ key: "Escape" }))).toEqual({ type: "escape" });
  });

  it("ignores shortcuts with extra modifiers and plain typing", () => {
    expect(viewShortcut(press({ key: "g", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(viewShortcut(press({ key: "g" }))).toBeNull();
    expect(viewShortcut(press({ key: "Tab" }))).toBeNull();
    expect(viewShortcut(press({ key: "Escape", shiftKey: true }))).toBeNull();
  });
});
