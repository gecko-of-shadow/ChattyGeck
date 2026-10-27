import { useRef, type KeyboardEvent } from "react";
import { chat } from "@/lib/chat/controller";
import { VIEW_SIZES, viewForSlots, type ViewSize } from "@/lib/gridLayout";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";

const VIEW_HINTS: Record<ViewSize, string> = {
  1: "1 chat (single). Ctrl+G switches; Esc returns to the grid.",
  2: "2 chats side by side",
  3: "3 chats in a row",
  4: "4 chats, 2 by 2",
  6: "6 chats, 3 by 2",
  9: "9 chats, 3 by 3",
};

/** The 1 · 2 · 3 · 4 · 6 · 9 switch at the top right. 1 is Single; the others are grid views. `testIds` off for copies (Settings). */
export function ViewSwitch({ testIds = true, label = "View: how many chats" }: { testIds?: boolean; label?: string } = {}) {
  const current = useChat((s) => (s.settings.mode === "focused" ? 1 : viewForSlots(s.settings.gridSlots)));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = VIEW_SIZES.indexOf(current);
    const next = VIEW_SIZES[(index + step + VIEW_SIZES.length) % VIEW_SIZES.length];
    chat.setView(next);
    buttons.current[VIEW_SIZES.indexOf(next)]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 border border-border" onKeyDown={onKeyDown}>
      {VIEW_SIZES.map((view, i) => (
        <button
          key={view}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={current === view}
          aria-label={VIEW_HINTS[view]}
          title={VIEW_HINTS[view]}
          tabIndex={current === view ? 0 : -1}
          data-testid={testIds ? `view-${view}` : undefined}
          onClick={() => chat.setView(view)}
          className={cn(
            "grid h-8 w-7 place-items-center sm:w-8 text-sm font-medium tabular-nums outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            i > 0 && "border-l border-border",
            current === view ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {view}
        </button>
      ))}
    </div>
  );
}
