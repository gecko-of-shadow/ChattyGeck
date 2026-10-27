import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Link2,
  Lock,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Smile,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
import { ChatLog } from "@/components/chat/ChatLog";
import { Composer } from "@/components/chat/Composer";
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
import { GRID_EDGE, GRID_GAP, layoutChatGrid } from "@/lib/gridLayout";
import { openExternal } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "@/store/chat";
import { isFeatureOn } from "@/store/settings";
import { insertIntoComposer, useUi } from "@/store/ui";
import { beginChannelDrag } from "./gridDrag";
import { AddChannelForm, ChannelAvatar } from "./Sidebar";

export function EmptyState() {
  const gridSlots = useChat((s) => s.settings.gridSlots);
  return (
    <div className="zoo-texture-soft flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <Mascot anim="idle" className="mx-auto size-28" />
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Nothing in the zoo yet</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Follow Twitch channels — up to {gridSlots} sit on this grid. Add more to keep watching from the sidebar, then pin
            them here or open one in Single.
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

export function EmoteStatusChip({ channel, compact = false }: { channel: string; compact?: boolean }) {
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

  return (
    <Popover>
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

export function FocusedView({ login }: { login: string }) {
  const exists = useChat((s) => s.channels[login] != null);
  if (!exists) return null;
  return <ChannelLog login={login} viewKey={`focused:${login}`} label="Chat messages" />;
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
        <span key={label} title={label} aria-label={label} className="text-muted-foreground">
          <Icon className="size-3" />
        </span>
      ))}
    </>
  );
}

/** One channel's chat inside the grid: header, its own log, its own message box. */
function ChatBox({ login }: { login: string }) {
  const view = useChat(
    useShallow((s) => {
      const channel = s.channels[login];
      if (!channel) return null;
      return { status: channel.status, error: channel.error, displayName: channel.displayName };
    }),
  );
  const gridChannels = useChat((s) => s.settings.gridChannels);
  const readOnly = useChat((s) => s.settings.readOnly);
  const dropTarget = useUi((s) => s.dropTarget);
  if (!view) return null;

  const statusTitle =
    view.status === "joined" ? "Connected" : view.status === "joining" ? "Joining…" : (view.error ?? "Couldn't join");

  return (
    <section
      aria-label={`#${login} chat`}
      data-grid-channel={login}
      onPointerEnter={() => useUi.setState({ hoveredChannel: login })}
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl border bg-card/50 shadow-sm",
        dropTarget === login ? "border-primary ring-2 ring-primary/50" : "border-border/80",
      )}
    >
      <header
        className="flex h-9 shrink-0 cursor-grab items-center gap-1.5 rounded-t-xl border-b border-border/70 bg-card/80 pr-1 pl-2 active:cursor-grabbing"
        data-testid={`grid-header-${login}`}
        onPointerDown={(event) => beginChannelDrag(event, login, "box")}
        onMouseDown={(event) => beginChannelDrag(event, login, "box")}
        onDoubleClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) return;
          chat.focus(login);
        }}
        title="Drag to swap. Double-click to open Single."
      >
        <span className="relative shrink-0">
          <ChannelAvatar login={login} className="size-5 text-[10px]" />
          <span
            title={statusTitle}
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card",
              view.status === "joined" && "bg-primary",
              view.status === "joining" && "animate-pulse bg-warn",
              view.status === "error" && "bg-destructive",
            )}
          />
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold">#{view.displayName ?? login}</span>
        <RoomIcons login={login} />
        <span className="flex-1" />
        <EmoteStatusChip channel={login} compact />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => chat.focus(login)}
          aria-label={`Focus #${login}`}
          title="Open on its own"
        >
          <Maximize2 className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label={`Options for #${login}`} />}
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
              <X /> Hide from grid
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => chat.removeChannel(login)}>
              Leave #{login}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      {readOnly ? null : (
        <div className="relative z-10 shrink-0 overflow-visible rounded-b-xl">
          <Composer channel={login} compact />
        </div>
      )}
    </section>
  );
}

/** Up to four pinned channels in boxes; other follows stay in the sidebar. */
export function GridView() {
  const channels = useChat((s) => s.settings.gridChannels);
  const following = useChat((s) => s.settings.channels.length);
  const gridSlots = useChat((s) => s.settings.gridSlots);
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
  }, []);

  if (channels.length === 0) {
    return (
      <div className="zoo-texture-soft flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center">
          <Mascot anim="idle" className="mx-auto size-20" />
          <h2 className="text-lg font-bold">Nothing on the grid</h2>
          <p className="text-sm text-muted-foreground">
            {following === 0
              ? "Add a channel from the sidebar to start."
              : `You're following ${following} channel${following === 1 ? "" : "s"} off-grid. Use Show in grid (up to ${gridSlots}) or open one in Single.`}
          </p>
        </div>
      </div>
    );
  }

  const layout = layoutChatGrid(channels.length, area.width, area.height);

  return (
    <div
      ref={scrollRef}
      data-testid="grid-canvas"
      className="zoo-scroll zoo-texture-soft min-h-0 flex-1 overflow-y-auto"
      style={{ padding: GRID_EDGE }}
    >
      {layout.suggestSingle && area.width < 480 && channels.length > 1 ? (
        <p className="mb-1 px-1 text-[11px] text-muted-foreground">This window is narrow. Ctrl+G opens Single. The grid stays stacked.</p>
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
      >
        {channels.map((login) => (
          <ChatBox key={login} login={login} />
        ))}
      </div>
    </div>
  );
}
