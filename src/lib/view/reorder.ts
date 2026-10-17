/** Move `name` by `offset` slots. Returns null when it cannot move. */
export function moveItem<T>(list: readonly T[], name: T, offset: number): T[] | null {
  const index = list.indexOf(name);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= list.length) return null;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Exchange two entries. Returns null when either is missing or they are the same slot. */
export function swapItems<T>(list: readonly T[], a: T, b: T): T[] | null {
  const i = list.indexOf(a);
  const j = list.indexOf(b);
  if (i < 0 || j < 0 || i === j) return null;
  const next = list.slice();
  next[i] = list[j];
  next[j] = list[i];
  return next;
}

/**
 * Drop `incoming` onto `slot`. If it is already on the grid, the two swap.
 * Otherwise `slot` is replaced.
 */
export function replaceGridSlot(grid: readonly string[], slot: string, incoming: string): string[] | null {
  if (!slot || slot === incoming) return null;
  const at = grid.indexOf(slot);
  if (at < 0) return null;
  const existing = grid.indexOf(incoming);
  if (existing >= 0) return swapItems(grid, slot, incoming);
  const next = grid.slice();
  next[at] = incoming;
  return next;
}

/** Append a channel if there is room. Returns null when the grid is full. */
export function addGridChannel(grid: readonly string[], name: string, maxSlots: number): string[] | null {
  if (grid.includes(name)) return grid.slice();
  if (grid.length >= maxSlots) return null;
  return [...grid, name];
}

/** Next or previous channel in `order`, wrapping. */
export function cycleChannel(order: readonly string[], current: string | null, direction: 1 | -1): string | null {
  if (!order.length) return null;
  const index = current ? order.indexOf(current) : -1;
  if (index < 0) return direction === 1 ? (order[0] ?? null) : (order[order.length - 1] ?? null);
  return order[(index + direction + order.length) % order.length] ?? null;
}
