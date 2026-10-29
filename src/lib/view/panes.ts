/**
 * Grid panes keep their place: `gridChannels` is the panes in order, and an empty pane (cleared with "−") is saved as
 * {@link EMPTY_PANE} so the panes after it don't slide over. Older builds drop the empty string when they load the file
 * (it isn't a channel name), so they just close the gap.
 */
export const EMPTY_PANE = "";

/** The channels on screen in the grid, without the empty panes. */
export function paneChannels(grid: readonly string[]): string[] {
  return grid.filter((name) => name !== EMPTY_PANE);
}

/** Empty panes at the end aren't saved: the grid draws empty panes up to the view size anyway. */
export function trimPanes(grid: readonly string[]): string[] {
  let end = grid.length;
  while (end > 0 && grid[end - 1] === EMPTY_PANE) end--;
  return grid.slice(0, end);
}

/** Index of the first free pane in a view of `view` panes, or -1 when every pane holds a channel. */
export function firstFreePane(grid: readonly string[], view: number): number {
  for (let i = 0; i < view; i++) if (!grid[i]) return i;
  return -1;
}

/** Puts `name` into the first free pane. Null when the view is full; unchanged when it's already on screen. */
export function fillFreePane(grid: readonly string[], name: string, view: number): string[] | null {
  if (grid.includes(name)) return grid.slice();
  const at = firstFreePane(grid, view);
  return at < 0 ? null : placeInPane(grid, at, name);
}

/**
 * Loads `name` into pane `index`. When it's already in another pane the two panes swap (that pane gets whatever this
 * one showed, possibly nothing), so a channel is never on screen twice.
 */
export function placeInPane(grid: readonly string[], index: number, name: string): string[] {
  const next = grid.slice();
  while (next.length <= index) next.push(EMPTY_PANE);
  const existing = next.indexOf(name);
  if (existing === index) return trimPanes(next);
  if (existing >= 0) next[existing] = next[index];
  next[index] = name;
  return trimPanes(next);
}

/** Empties the pane showing `name` (it keeps its place). Unchanged copy when it isn't on screen. */
export function clearPaneOf(grid: readonly string[], name: string): string[] {
  return trimPanes(grid.map((entry) => (entry === name ? EMPTY_PANE : entry)));
}
