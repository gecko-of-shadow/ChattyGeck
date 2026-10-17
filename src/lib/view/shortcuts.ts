export type ViewShortcut =
  | { type: "toggle-mode" }
  | { type: "quick-switch" }
  | { type: "slot"; index: number }
  | { type: "cycle"; direction: 1 | -1 }
  | { type: "move-box"; direction: 1 | -1 }
  | { type: "escape" };

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Keyboard shortcuts for grid / single view. Ctrl and Cmd are the same. */
export function viewShortcut(event: ShortcutEvent): ViewShortcut | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (mod && !event.altKey && !event.shiftKey && key === "g") return { type: "toggle-mode" };
  if (mod && !event.altKey && !event.shiftKey && key === "k") return { type: "quick-switch" };
  if (mod && !event.altKey && !event.shiftKey && /^[1-9]$/.test(key)) return { type: "slot", index: Number(key) - 1 };
  if (mod && !event.altKey && key === "Tab") return { type: "cycle", direction: event.shiftKey ? -1 : 1 };
  if (!mod && event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    return { type: "move-box", direction: event.key === "ArrowLeft" ? -1 : 1 };
  }
  if (!mod && !event.altKey && !event.shiftKey && event.key === "Escape") return { type: "escape" };
  return null;
}
