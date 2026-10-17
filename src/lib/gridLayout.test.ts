import { describe, expect, it } from "vitest";
import { BOX_MIN_HEIGHT, BOX_MIN_WIDTH, layoutChatGrid } from "./gridLayout";

describe("layoutChatGrid", () => {
  it("keeps 2×2 cells from becoming taller than wide in a tall window", () => {
    const layout = layoutChatGrid(4, 800, 1200);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
  });

  it("uses 2×2 for three chats when a single row would leave empty height", () => {
    const layout = layoutChatGrid(3, 1000, 700);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
  });

  it("uses a filled 2×2 for four chats even in a wide window (not 3+1 with a hole)", () => {
    const layout = layoutChatGrid(4, 1100, 700);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellHeight).toBeLessThanOrEqual(layout.cellWidth + 1);
  });

  it("uses 2×2 for four chats in a very wide window (not a short 1×4 strip)", () => {
    const layout = layoutChatGrid(4, 1600, 700);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    // Must use most of the window height, not leave a huge empty band underneath.
    expect(layout.cellHeight * 2 + 6).toBeGreaterThan(700 * 0.85);
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
    expect(layout.suggestSingle).toBe(true);
  });

  it("stacks when the window is under about 620px and suggests Single under 480px", () => {
    const stacked = layoutChatGrid(4, 600, 800);
    expect(stacked.columns).toBe(1);
    expect(stacked.rows).toBe(4);
    expect(layoutChatGrid(3, 400, 700).suggestSingle).toBe(true);
    expect(layoutChatGrid(1, 1280, 720).suggestSingle).toBe(true);
  });

  it("keeps portrait windows in rows and caps ultrawide boxes near 900px", () => {
    const portrait = layoutChatGrid(4, 1080, 1920);
    expect(portrait.rows).toBeGreaterThanOrEqual(portrait.columns);
    const ultra = layoutChatGrid(4, 3440, 1440);
    expect(ultra.columns).toBeGreaterThanOrEqual(4);
    expect(ultra.cellWidth).toBeLessThanOrEqual(900);
    const wide = layoutChatGrid(9, 2560, 1440);
    expect(wide.cellWidth).toBeGreaterThanOrEqual(BOX_MIN_WIDTH - 1);
    expect(wide.cellHeight).toBeGreaterThanOrEqual(BOX_MIN_HEIGHT - 1);
  });

  it("fits the checklist window sizes without stretching past the minimums", () => {
    const sizes = [
      [800, 600],
      [1280, 720],
      [1920, 1080],
      [2560, 1440],
      [3440, 1440],
      [1080, 1920],
    ];
    for (const [width, height] of sizes) {
      for (const count of [1, 2, 4, 9]) {
        const cssWidth = width;
        const layout = layoutChatGrid(count, cssWidth, height);
        expect(layout.columns).toBeGreaterThanOrEqual(1);
        if (cssWidth < 620 && count > 1) expect(layout.columns).toBe(1);
        if (cssWidth >= 620) expect(layout.cellWidth).toBeGreaterThanOrEqual(BOX_MIN_WIDTH - 1);
      }
    }
  });
});
