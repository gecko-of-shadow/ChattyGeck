import { describe, expect, it } from "vitest";
import { reduceComposerKey, type ComposerKeyInput } from "./composerKeys";

function key(overrides: Partial<ComposerKeyInput>): ComposerKeyInput {
  return {
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    composing: false,
    tabComplete: true,
    completion: null,
    text: "Kappa ",
    history: [],
    historyIndex: -1,
    ...overrides,
  };
}

describe("reduceComposerKey", () => {
  const open = { index: 0, count: 3 };

  it("Enter while a completion is open accepts it and does not send", () => {
    expect(reduceComposerKey(key({ completion: open }))).toEqual({ kind: "accept" });
  });

  it("the next Enter, with the list closed, sends", () => {
    expect(reduceComposerKey(key({ completion: null, text: "Kappa " }))).toEqual({ kind: "submit" });
  });

  it("does not accept or send while an IME composition is active", () => {
    expect(reduceComposerKey(key({ completion: open, composing: true }))).toEqual({ kind: "dismiss" });
    expect(reduceComposerKey(key({ composing: true }))).toEqual({ kind: "none" });
  });

  it("Shift+Enter does not send", () => {
    expect(reduceComposerKey(key({ shiftKey: true }))).toEqual({ kind: "none" });
    expect(reduceComposerKey(key({ completion: open, shiftKey: true }))).toEqual({ kind: "dismiss" });
  });

  it("cycles matches with Tab and arrows, and Shift+Tab goes backwards", () => {
    expect(reduceComposerKey(key({ key: "Tab", completion: open }))).toEqual({ kind: "cycle", index: 1 });
    expect(reduceComposerKey(key({ key: "Tab", shiftKey: true, completion: { index: 0, count: 3 } }))).toEqual({
      kind: "cycle",
      index: 2,
    });
    expect(reduceComposerKey(key({ key: "ArrowDown", completion: open }))).toEqual({ kind: "cycle", index: 1 });
    expect(reduceComposerKey(key({ key: "ArrowUp", completion: { index: 0, count: 3 } }))).toEqual({
      kind: "cycle",
      index: 2,
    });
  });

  it("starts completion on Tab when nothing is open", () => {
    expect(reduceComposerKey(key({ key: "Tab", completion: null }))).toEqual({ kind: "start", backwards: false });
    expect(reduceComposerKey(key({ key: "Tab", shiftKey: true, completion: null }))).toEqual({
      kind: "start",
      backwards: true,
    });
  });

  it("Escape closes the completion before it clears a reply", () => {
    expect(reduceComposerKey(key({ key: "Escape", completion: open }))).toEqual({ kind: "close" });
    expect(reduceComposerKey(key({ key: "Escape", completion: null }))).toEqual({ kind: "escape" });
  });

  it("ArrowUp recalls history only when the completion list is closed", () => {
    const history = ["first", "second"];
    expect(reduceComposerKey(key({ key: "ArrowUp", text: "", history }))).toEqual({
      kind: "history",
      historyIndex: 0,
      text: "first",
    });
    expect(reduceComposerKey(key({ key: "ArrowUp", text: "", history, completion: open })).kind).toBe("cycle");
    expect(reduceComposerKey(key({ key: "ArrowDown", text: "first", history, historyIndex: 0 }))).toEqual({
      kind: "history",
      historyIndex: -1,
      text: "",
    });
  });
});
