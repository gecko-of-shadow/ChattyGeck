/** Gap between chat panes (the design's 2px lines). */
export const GRID_GAP = 2;

/** The views the top-right switch offers: 1 = Single, the rest are grids. */
export const VIEW_SIZES = [1, 2, 3, 4, 6, 9] as const;
export type ViewSize = (typeof VIEW_SIZES)[number];

/** Fixed packing per view: 2 side by side, 3 in a row, 2x2, 3x2, 3x3. */
const VIEW_GRID: Record<ViewSize, { columns: number; rows: number }> = {
  1: { columns: 1, rows: 1 },
  2: { columns: 2, rows: 1 },
  3: { columns: 3, rows: 1 },
  4: { columns: 2, rows: 2 },
  6: { columns: 3, rows: 2 },
  9: { columns: 3, rows: 3 },
};

/** Narrowest a pane in a fixed view gets before the view drops columns (and scrolls). */
export const VIEW_MIN_WIDTH = 220;
/** Shortest a pane gets before the grid scrolls. */
export const VIEW_MIN_HEIGHT = 140;

/**
 * The offered view for a saved slot count. Older files may hold 5, 7 or 8 (any 1–9 was allowed): those show as the
 * next bigger view, without rewriting what is saved.
 */
export function viewForSlots(slots: number): ViewSize {
  const n = Math.min(9, Math.max(1, Math.round(Number.isFinite(slots) ? slots : 4)));
  return VIEW_SIZES.find((v) => v >= n) ?? 9;
}

/** Columns a view has when the window is wide enough. */
export function viewColumns(view: ViewSize): number {
  return VIEW_GRID[view].columns;
}

export interface ViewGridLayout {
  columns: number;
  rows: number;
  /** Row height in px; the grid scrolls when rows × height is taller than the area. */
  cellHeight: number;
}

/**
 * Lay out a fixed view in the grid area. Panes fill the area exactly; a window too narrow for the view's columns
 * keeps every pane but uses fewer columns and scrolls, and a too-short one scrolls at {@link VIEW_MIN_HEIGHT}.
 */
export function layoutViewGrid(view: ViewSize, areaWidth: number, areaHeight: number, gap = GRID_GAP): ViewGridLayout {
  const fixed = VIEW_GRID[view];
  const fit = Math.max(1, Math.floor((areaWidth + gap) / (VIEW_MIN_WIDTH + gap)));
  const columns = Math.min(fixed.columns, fit);
  const rows = Math.ceil(view / columns);
  const fill = Math.floor((areaHeight - gap * (fixed.rows - 1)) / fixed.rows);
  return { columns, rows, cellHeight: Math.max(VIEW_MIN_HEIGHT, fill) };
}
/** Outer padding around the whole grid: none, panes sit flush with the window edge. */
export const GRID_EDGE = 0;
