import { describe, expect, it } from "vitest";
import { BOX_MIN_HEIGHT, BOX_MIN_WIDTH, layoutChatGrid } from "./gridLayout";

describe("layoutChatGrid", () => {
  it("keeps 2×2 cells from becoming taller than wide in a tall window", () => {
    const layout = layoutChatGrid(4, 800, 1200);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
  });

  it("picks three square cells in a row when that fits better than a 2×2", () => {
    const layout = layoutChatGrid(3, 1000, 700);
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(1);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
    expect(layout.cellHeight / layout.cellWidth).toBeGreaterThan(0.9);
  });

  it("uses a filled 2×2 for four chats even in a wide window (not 3+1 with a hole)", () => {
    const layout = layoutChatGrid(4, 1100, 700);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
  });

  it("uses 2×2 for three chats when a single row would be too wide/short", () => {
    // Only ~2 min-width columns fit; a 3-wide row is impossible.
    const layout = layoutChatGrid(3, 680, 720);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
  });

  it("falls back to scrolling when the area is shorter than the minimum box", () => {
    const layout = layoutChatGrid(1, 400, 100);
    expect(layout.cellHeight).toBe(BOX_MIN_HEIGHT);
    expect(layout.cellWidth).toBeGreaterThanOrEqual(BOX_MIN_WIDTH);
  });

  it("uses one column when the area is too narrow for two", () => {
    const layout = layoutChatGrid(2, BOX_MIN_WIDTH + 10, 800);
    expect(layout.columns).toBe(1);
    expect(layout.rows).toBe(2);
  });
});
