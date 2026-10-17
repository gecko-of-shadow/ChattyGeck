/** Narrowest a grid box gets before the layout drops a column. */
export const BOX_MIN_WIDTH = 300;
/** Shortest a grid box gets before the grid scrolls instead of squeezing. */
export const BOX_MIN_HEIGHT = 260;
/** Gap between chat panes. */
export const GRID_GAP = 6;
/** Outer padding around the whole grid (kept tight so panes reach the window edge). */
export const GRID_EDGE = 2;

export interface ChatGridLayout {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** The window is a single column of chat, or under 480px. The UI may offer Single; it does not switch by itself. */
  suggestSingle: boolean;
}

/** Wider than this is too narrow for two columns: stack and scroll. */
const STACK_BELOW = 620;
/** Below this width, Single is a better fit. */
const SINGLE_BELOW = 480;
const ULTRAWIDE = 21 / 9;
/** Ultrawide rows should not stretch a box past this. */
const MAX_CELL_WIDTH = 900;

/**
 * Pick a multi-chat grid of square-ish panes.
 * Prefers packings near √n (4 → 2×2) and rejects short 1×n strips that leave a
 * huge empty band under the row. Cells may be landscape; never taller than wide
 * when a square fits.
 */
export function layoutChatGrid(
  count: number,
  areaWidth: number,
  areaHeight: number,
  opts?: { gap?: number; minWidth?: number; minHeight?: number },
): ChatGridLayout {
  const gap = opts?.gap ?? GRID_GAP;
  const minW = opts?.minWidth ?? BOX_MIN_WIDTH;
  const minH = opts?.minHeight ?? BOX_MIN_HEIGHT;
  const n = Math.max(1, count);
  const idealCols = Math.max(1, Math.round(Math.sqrt(n)));
  const narrow = areaWidth < STACK_BELOW;
  const ultrawide = areaHeight > 0 && areaWidth / areaHeight >= ULTRAWIDE;
  const suggestSingle = n === 1 || areaWidth < SINGLE_BELOW;
  const neededForCap = ultrawide ? Math.max(1, Math.ceil((areaWidth + gap) / (MAX_CELL_WIDTH + gap))) : 1;
  const columnLimit = narrow ? 1 : Math.min(9, Math.max(n, ultrawide ? neededForCap : n));

  let best: { columns: number; rows: number; cellWidth: number; cellHeight: number; score: number } | null = null;

  for (let columns = 1; columns <= columnLimit; columns++) {
    const rows = Math.ceil(n / columns);
    const cellWidth = (areaWidth - gap * (columns - 1)) / columns;
    if (columns > 1 && cellWidth < minW - 0.5) continue;
    if (ultrawide && columns < columnLimit && cellWidth > MAX_CELL_WIDTH + 0.5) continue;

    const fillHeight = (areaHeight - gap * (rows - 1)) / rows;
    // Cap height to width so panes stay squares or landscape, never tall skinny columns.
    let cellHeight = Math.min(fillHeight, cellWidth);
    if (cellHeight < minH) {
      cellHeight = minH;
    }

    const usedH = rows * cellHeight + gap * (rows - 1);
    const heightFill = Math.min(1, usedH / Math.max(1, areaHeight));
    const emptySlots = rows * columns - n;
    const squareness = cellHeight / cellWidth;
    // Bran’s bug: four wide squares in one short row with empty window underneath.
    const shortStrip = rows === 1 && columns >= n && heightFill < 0.82;
    const portrait = areaHeight > areaWidth;

    const score =
      squareness * 1.2 +
      (columns === idealCols ? 2 : 0) -
      Math.abs(columns - idealCols) -
      emptySlots * 0.5 -
      (shortStrip ? 5 : 0) +
      heightFill * 0.3 +
      (portrait && rows >= columns ? 0.6 : 0);

    if (!best || score > best.score) {
      best = {
        columns,
        rows,
        cellWidth: Math.floor(cellWidth),
        cellHeight: Math.floor(cellHeight),
        score,
      };
    }
  }

  if (best) {
    return {
      columns: best.columns,
      rows: best.rows,
      cellWidth: best.cellWidth,
      cellHeight: best.cellHeight,
      suggestSingle,
    };
  }

  return {
    columns: 1,
    rows: n,
    cellWidth: Math.max(minW, Math.floor(areaWidth)),
    cellHeight: minH,
    suggestSingle,
  };
}
