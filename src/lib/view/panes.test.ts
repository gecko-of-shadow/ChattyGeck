import { describe, expect, it } from "vitest";
import { clearPaneOf, fillFreePane, firstFreePane, paneChannels, placeInPane, trimPanes } from "./panes";

describe("grid panes keep their place", () => {
  it("lists the channels on screen without empty panes", () => {
    expect(paneChannels(["a", "", "c"])).toEqual(["a", "c"]);
    expect(trimPanes(["a", "", "c", "", ""])).toEqual(["a", "", "c"]);
  });

  it("clears a pane in place", () => {
    expect(clearPaneOf(["a", "b", "c"], "b")).toEqual(["a", "", "c"]);
    expect(clearPaneOf(["a", "b", "c"], "c")).toEqual(["a", "b"]);
    expect(clearPaneOf(["a"], "nope")).toEqual(["a"]);
  });

  it("fills the first free pane, or says the view is full", () => {
    expect(firstFreePane(["a", "", "c"], 4)).toBe(1);
    expect(firstFreePane(["a", "b"], 4)).toBe(2);
    expect(firstFreePane(["a", "b"], 2)).toBe(-1);
    expect(fillFreePane(["a", "", "c"], "d", 4)).toEqual(["a", "d", "c"]);
    expect(fillFreePane(["a", "b"], "c", 2)).toBeNull();
    expect(fillFreePane(["a", "b"], "a", 2)).toEqual(["a", "b"]);
  });

  it("loads into a pane: replaces, pads, or swaps with the pane already showing it", () => {
    expect(placeInPane(["a", "b"], 1, "x")).toEqual(["a", "x"]);
    expect(placeInPane(["a"], 3, "x")).toEqual(["a", "", "", "x"]);
    expect(placeInPane(["a", "", "c"], 1, "a")).toEqual(["", "a", "c"]);
    expect(placeInPane(["a", "b", "c"], 0, "c")).toEqual(["c", "b", "a"]);
    expect(placeInPane(["a", "b"], 1, "b")).toEqual(["a", "b"]);
  });
});
