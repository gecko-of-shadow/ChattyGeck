import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Link2,
  Lock,
  Maximize2,
  Minus,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Smile,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
import { ChatLog } from "@/components/chat/ChatLog";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chat } from "@/lib/chat/controller";
import { emoteRegistry } from "@/lib/emotes/registry";
import { PROVIDER_LABELS, THIRD_PARTY_PROVIDERS, type ProviderStatus } from "@/lib/emotes/types";
import { GRID_EDGE, GRID_GAP, layoutViewGrid, viewColumns, viewForSlots } from "@/lib/gridLayout";
import { openExternal } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "@/store/chat";
import { isFeatureOn } from "@/store/settings";
import { insertIntoComposer, useUi } from "@/store/ui";
import { beginChannelDrag } from "./gridDrag";
import { AddChannelForm, ChannelAvatar } from "./Sidebar";

export function EmptyState() {
  const gridSlots = useChat((s) => viewForSlots(s.settings.gridSlots));
  return (
    <div className="zoo-texture-soft flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <Mascot anim="idle" className="mx-auto size-28" />
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Nothing in the zoo yet</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Follow Twitch channels — up to {gridSlots} sit on this grid. Add more to keep them in the top strip, then pin
            them here or read one alone (view 1).
          </p>
        </div>
        <div className="mx-auto max-w-sm text-left">
          <AddChannelForm autoFocus />
        </div>
        <ul className="mx-auto grid max-w-sm gap-2 text-left text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Link2 className="size-3.5 text-accent-text" /> Paste a twitch.tv link, #channel, or just the name.
          </li>
          <li className="flex items-center gap-2">
            <Smile className="size-3.5 text-accent-text" /> Twitch, 7TV, BetterTTV and FrankerFaceZ emotes load automatically.
          </li>
          <li className="flex items-center gap-2">
            <UserRoundX className="size-3.5 text-accent-text" /> No login needed to read. Log in only to chat.
          </li>
        </ul>
      </div>
    </div>
  );
}

function statusText(status: ProviderStatus): string {
  switch (status.state) {
    case "ok":
      return `${status.count} emote${status.count === 1 ? "" : "s"}`;
    case "none":
      return "none for this channel";
    case "loading":
      return "loading…";
    case "error":
      return `unavailable (${status.error})`;
    default:
      return "waiting";
  }
}

export function EmoteStatusChip({
  channel,
  compact = false,
  onlyWhenFailing = false,
  open,
  onOpenChange,
}: {
  channel: string;
  compact?: boolean;
  /** Grid panes: show the chip only as a warning, or while opened from the pane menu. */
  onlyWhenFailing?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const version = useChat((s) => `${s.emoteVersions[channel] ?? 0}.${s.globalEmoteVersion}`);
  const settings = useChat((s) => s.settings);
  const [, force] = useState(0);
  useEffect(() => force((n) => n + 1), [version]);
  const channelStatus = emoteRegistry.getChannelStatus(channel);
  const globalStatus = emoteRegistry.getGlobalStatus();
  const failing = THIRD_PARTY_PROVIDERS.some(
    (p) => channelStatus?.[p].state === "error" || globalStatus[p].state === "error",
  );
  const total = THIRD_PARTY_PROVIDERS.reduce((sum, p) => {
    if (!isFeatureOn(settings, channel, p)) return sum;
    const c = channelStatus?.[p];
    return sum + (c?.state === "ok" ? c.count : 0);
  }, 0);

  if (onlyWhenFailing && !failing && !open) return null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className={cn("gap-1 font-normal text-muted-foreground", failing && "text-warn", compact && "px-1")}
            aria-label={failing ? `Emotes in #${channel}: an emote source failed` : `Emotes in #${channel}`}
            title={`${total} channel emotes`}
          />
        }
      >
        {failing ? <AlertTriangle className="size-3" /> : <Smile className="size-3" />}
        {compact ? null : <span className="hidden lg:inline">{total} channel emotes</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-xs">
        <div className="mb-2 font-semibold">Emotes in #{channel}</div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 font-medium">Provider</th>
              <th className="pb-1 font-medium">Channel</th>
              <th className="pb-1 font-medium">Global</th>
            </tr>
          </thead>
          <tbody>
            {THIRD_PARTY_PROVIDERS.map((p) => {
              const on = isFeatureOn(settings, channel, p);
              return (
                <tr key={p}>
                  <td className="py-0.5 pr-2 font-medium">{PROVIDER_LABELS[p]}</td>
                  <td className={cn("py-0.5 pr-2", channelStatus?.[p].state === "error" && "text-warn")}>
                    {!on ? "off here" : channelStatus ? statusText(channelStatus[p]) : "waiting"}
                  </td>
                  <td className={cn("py-0.5", globalStatus[p].state === "error" && "text-warn")}>
                    {!on ? "off here" : statusText(globalStatus[p])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-muted-foreground">Twitch emotes always come straight from chat messages.</p>
        <Button size="xs" variant="outline" className="mt-2 gap-1" onClick={() => chat.reloadEmotes(channel)}>
          <RotateCw className="size-3" /> Reload emotes
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** What a channel's log shows before its first message arrives. */
const ChannelPlaceholder = memo(function ChannelPlaceholder({ login, compact = false }: { login: string; compact?: boolean }) {
  const view = useChat(
    useShallow((s) => {
      const channel = s.channels[login];
      if (!channel) return null;
      return { status: channel.status, error: channel.error };
    }),
  );
  if (!view) return null;
  const size = compact ? "size-10" : "size-16";
  if (view.status === "error") {
    return (
      <div className="max-w-sm space-y-3 text-center">
        <Mascot className={cn("mx-auto opacity-60 grayscale", size)} />
        <p className="font-semibold">Couldn't join #{login}</p>
        <p className="text-sm text-muted-foreground">{view.error}</p>
        <Button variant="outline" size="sm" onClick={() => chat.removeChannel(login)}>
          Remove #{login}
        </Button>
      </div>
    );
  }
  if (view.status === "joining") {
    return (
      <div className="space-y-3 text-center">
        <Mascot anim="scurry" className={cn("mx-auto", size)} />
        <p className="text-sm text-muted-foreground">Joining #{login}…</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-center">
      <Mascot anim="idle" className={cn("mx-auto", size)} />
      <p className="text-sm text-muted-foreground">
        Connected to #{login}. New messages show up here the moment someone talks.
      </p>
    </div>
  );
});

/** Subscribes to the message list only, so headers and composers stay put while chat arrives. */
function ChannelLog({
  login,
  viewKey,
  label,
  liveRows,
  compactEmpty = false,
}: {
  login: string;
  viewKey: string;
  label: string;
  liveRows?: number;
  compactEmpty?: boolean;
}) {
  const messages = useChat((s) => s.channels[login]?.messages);
  const readMarker = useChat((s) => s.channels[login]?.readMarker);
  // A fresh function here would redraw every visible row on each incoming line.
  const onNameClick = useCallback((name: string) => insertIntoComposer(`@${name} `, login), [login]);
  if (!messages) return null;
  return (
    <ChatLog
      messages={messages}
      channel={login}
      viewKey={viewKey}
      label={label}
      liveRows={liveRows}
      readMarker={readMarker}
      empty={<ChannelPlaceholder login={login} compact={compactEmpty} />}
      onNameClick={onNameClick}
    />
  );
}

/** Header of the single view (view 1): the channel, its join status and emote status. */
function SingleHeader({ login }: { login: string }) {
  const view = useChat(
    useShallow((s) => {
      const channel = s.channels[login];
      return channel ? { displayName: channel.displayName, status: channel.status } : null;
    }),
  );
  if (!view) return null;
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b-2 border-accent-2 bg-surface px-3" data-testid="single-header">
      <ChannelAvatar login={login} className="size-6" />
      <h2 className="truncate text-sm font-semibold">#{view.displayName ?? login}</h2>
      <span className="truncate text-xs text-muted-foreground">
        {view.status === "joined" ? "Connected" : view.status === "joining" ? "Joining…" : "Couldn't join"}
      </span>
      <span className="flex-1" />
      <EmoteStatusChip channel={login} />
    </div>
  );
}

export function FocusedView({ login }: { login: string }) {
  const exists = useChat((s) => s.channels[login] != null);
  if (!exists) return null;
  return (
    <>
      <SingleHeader login={login} />
      <ChannelLog login={login} viewKey={`focused:${login}`} label="Chat messages" />
    </>
  );
}

function RoomIcons({ login }: { login: string }) {
  const room = useChat((s) => s.channels[login]?.roomState);
  if (!room) return null;
  const icons: { icon: typeof Clock; label: string }[] = [];
  if (room.emoteOnly) icons.push({ icon: Smile, label: "Emote-only chat" });
  if (room.subsOnly) icons.push({ icon: Lock, label: "Subscribers-only chat" });
  if (room.followersOnly !== undefined && room.followersOnly >= 0) {
    icons.push({ icon: Users, label: room.followersOnly === 0 ? "Followers-only chat" : `Followers-only (${room.followersOnly}m+)` });
  }
  if (room.slow) icons.push({ icon: Clock, label: `Slow mode: ${room.slow}s` });
  return (
    <>
      {icons.map(({ icon: Icon, label }) => (
        <span key={label} title={label} role="img" aria-label={label} className="text-muted-foreground">
          <Icon className="size-3" />
        </span>
      ))}
    </>
  );
}

/**
 * Clicking or tabbing into a pane makes it the focused one, and also the one "under the pointer" that Ctrl+G,
 * Alt+Shift+arrows and Ctrl+K's grid slot use, so keyboard and mouse agree.
 */
function activate(login: string): void {
  chat.setActivePane(login);
  if (useUi.getState().hoveredChannel !== login) useUi.setState({ hoveredChannel: login });
}

/** One channel's chat inside the grid: a slim header (drag to swap, double-click for Single) and its log. The one shared message box at the bottom sends to the focused pane. */
function ChatBox({ login }: { login: string }) {
  const view = useChat(
    useShallow((s) => {
      const channel = s.channels[login];
      if (!channel) return null;
      return { status: channel.status, error: channel.error, displayName: channel.displayName };
    }),
  );
  const gridChannels = useChat((s) => s.settings.gridChannels);
  const active = useChat((s) => s.settings.focused === login);
  const dropTarget = useUi((s) => s.dropTarget);
  const [emoteStatusOpen, setEmoteStatusOpen] = useState(false);
  if (!view) return null;

  const name = view.displayName ?? login;
  const status = view.status === "joined" ? null : view.status === "joining" ? "joining…" : "couldn't join";

  return (
    <section
      aria-label={`#${name} chat${active ? " (focused)" : ""}${view.status === "error" ? `, couldn't join: ${view.error ?? "error"}` : ""}`}
      data-grid-channel={login}
      data-active={active || undefined}
      onPointerEnter={() => useUi.setState({ hoveredChannel: login })}
      // Clicking anywhere in a pane makes it the focused one (the message box sends there).
      onPointerDownCapture={() => activate(login)}
      onFocusCapture={() => activate(login)}
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 flex-col bg-background",
        // Drop target: an overlay ring drawn on top of the header, log and box (an inset shadow would sit under them).
        dropTarget === login &&
          "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:shadow-[inset_0_0_0_2px_var(--primary)] after:content-['']",
      )}
    >
      <header
        className={cn(
          "flex h-9 shrink-0 cursor-grab items-center gap-2 border-b bg-surface pr-1 pl-3 active:cursor-grabbing",
          // The focused pane: teal underline (and a word for screen readers in the section name).
          active ? "border-b-2 border-accent-2" : "border-border",
        )}
        data-testid={`grid-header-${login}`}
        onPointerDown={(event) => beginChannelDrag(event, login, "box")}
        onMouseDown={(event) => beginChannelDrag(event, login, "box")}
        onDoubleClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) return;
          chat.focus(login);
        }}
        title={`#${name}. Drag to swap. Double-click to open alone.`}
      >
        <h2 className="min-w-0 truncate text-[13px] font-semibold">#{name}</h2>
        {status ? (
          <span className={cn("shrink-0 text-xs", view.status === "error" ? "text-danger-text" : "text-muted-foreground")} title={view.error}>
            {status}
          </span>
        ) : null}
        <RoomIcons login={login} />
        <span className="flex-1" />
        <EmoteStatusChip channel={login} compact onlyWhenFailing open={emoteStatusOpen} onOpenChange={setEmoteStatusOpen} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label={`Options for #${name}`} title="More" />}
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => chat.focus(login)}>
              <Maximize2 /> Open alone (view 1)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEmoteStatusOpen(true)}>
              <Smile /> Emote status…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chat.reloadEmotes(login)}>
              <RefreshCw /> Reload emotes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void openExternal(`https://www.twitch.tv/${login}`)}>
              <ExternalLink /> Open on twitch.tv
            </DropdownMenuItem>
            {gridChannels
              .filter((other) => other !== login)
              .map((other) => (
                <DropdownMenuItem key={other} onClick={() => chat.swapGridChannels(login, other)}>
                  Swap with #{other}
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem onClick={() => chat.hideFromGrid(login)}>
              <Minus /> Hide from grid
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => chat.removeChannel(login)}>
              <X /> Leave #{login}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => chat.hideFromGrid(login)}
          aria-label={`Hide #${name} from the grid`}
          title="Hide from the grid"
        >
          <Minus className="size-3.5" />
        </Button>
      </header>
      {/* h-full chain matters: without a definite height the absolute ChatLog collapses to 0 (composer-only pane). */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden" data-testid={`grid-log-${login}`}>
        <ChannelLog
          login={login}
          viewKey={`box:${login}`}
          label={`#${login} messages`}
          liveRows={120}
          compactEmpty
        />
      </div>
    </section>
  );
}

/** Empty pane in a view that has more panes than pinned channels. */
function EmptyPane() {
  const parked = useChat((s) => s.settings.gridParked.length);
  return (
    <div className="flex min-h-0 items-center justify-center bg-background p-4 text-center text-xs text-muted-foreground">
      {parked > 0
        ? `Empty pane. ${parked} channel${parked === 1 ? "" : "s"} set aside: pick this view again at the top right to bring ${parked === 1 ? "it" : "them"} back, or press + on a channel above.`
        : "Empty pane. Press + on a channel in the top strip to fill it."}
    </div>
  );
}

/** The grid views (2, 3, 4, 6, 9 panes): pinned channels in a fixed packing, empty panes after them. */
export function GridView() {
  const channels = useChat((s) => s.settings.gridChannels);
  const following = useChat((s) => s.settings.channels.length);
  const view = useChat((s) => viewForSlots(s.settings.gridSlots));
  const parked = useChat((s) => s.settings.gridParked.length);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 1200, height: 800 });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = el.clientWidth - 2 * GRID_EDGE;
        const height = el.clientHeight - 2 * GRID_EDGE;
        setArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // Re-measure when the grid appears after being empty (the scroller isn't rendered then).
  }, [channels.length === 0]);

  if (channels.length === 0) {
    return (
      <div className="zoo-texture-soft flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center">
          <Mascot anim="idle" className="mx-auto size-20" />
          <h2 className="text-lg font-bold">Nothing on the grid</h2>
          <p className="text-sm text-muted-foreground">
            {following === 0
              ? "Add a channel with the + at the end of the top strip to start."
              : `You're following ${following} channel${following === 1 ? "" : "s"} off-grid. Press + on a channel in the top strip (this view has ${view} panes), or pick 1 at the top right to read one alone.`}
          </p>
          {parked > 0 ? (
            <p className="text-sm text-muted-foreground">
              {parked} channel{parked === 1 ? " is" : "s are"} set aside from a bigger view: pick this view again at the top right to
              bring {parked === 1 ? "it" : "them"} back.
            </p>
          ) : null}
          <div className="mx-auto max-w-xs pt-1 text-left">
            <AddChannelForm />
          </div>
        </div>
      </div>
    );
  }

  const layout = layoutViewGrid(view, area.width, area.height);
  const shown = channels.slice(0, view);
  const empty = Math.max(0, view - shown.length);

  return (
    <div
      ref={scrollRef}
      data-testid="grid-canvas"
      className="zoo-scroll min-h-0 flex-1 overflow-y-auto bg-gap"
      style={{ padding: GRID_EDGE }}
    >
      {layout.columns < viewColumns(view) ? (
        <p className="bg-background px-2 py-1 text-[11px] text-muted-foreground">
          This window is narrow, so the panes are stacked in fewer columns. Pick 1 at the top right (or Ctrl+G) to read one alone.
        </p>
      ) : null}
      <div
        className="grid w-full justify-items-stretch"
        style={{
          gap: GRID_GAP,
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridAutoRows: `${layout.cellHeight}px`,
        }}
        data-testid="chat-grid"
        data-grid-cols={layout.columns}
        data-view={view}
      >
        {shown.map((login) => (
          <ChatBox key={login} login={login} />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <EmptyPane key={`empty-${i}`} />
        ))}
      </div>
    </div>
  );
}
