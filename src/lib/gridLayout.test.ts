import { describe, expect, it } from "vitest";
import { GRID_GAP, layoutViewGrid, VIEW_MIN_HEIGHT, VIEW_SIZES, viewForSlots } from "./gridLayout";

describe("view switch sizes", () => {
  it("offers 1, 2, 3, 4, 6 and 9", () => {
    expect([...VIEW_SIZES]).toEqual([1, 2, 3, 4, 6, 9]);
  });

  it("shows an old saved 5, 7 or 8 as the next bigger view", () => {
    expect(viewForSlots(5)).toBe(6);
    expect(viewForSlots(7)).toBe(9);
    expect(viewForSlots(8)).toBe(9);
    for (const v of VIEW_SIZES) expect(viewForSlots(v)).toBe(v);
    expect(viewForSlots(0)).toBe(1);
    expect(viewForSlots(40)).toBe(9);
    expect(viewForSlots(Number.NaN)).toBe(4);
  });
});

describe("layoutViewGrid", () => {
  it("uses the approved packing: 2x1, 3x1, 2x2, 3x2, 3x3", () => {
    const at = (v: (typeof VIEW_SIZES)[number]) => layoutViewGrid(v, 1600, 900);
    expect(at(1)).toMatchObject({ columns: 1, rows: 1 });
    expect(at(2)).toMatchObject({ columns: 2, rows: 1 });
    expect(at(3)).toMatchObject({ columns: 3, rows: 1 });
    expect(at(4)).toMatchObject({ columns: 2, rows: 2 });
    expect(at(6)).toMatchObject({ columns: 3, rows: 2 });
    expect(at(9)).toMatchObject({ columns: 3, rows: 3 });
  });

  it("fills the area height exactly, 2px gaps included", () => {
    expect(layoutViewGrid(4, 1600, 902).cellHeight).toBe(450);
    expect(layoutViewGrid(9, 1600, 904).cellHeight).toBe(300);
    expect(GRID_GAP).toBe(2);
  });

  it("keeps every pane in a narrow window: fewer columns, then scroll", () => {
    const narrow = layoutViewGrid(9, 360, 700);
    expect(narrow.columns).toBe(1);
    expect(narrow.rows).toBe(9);
    const mid = layoutViewGrid(6, 500, 700);
    expect(mid.columns).toBe(2);
    expect(mid.rows).toBe(3);
  });

  it("never squeezes a pane below the minimum height", () => {
    expect(layoutViewGrid(9, 1600, 200).cellHeight).toBe(VIEW_MIN_HEIGHT);
  });
});
