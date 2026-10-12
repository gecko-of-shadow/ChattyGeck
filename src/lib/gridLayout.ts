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
}

/**
 * Pick a multi-chat grid that stays square-ish: never stretch cells taller than
 * they are wide when a square fits, and prefer column counts closer to 1:1.
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

  let best: (ChatGridLayout & { score: number }) | null = null;

  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const cellWidth = (areaWidth - gap * (columns - 1)) / columns;
    if (cellWidth < minW - 0.5) continue;

    const fillHeight = (areaHeight - gap * (rows - 1)) / rows;
    // Cap height to width so panes stay squares (or landscape), never tall skinny columns.
    let cellHeight = Math.min(fillHeight, cellWidth);
    if (cellHeight < minH) {
      // Not enough room for a square at min size — allow scroll rather than crushing.
      cellHeight = minH;
    }

    const aspect = cellWidth / Math.max(1, cellHeight);
    const aspectPenalty = Math.abs(Math.log(aspect));
    const usedW = columns * cellWidth + gap * (columns - 1);
    const usedH = rows * cellHeight + gap * (rows - 1);
    const fill = (usedW * usedH) / Math.max(1, areaWidth * areaHeight);
    // Prefer squareness over packing every last pixel of a tall window.
    const score = fill - aspectPenalty * 2.5 - (rows * columns - n) * 0.02;

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
    return { columns: best.columns, rows: best.rows, cellWidth: best.cellWidth, cellHeight: best.cellHeight };
  }

  return {
    columns: 1,
    rows: n,
    cellWidth: Math.max(minW, Math.floor(areaWidth)),
    cellHeight: minH,
  };
}
