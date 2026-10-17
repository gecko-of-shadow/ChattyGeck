import { describe, expect, it } from "vitest";
import { addGridChannel, cycleChannel, moveItem, replaceGridSlot, swapItems } from "./reorder";

describe("grid reorder", () => {
  const grid = ["a", "b", "c", "d"];

  it("moves a box one slot", () => {
    expect(moveItem(grid, "b", -1)).toEqual(["b", "a", "c", "d"]);
    expect(moveItem(grid, "b", 1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(grid, "a", -1)).toBeNull();
  });

  it("swaps two boxes", () => {
    expect(swapItems(grid, "a", "c")).toEqual(["c", "b", "a", "d"]);
    expect(swapItems(grid, "a", "a")).toBeNull();
    expect(swapItems(grid, "a", "z")).toBeNull();
  });

  it("replaces a slot, or swaps when the channel is already on the grid", () => {
    expect(replaceGridSlot(grid, "b", "z")).toEqual(["a", "z", "c", "d"]);
    expect(replaceGridSlot(grid, "a", "d")).toEqual(["d", "b", "c", "a"]);
    expect(replaceGridSlot(grid, "b", "b")).toBeNull();
  });

  it("adds until the slot cap", () => {
    expect(addGridChannel(["a"], "b", 4)).toEqual(["a", "b"]);
    expect(addGridChannel(grid, "e", 4)).toBeNull();
    expect(addGridChannel(grid, "a", 4)).toEqual(grid);
  });

  it("cycles chats in grid order", () => {
    expect(cycleChannel(grid, "b", 1)).toBe("c");
    expect(cycleChannel(grid, "a", -1)).toBe("d");
    expect(cycleChannel(grid, null, 1)).toBe("a");
    expect(cycleChannel(grid, null, -1)).toBe("d");
  });
});
