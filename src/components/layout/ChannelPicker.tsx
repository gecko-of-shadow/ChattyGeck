import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { ArrowLeft, Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chat } from "@/lib/chat/controller";
import { addedMoveOffset, moveHighlight, pickerModel, type PickerItem } from "@/lib/channelPicker";
import { liveLabel } from "@/lib/follows";
import { loadIntoPane } from "@/lib/view/loadIntoPane";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { closePicker, useUi, type PaneTarget } from "@/store/ui";
import { ChannelAvatar } from "./ChannelAvatar";
import { ChannelMenuPopup } from "./ChannelMenu";

function countLabel(n: number): string {
  return n > 99 ? "99+" : String(n);
}

function optionId(prefix: string, item: PickerItem): string {
  return `${prefix}-${item.kind}-${item.login}`;
}

/** One channel in the picker: avatar (green dot while live), name, mention / unread count. Right-click: channel menu. */
const PickerRowView = memo(function PickerRowView({
  id,
  login,
  name,
  joined,
  highlighted,
  movable,
  moveUp,
  moveDown,
  onChoose,
  onHover,
}: {
  id: string;
  login: string;
  name: string;
  joined: boolean;
  highlighted: boolean;
  movable: boolean;
  moveUp: number | null;
  moveDown: number | null;
  onChoose: (login: string) => void;
  onHover: (login: string) => void;
}) {
  const view = useChat(
    useShallow((s) => {
      const channel = s.channels[login];
      return channel ? { status: channel.status, error: channel.error, unread: channel.unread, mentions: channel.mentions } : null;
    }),
  );
  // undefined: offline; null: not known (logged out, so no dots).
  const viewers = useChat((s) => (s.live === null ? null : s.live[login]));
  const mentions = view?.mentions ?? 0;
  const unread = view?.unread ?? 0;
  const liveText = viewers === null ? null : viewers === undefined ? "offline" : `live, ${liveLabel(viewers)}`;
  const status = !view ? "chat not open" : view.status === "joining" ? "joining" : view.status === "error" ? `couldn't join: ${view.error ?? "error"}` : null;
  const activity = mentions > 0 ? `${mentions} mention${mentions === 1 ? "" : "s"}` : unread > 0 ? `${unread} unread` : null;
  const label = [`#${name}`, liveText, status, activity].filter(Boolean).join(", ");

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger
        render={
          <div
            id={id}
            role="option"
            aria-selected={highlighted}
            aria-label={label}
            title={`${label}\nClick: show it in this pane · Right-click: more`}
            data-testid={`picker-row-${login}`}
            data-picker-row={login}
            data-live={viewers !== null && viewers !== undefined ? "" : undefined}
            onClick={() => onChoose(login)}
            onPointerMove={() => {
              if (!highlighted) onHover(login);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-2 px-2 py-1 text-[13px] select-none",
              highlighted ? "bg-accent text-foreground shadow-[inset_2px_0_0_var(--ring)]" : "text-foreground hover:bg-accent/60",
            )}
          />
        }
      >
        <span className="relative shrink-0">
          <ChannelAvatar login={login} className={cn("size-6", view && view.status !== "joined" && "grayscale")} />
          {viewers !== null && viewers !== undefined ? (
            // Live: the same small green dot the old top strip had, outlined so it reads on every theme. Offline: no dot.
            <span
              aria-hidden
              data-live-dot
              className="zc-live-dot pointer-events-none absolute bottom-0 left-0 size-1.5 rounded-full bg-live ring-[1.5px] ring-surface"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {viewers !== null && viewers !== undefined ? (
          <span aria-hidden className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {liveLabel(viewers)}
          </span>
        ) : null}
        {view?.status === "error" ? (
          <span aria-hidden className="zc-badge grid size-3.5 shrink-0 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            !
          </span>
        ) : null}
        {mentions > 0 || unread > 0 ? (
          <span
            aria-hidden
            className={cn(
              "zc-badge grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] leading-none font-bold tabular-nums",
              mentions > 0 ? "bg-primary text-primary-foreground" : "bg-badge text-badge-ink",
            )}
          >
            {mentions > 0 ? `@${countLabel(mentions)}` : countLabel(unread)}
          </span>
        ) : null}
      </ContextMenuPrimitive.Trigger>
      <ChannelMenuPopup login={login} joined={joined} movable={movable} moveUp={moveUp} moveDown={moveDown} />
    </ContextMenuPrimitive.Root>
  );
});

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function Note({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-muted-foreground" data-testid={testId}>
      {children}
    </div>
  );
}

/** What the Following section says when it has no rows to show. */
function FollowingNote({ query, hasFollows }: { query: string; hasFollows: boolean }) {
  const followsState = useChat((s) => s.followsState);
  const auth = useChat((s) => s.auth.status);
  if (auth !== "logged_in") {
    return (
      <Note testId="picker-follows-note">
        <span>Log in to see the channels you follow.</span>
        <Button size="xs" variant="outline" disabled={auth === "booting"} onClick={() => useUi.setState({ loginOpen: true })}>
          Log in
        </Button>
      </Note>
    );
  }
  if (followsState === "needs-login") {
    return (
      <Note testId="picker-follows-note">
        <span>Sign in again to see follows.</span>
        <Button
          size="xs"
          variant="outline"
          data-testid="follows-login"
          title="Showing the channels you follow needs one more Twitch permission, so log in once more."
          onClick={() => useUi.setState({ loginOpen: true })}
        >
          Sign in again
        </Button>
      </Note>
    );
  }
  if (followsState === "error" && !hasFollows) {
    return (
      <Note testId="picker-follows-note">
        <span role="alert">Couldn't load your follows.</span>
        <Button size="xs" variant="outline" className="gap-1" data-testid="picker-retry" onClick={() => chat.retryFollows()}>
          <RotateCw className="size-3" /> Retry
        </Button>
      </Note>
    );
  }
  if ((followsState === "loading" || followsState === "off") && !hasFollows) return <Note testId="picker-follows-note">Loading…</Note>;
  if (!hasFollows) return <Note testId="picker-follows-note">No follows found</Note>;
  return query.trim() ? <Note>No matches</Note> : null;
}

/**
 * A pane's channel picker, shown inside the pane in place of its chat: search on top (focused when it opens),
 * Following and Added below. Arrows move the highlight, Enter or a click loads the channel into this pane, Esc or Back
 * closes it and puts focus back on the pane. The only place a channel is added.
 */
export function ChannelPicker({ pane, label }: { pane: PaneTarget; label: string }) {
  const channels = useChat((s) => s.settings.channels);
  const follows = useChat((s) => s.follows);
  const displayNames = useChat(useShallow((s) => Object.fromEntries(s.settings.channels.map((c) => [c, s.channels[c]?.displayName]))));
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set while the Menu key / Shift+F10 opens a row's menu, so the browser's own text menu is skipped only then.
  const menuKeyRef = useRef(false);
  const prefix = useId().replace(/:/g, "");

  const model = useMemo(() => pickerModel(query, channels, follows, displayNames), [query, channels, follows, displayNames]);
  const joined = useMemo(() => new Set(channels), [channels]);
  // Move up/down works on the whole Added list, not the filtered one.
  const addedAll = useMemo(() => channels.filter((c) => !(c in follows)), [channels, follows]);
  const highlight = moveHighlight(index, "", model.items.length);
  const current = model.items[highlight];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (current) document.getElementById(optionId(prefix, current))?.scrollIntoView({ block: "nearest" });
  }, [current, prefix]);

  // Stable handlers, so a highlight change only redraws the two rows whose highlight changed (lists can be long).
  const itemsRef = useRef(model.items);
  itemsRef.current = model.items;
  const choose = useCallback(
    (login: string) => {
      const result = loadIntoPane(pane, login);
      if (!result.ok) {
        toast.error(result.error ?? `Couldn't open #${login}`);
        return;
      }
      closePicker();
    },
    [pane],
  );
  const hover = useCallback((login: string) => {
    const at = itemsRef.current.findIndex((item) => item.kind === "channel" && item.login === login);
    if (at >= 0) setIndex(at);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed in a row's channel menu (a portal, but still a React child) belong to the menu: Esc closes it, not the picker.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker();
      return;
    }
    if (event.target !== inputRef.current) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setIndex(moveHighlight(highlight, event.key, model.items.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (current) choose(current.login);
    } else if ((event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) && current?.kind === "channel") {
      // The keyboard way to the channel menu: open it on the highlighted row.
      event.preventDefault();
      menuKeyRef.current = true;
      setTimeout(() => (menuKeyRef.current = false), 500);
      const row = document.getElementById(optionId(prefix, current));
      const box = row?.getBoundingClientRect();
      row?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: (box?.left ?? 0) + 24, clientY: box?.bottom ?? 0 }),
      );
    }
  };

  const rowsFor = (section: "following" | "added") =>
    (section === "following" ? model.following : model.added).map((row) => {
      const item = model.items.indexOf(row);
      return (
        <PickerRowView
          key={row.login}
          id={optionId(prefix, row)}
          login={row.login}
          name={row.name}
          joined={joined.has(row.login)}
          highlighted={item === highlight}
          movable={section === "added"}
          moveUp={section === "added" ? addedMoveOffset(addedAll, channels, row.login, -1) : null}
          moveDown={section === "added" ? addedMoveOffset(addedAll, channels, row.login, 1) : null}
          onChoose={choose}
          onHover={hover}
        />
      );
    });

  const addItem = model.addable ? model.items[model.items.length - 1] : null;

  return (
    <div
      role="region"
      aria-label={label}
      data-testid="channel-picker"
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
      onKeyDown={onKeyDown}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface px-1.5 py-1.5">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Back to the chat"
          title="Back (Esc)"
          data-testid="channel-picker-back"
          onClick={() => closePicker()}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          role="combobox"
          aria-expanded
          aria-controls={`${prefix}-following ${prefix}-added`}
          aria-activedescendant={current ? optionId(prefix, current) : undefined}
          aria-autocomplete="list"
          aria-label="Search channels, or type a name to add one"
          placeholder="Search or add a channel"
          data-testid="channel-picker-search"
          autoComplete="off"
          spellCheck={false}
          // The Menu key opens the highlighted row's menu (above), not the browser's own text menu. A mouse right-click
          // still gets the usual Cut / Copy / Paste.
          onContextMenu={(event) => {
            if (!menuKeyRef.current) return;
            menuKeyRef.current = false;
            event.preventDefault();
          }}
          className="h-7 min-w-0 flex-1 border border-input bg-background px-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="zoo-scroll min-h-0 flex-1 overflow-y-auto pb-1">
        <section aria-labelledby={`${prefix}-following-h`} data-testid="picker-section-following">
          <SectionHeading id={`${prefix}-following-h`}>Following</SectionHeading>
          {model.following.length === 0 ? <FollowingNote query={query} hasFollows={Object.keys(follows).length > 0} /> : null}
          <div role="listbox" id={`${prefix}-following`} aria-labelledby={`${prefix}-following-h`} data-picker-list>
            {rowsFor("following")}
          </div>
        </section>
        <section aria-labelledby={`${prefix}-added-h`} data-testid="picker-section-added">
          <SectionHeading id={`${prefix}-added-h`}>Added</SectionHeading>
          {model.added.length === 0 && !model.addable && model.items.length === 0 && query.trim() ? (
            // Same words the old add box used for a name that can't be a channel.
            <Note testId="picker-invalid">That doesn't look like a Twitch channel. Use letters, numbers and underscores.</Note>
          ) : model.added.length === 0 ? (
            <Note>{addedAll.length === 0 ? "Nothing added by hand yet. Type a channel name or twitch.tv link above to add one." : "No matches"}</Note>
          ) : null}
          <div role="listbox" id={`${prefix}-added`} aria-labelledby={`${prefix}-added-h`} data-picker-list>
            {rowsFor("added")}
            {addItem ? (
              <div
                id={optionId(prefix, addItem)}
                role="option"
                aria-selected={highlight === model.items.length - 1}
                data-testid="picker-add"
                onClick={() => choose(addItem.login)}
                onPointerMove={() => setIndex(model.items.length - 1)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-2 py-1 text-[13px] select-none",
                  highlight === model.items.length - 1 ? "bg-accent text-foreground shadow-[inset_2px_0_0_var(--ring)]" : "hover:bg-accent/60",
                )}
              >
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground text-muted-foreground">
                  <Plus className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  Add <span className="font-semibold">#{addItem.login}</span>
                </span>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
