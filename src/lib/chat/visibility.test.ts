import { describe, expect, it } from "vitest";
import { channelOnScreen, readMarkerAfterFocus } from "./visibility";

describe("channelOnScreen", () => {
  const grid = ["geckotown", "lizardlounge"];

  it("counts only grid boxes while the grid is showing", () => {
    expect(channelOnScreen("grid", "offgrid", grid, "geckotown")).toBe(true);
    expect(channelOnScreen("grid", "offgrid", grid, "offgrid")).toBe(false);
    expect(channelOnScreen("grid", "geckotown", grid, "geckotown")).toBe(true);
  });

  it("counts only the open channel in focused view", () => {
    expect(channelOnScreen("focused", "geckotown", grid, "geckotown")).toBe(true);
    expect(channelOnScreen("focused", "geckotown", grid, "lizardlounge")).toBe(false);
    expect(channelOnScreen("focused", null, grid, "geckotown")).toBe(false);
  });
});

describe("readMarkerAfterFocus", () => {
  it("clears the divider when the channel was already on the grid", () => {
    expect(readMarkerAfterFocus(true, true, "msg-1")).toBeUndefined();
  });

  it("keeps the divider for an off-grid channel and for focused-to-focused switches", () => {
    expect(readMarkerAfterFocus(true, false, "msg-1")).toBe("msg-1");
    expect(readMarkerAfterFocus(false, false, "msg-1")).toBe("msg-1");
    expect(readMarkerAfterFocus(false, true, "msg-1")).toBe("msg-1");
  });
});
