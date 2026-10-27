import { memo, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { ArrowLeft, ArrowRight, ExternalLink, EyeOff, LayoutGrid, Maximize2, Minus, Plus, RefreshCw, Settings, Smile, X } from "lucide-react";
import { toast } from "sonner";
import geckoLogo from "@/assets/gecko-logo.png";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chat } from "@/lib/chat/controller";
import { liveLabel, mergeStrip, stripMoveOffsets } from "@/lib/follows";
import { openExternal } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { openSettings, useUi } from "@/store/ui";
import { ConnectionPill } from "./ChatHeader";
import { beginChannelDrag } from "./gridDrag";
import { AddChannelForm, ChannelAvatar } from "./Sidebar";
import { StripEmoteStatus } from "./Views";
import { ViewSwitch } from "./ViewSwitch";

function countLabel(n: number): string {
  return n > 99 ? "99+" : String(n);
}

function showOrHide(login: string, onGrid: boolean): void {
  if (onGrid) {
    chat.hideFromGrid(login);
    return;
  }
  const result = chat.showInGrid(login);
  if (!result.ok) toast.error(result.error ?? "Couldn't show it in the grid");
}

/** A Twitch follow that isn't in the app yet joins chat first (it lands in the grid when there's room). */
function addFollow(login: string): boolean {
  const result = chat.addChannel(login);
  if (!result.ok) toast.error(result.error ?? `Couldn't open #${login}`);
  return result.ok;
}

function openAlone(login: string, joined: boolean): void {
  if (!joined && !addFollow(login)) return;
  chat.focus(login);
}

function plusOrMinus(login: string, joined: boolean, onGrid: boolean): void {
  // addChannel puts it in the grid, or says the grid is full.
  if (!joined) addFollow(login);
  else showOrHide(login, onGrid);
}

/**
 * Everything the old sidebar's ⋯ menu did, on right-click (or the Menu key) on an avatar. A follow that isn't joined
 * only offers opening it; Move left/right only for channels whose place you choose (follows go by follow date).
 */
function AvatarMenu({
  login,
  joined,
  onGrid,
  moveLeft,
  moveRight,
  movable,
}: {
  login: string;
  joined: boolean;
  onGrid: boolean;
  moveLeft: number | null;
  moveRight: number | null;
  movable: boolean;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
        <ContextMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className="z-50 min-w-52 overflow-hidden border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
        >
          <DropdownMenuItem onClick={() => openAlone(login, joined)}>
            <Maximize2 /> Open alone (view 1)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => plusOrMinus(login, joined, onGrid)}>
            {onGrid ? <EyeOff /> : <LayoutGrid />} {onGrid ? "Hide from grid" : "Show in grid"}
          </DropdownMenuItem>
          {joined ? (
            <>
              <DropdownMenuItem onClick={() => useUi.setState({ emoteStatusFor: login })}>
                <Smile /> Emote status…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => chat.reloadEmotes(login)}>
                <RefreshCw /> Reload emotes
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem onClick={() => void openExternal(`https://www.twitch.tv/${login}`)}>
            <ExternalLink /> Open on twitch.tv
          </DropdownMenuItem>
          {movable ? (
            <>
              <DropdownMenuItem disabled={moveLeft === null} onClick={() => moveLeft !== null && chat.moveChannel(login, moveLeft)}>
                <ArrowLeft /> Move left
              </DropdownMenuItem>
              <DropdownMenuItem disabled={moveRight === null} onClick={() => moveRight !== null && chat.moveChannel(login, moveRight)}>
                <ArrowRight /> Move right
              </DropdownMenuItem>
            </>
          ) : null}
          {joined ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => chat.removeChannel(login)}>
                <X /> Leave #{login}
              </DropdownMenuItem>
            </>
          ) : null}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

/**
 * One channel in the strip (added in the app, followed on Twitch, or both): round avatar, teal ring when on screen,
 * +/− badge, mention or unread count, green dot while live.
 */
// Memoized and fed by the strip (which knows joined / in-grid from one Set each), so a chat flush only redraws the
// avatar whose channel changed, even with hundreds of follows in the strip.
const StripAvatar = memo(function StripAvatar({
  login,
  joined,
  onGrid,
  moveLeft,
  moveRight,
}: {
  login: string;
  joined: boolean;
  onGrid: boolean;
  moveLeft: number | null;
  moveRight: number | null;
}) {
  const view = useChat(
    useShallow((s) => {
      const channel = s.channels[login];
      if (!channel) return null;
      return {
        status: channel.status,
        error: channel.error,
        displayName: channel.displayName,
        unread: channel.unread,
        mentions: channel.mentions,
      };
    }),
  );
  const followName = useChat((s) => s.follows[login]?.displayName);
  const followed = followName !== undefined;
  const active = useChat((s) => s.settings.mode === "focused" && s.settings.focused === login);
  // The teal ring marks what's on screen: the panes in a grid view, the one channel in view 1 (as view1.png, Bran's choice).
  const ringed = useChat((s) => (s.settings.mode === "focused" ? s.settings.focused === login : onGrid));
  // undefined: offline; null: not known (logged out, no dots).
  const viewers = useChat((s) => (s.live === null ? null : s.live[login]));
  if (!view && !followed) return null;

  const name = view?.displayName ?? followName ?? login;
  const status = !view || view.status === "joined" ? null : view.status === "joining" ? "joining" : `couldn't join: ${view.error ?? "error"}`;
  const mentions = view?.mentions ?? 0;
  const unread = view?.unread ?? 0;
  const activity = mentions > 0 ? `${mentions} mention${mentions === 1 ? "" : "s"}` : unread > 0 ? `${unread} unread` : null;
  const liveText = viewers === null ? null : viewers === undefined ? "offline" : `live, ${liveLabel(viewers)}`;
  const label = [`#${name}`, liveText, onGrid ? "in the grid" : null, joined ? null : "followed on Twitch, chat not open", status, activity]
    .filter(Boolean)
    .join(", ");

  return (
    <li className="relative shrink-0" data-strip-channel={login}>
      <ContextMenuPrimitive.Root>
        <ContextMenuPrimitive.Trigger
          className="relative"
          onPointerDown={(event) => beginChannelDrag(event, login, "sidebar")}
          onMouseDown={(event) => beginChannelDrag(event, login, "sidebar")}
        >
          <button
            type="button"
            data-drag-channel={login}
            onClick={() => openAlone(login, joined)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            title={`${label}\nClick: open alone · Right-click: more · Drag onto a pane to put it there`}
            className={cn(
              "block rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface",
              // On-screen ring as an outline: separate from the focus ring (gap between them) and kept by Windows contrast themes.
              ringed && "outline-2 outline-offset-1 outline-solid outline-accent-2",
            )}
          >
            <ChannelAvatar
              login={login}
              className={cn(
                "size-9",
                view && view.status !== "joined" && "grayscale",
              )}
            />
          </button>
          {mentions > 0 || unread > 0 ? (
            <span
              aria-hidden
              className={cn(
                "zc-badge pointer-events-none absolute -top-1 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full border border-surface px-1 text-[10px] leading-none font-bold tabular-nums",
                mentions > 0 ? "bg-primary text-primary-foreground" : "bg-badge text-badge-ink",
              )}
            >
              {mentions > 0 ? `@${countLabel(mentions)}` : countLabel(unread)}
            </span>
          ) : null}
          {viewers !== null && viewers !== undefined ? (
            // Live: a small green dot at the bottom-left (half the +/− badge), outlined so it reads on every theme.
            <span
              aria-hidden
              data-live-dot
              className="zc-live-dot pointer-events-none absolute bottom-0 left-0 size-1.5 rounded-full bg-live ring-[1.5px] ring-surface"
            />
          ) : null}
          {view?.status === "error" ? (
            <span
              aria-hidden
              className="zc-badge pointer-events-none absolute -top-1 -left-1 grid size-3.5 place-items-center rounded-full border border-surface bg-destructive text-[9px] leading-none font-bold text-destructive-foreground"
            >
              !
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => plusOrMinus(login, joined, onGrid)}
            aria-label={onGrid ? `Hide #${name} from the grid` : `Show #${name} in the grid`}
            title={onGrid ? `Hide #${name} from the grid` : `Show #${name} in the grid`}
            className="zc-badge absolute -right-0.5 -bottom-0.5 grid size-3 place-items-center rounded-full border border-surface bg-badge text-badge-ink outline-none hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {onGrid ? <Minus className="size-2" strokeWidth={3.5} /> : <Plus className="size-2" strokeWidth={3.5} />}
          </button>
        </ContextMenuPrimitive.Trigger>
        <AvatarMenu
          login={login}
          joined={joined}
          onGrid={onGrid}
          movable={joined && !followed}
          moveLeft={moveLeft}
          moveRight={moveRight}
        />
      </ContextMenuPrimitive.Root>
    </li>
  );
});

/** Logged in before ZooChattr asked to read follows: one click to log in again (until then the strip is the app list). */
function FollowsLoginChip() {
  const needed = useChat((s) => s.followsState === "needs-login");
  if (!needed) return null;
  return (
    <li className="shrink-0">
      <Button
        variant="outline"
        size="xs"
        data-testid="follows-login"
        onClick={() => useUi.setState({ loginOpen: true })}
        title="ZooChattr can now show the channels you follow on Twitch. That needs one more Twitch permission, so log in once more."
      >
        Log in again to see your Twitch follows
      </Button>
    </li>
  );
}

/** "+" at the end of the strip: add a channel by name, #name or twitch.tv link. */
function AddTile() {
  const [open, setOpen] = useState(false);
  return (
    <li className="shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Add a channel"
              title="Add a channel (name, #name or twitch.tv link)"
              data-testid="add-channel-tile"
              className="grid size-9 place-items-center rounded-full border border-dashed border-muted-foreground text-muted-foreground outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <Plus className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <AddChannelForm autoFocus onAdded={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </li>
  );
}

/** Channels added in the app plus Twitch follows (newest first), sideways scrolling, with the add tile at the end. */
function ChannelStrip() {
  const channels = useChat((s) => s.settings.channels);
  const gridChannels = useChat((s) => s.settings.gridChannels);
  const follows = useChat((s) => s.follows);
  const order = useMemo(() => mergeStrip(channels, follows), [channels, follows]);
  const joined = useMemo(() => new Set(channels), [channels]);
  const onGrid = useMemo(() => new Set(gridChannels), [gridChannels]);
  const moves = useMemo(
    () => stripMoveOffsets(order, channels, (login) => joined.has(login) && !(login in follows)),
    [order, channels, joined, follows],
  );
  return (
    <nav
      aria-label="Channels"
      className="zoo-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      // A plain mouse wheel scrolls the strip sideways (it only scrolls that way).
      onWheel={(event) => {
        if (event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.currentTarget.scrollLeft += event.deltaY;
      }}
    >
      <ul className="flex w-max items-center gap-3 p-2">
        {/* First, so it's seen even with a long strip or a narrow window. */}
        <FollowsLoginChip />
        {order.map((login) => (
          <StripAvatar
            key={login}
            login={login}
            joined={joined.has(login)}
            onGrid={onGrid.has(login)}
            moveLeft={moves.get(login)?.left ?? null}
            moveRight={moves.get(login)?.right ?? null}
          />
        ))}
        <AddTile />
      </ul>
    </nav>
  );
}

/** The top bar: gecko logo, channel strip, connection status, view switch and gear (same place on every screen). */
export function TopBar() {
  const settingsOpen = useUi((s) => s.settingsOpen);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2" data-testid="top-bar">
      <img src={geckoLogo} alt="ZooChattr" title="ZooChattr" className="size-9 shrink-0" draggable={false} />
      <ChannelStrip />
      <StripEmoteStatus />
      <ConnectionPill compact />
      <ViewSwitch />
      <Button
        variant={settingsOpen ? "default" : "ghost"}
        size="icon-sm"
        className={cn("size-8 border", settingsOpen ? "border-primary" : "border-border")}
        onClick={() => (settingsOpen ? useUi.setState({ settingsOpen: false }) : void openSettings())}
        aria-label="Settings"
        aria-expanded={settingsOpen}
        data-testid="settings-gear"
        title="Settings (also in the tray menu)"
      >
        <Settings className="size-4" />
      </Button>
    </header>
  );
}
