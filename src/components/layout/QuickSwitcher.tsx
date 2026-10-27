import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { chat } from "@/lib/chat/controller";
import { fuzzyChannels } from "@/lib/view/fuzzy";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

/** Ctrl+K. Enter opens Single. Alt+Enter drops the channel into the active grid slot. */
export function QuickSwitcher() {
  const open = useUi((s) => s.quickSwitchOpen);
  const channels = useChat((s) => s.settings.channels);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const matches = fuzzyChannels(channels, query);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const close = () => useUi.setState({ quickSwitchOpen: false });
  const current = matches[Math.min(index, Math.max(0, matches.length - 1))];

  const choose = (name: string, intoGrid: boolean) => {
    if (intoGrid) {
      const settings = useChat.getState().settings;
      const hovered = useUi.getState().hoveredChannel;
      const focused = settings.focused;
      const slot =
        hovered && settings.gridChannels.includes(hovered)
          ? hovered
          : focused && settings.gridChannels.includes(focused)
            ? focused
            : (settings.gridChannels[0] ?? null);
      if (slot) chat.replaceInGrid(slot, name);
      else {
        const result = chat.showInGrid(name);
        if (!result.ok) return;
      }
    } else {
      chat.focus(name);
    }
    close();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-background/80 pt-[15vh]" role="presentation" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Switch channel"
        data-testid="quick-switch-dialog"
        className="w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-popover p-2 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          data-testid="quick-switch"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((i) => Math.min(matches.length - 1, i + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (event.key === "Enter" && current) {
              event.preventDefault();
              choose(current, event.altKey);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          placeholder="Jump to a channel"
          aria-label="Channel search"
          className="h-9 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        />
        <ul role="listbox" aria-label="Followed channels" className="zoo-scroll mt-1 max-h-64 overflow-y-auto">
          {matches.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className={`flex w-full rounded-md px-2 py-1.5 text-left text-sm ${i === index ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(name, false)}
              >
                #{name}
              </button>
            </li>
          ))}
          {matches.length === 0 ? <li className="px-2 py-2 text-sm text-muted-foreground">No followed channel matches.</li> : null}
        </ul>
        <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
          <span>Enter opens Single. Alt+Enter puts it in the active grid slot.</span>
          <button
            type="button"
            className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
            disabled={!current}
            onClick={() => current && choose(current, true)}
          >
            Put in grid slot
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
