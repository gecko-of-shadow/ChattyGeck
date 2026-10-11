import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
import { openExternal } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { isFeatureOn } from "@/store/settings";
import { insertIntoComposer } from "@/store/ui";
import { AddChannelForm, ChannelAvatar } from "./Sidebar";

/** Narrowest a grid box gets before the grid wraps to fewer columns. */
const BOX_MIN_WIDTH = 300;
/** Shortest a grid box gets before the grid scrolls instead of squeezing. */
const BOX_MIN_HEIGHT = 260;
const GRID_GAP = 8;

export function EmptyState() {
  return (
    <div className="zoo-texture-soft flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <Mascot anim="idle" className="mx-auto size-28 drop-shadow-[0_0_28px_rgb(var(--glow-rgb)/0.4)]" />
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Nothing in the zoo yet</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Add a Twitch channel and its chat gets its own box here. Add a few more and they tile side by side, or
            open one at a time with unread counts on the rest.
          </p>
        </div>
        <div className="mx-auto max-w-sm text-left">
          <AddChannelForm autoFocus />
        </div>
        <ul className="mx-auto grid max-w-sm gap-2 text-left text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Link2 className="size-3.5 text-primary" /> Paste a twitch.tv link, #channel, or just the name.
          </li>
          <li className="flex items-center gap-2">
            <Smile className="size-3.5 text-primary" /> Twitch, 7TV, BetterTTV and FrankerFaceZ emotes load automatically.
          </li>
          <li className="flex items-center gap-2">
            <UserRoundX className="size-3.5 text-primary" /> No login needed to read. Log in only to chat.
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
            className={cn("gap-1 font-normal text-muted-foreground", failing && "text-mention", compact && "px-1")}
            aria-label={`Emotes in #${channel}`}
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
                  <td className={cn("py-0.5 pr-2", channelStatus?.[p].state === "error" && "text-mention")}>
                    {!on ? "off here" : channelStatus ? statusText(channelStatus[p]) : "waiting"}
                  </td>
                  <td className={cn("py-0.5", globalStatus[p].state === "error" && "text-mention")}>
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
function ChannelPlaceholder({ login, compact = false }: { login: string; compact?: boolean }) {
  const view = useChat((s) => s.channels[login]);
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
}

export function FocusedView({ login }: { login: string }) {
  const view = useChat((s) => s.channels[login]);
  if (!view) return null;
  return (
    <ChatLog
      messages={view.messages}
      channel={login}
      viewKey={`focused:${login}`}
      empty={<ChannelPlaceholder login={login} />}
      readMarker={view.readMarker}
      onNameClick={(name) => insertIntoComposer(`@${name} `, login)}
    />
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
        <span key={label} title={label} aria-label={label} className="text-muted-foreground">
          <Icon className="size-3" />
        </span>
      ))}
    </>
  );
}

/** One channel's chat inside the grid: header, its own log, its own message box. */
function ChatBox({ login }: { login: string }) {
  const view = useChat((s) => s.channels[login]);
  const index = useChat((s) => s.settings.channels.indexOf(login));
  const count = useChat((s) => s.settings.channels.length);
  if (!view) return null;

  const statusTitle =
    view.status === "joined" ? "Connected" : view.status === "joining" ? "Joining…" : (view.error ?? "Couldn't join");

  return (
    <section
      aria-label={`#${login} chat`}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/50 shadow-sm"
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/70 bg-card/80 pr-1 pl-2">
        <span className="relative shrink-0">
          <ChannelAvatar login={login} className="size-5 text-[10px]" />
          <span
            title={statusTitle}
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card",
              view.status === "joined" && "bg-primary",
              view.status === "joining" && "animate-pulse bg-mascot-eye",
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
            <DropdownMenuItem disabled={index <= 0} onClick={() => chat.moveChannel(login, -1)}>
              <ArrowLeft /> Move earlier
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index >= count - 1} onClick={() => chat.moveChannel(login, 1)}>
              <ArrowRight /> Move later
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => chat.removeChannel(login)}>
              <X /> Leave #{login}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <ChatLog
        messages={view.messages}
        channel={login}
        viewKey={`box:${login}`}
        label={`#${login} messages`}
        liveRows={120}
        empty={<ChannelPlaceholder login={login} compact />}
        onNameClick={(name) => insertIntoComposer(`@${name} `, login)}
      />
      <Composer channel={login} compact />
    </section>
  );
}

/** Every joined channel in its own box, tiled to fill the window. */
export function GridView() {
  const channels = useChat((s) => s.settings.channels);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 1200, height: 800 });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setArea({ width: el.clientWidth - 2 * GRID_GAP, height: el.clientHeight - 2 * GRID_GAP });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = channels.length;
  const maxColumns = Math.max(1, Math.floor((area.width + GRID_GAP) / (BOX_MIN_WIDTH + GRID_GAP)));
  const rows = Math.ceil(count / Math.min(count, maxColumns));
  const columns = Math.ceil(count / rows);
  const rowHeight = Math.max(BOX_MIN_HEIGHT, Math.floor((area.height - GRID_GAP * (rows - 1)) / rows));

  return (
    <div ref={scrollRef} className="zoo-scroll min-h-0 flex-1 overflow-y-auto" style={{ padding: GRID_GAP }}>
      <div
        className="grid"
        style={{
          gap: GRID_GAP,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: `${rowHeight}px`,
        }}
      >
        {channels.map((login) => (
          <ChatBox key={login} login={login} />
        ))}
      </div>
    </div>
  );
}
