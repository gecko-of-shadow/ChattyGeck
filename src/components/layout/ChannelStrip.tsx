import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { ArrowLeft, ArrowRight, ExternalLink, EyeOff, LayoutGrid, Maximize2, Minus, Plus, RefreshCw, Settings, X } from "lucide-react";
import { toast } from "sonner";
import geckoLogo from "@/assets/gecko-logo.png";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chat } from "@/lib/chat/controller";
import { openExternal } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { openSettings } from "@/store/ui";
import { ConnectionPill } from "./ChatHeader";
import { beginChannelDrag } from "./gridDrag";
import { AddChannelForm, ChannelAvatar } from "./Sidebar";
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

/** Everything the old sidebar's ⋯ menu did, on right-click (or the Menu key) on an avatar. */
function AvatarMenu({ login, onGrid, index, count }: { login: string; onGrid: boolean; index: number; count: number }) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
        <ContextMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className="z-50 min-w-52 overflow-hidden border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
        >
          <DropdownMenuItem onClick={() => chat.focus(login)}>
            <Maximize2 /> Open alone (view 1)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => showOrHide(login, onGrid)}>
            {onGrid ? <EyeOff /> : <LayoutGrid />} {onGrid ? "Hide from grid" : "Show in grid"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => chat.reloadEmotes(login)}>
            <RefreshCw /> Reload emotes
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openExternal(`https://www.twitch.tv/${login}`)}>
            <ExternalLink /> Open on twitch.tv
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index <= 0} onClick={() => chat.moveChannel(login, -1)}>
            <ArrowLeft /> Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index >= count - 1} onClick={() => chat.moveChannel(login, 1)}>
            <ArrowRight /> Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => chat.removeChannel(login)}>
            <X /> Leave #{login}
          </DropdownMenuItem>
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

/** One followed channel: round avatar, teal ring when in the grid, +/− badge, mention or unread count. */
function StripAvatar({ login }: { login: string }) {
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
  const onGrid = useChat((s) => s.settings.gridChannels.includes(login));
  const active = useChat((s) => s.settings.mode === "focused" && s.settings.focused === login);
  const index = useChat((s) => s.settings.channels.indexOf(login));
  const count = useChat((s) => s.settings.channels.length);
  if (!view) return null;

  const name = view.displayName ?? login;
  const status = view.status === "joined" ? null : view.status === "joining" ? "joining" : `couldn't join: ${view.error ?? "error"}`;
  const activity =
    view.mentions > 0
      ? `${view.mentions} mention${view.mentions === 1 ? "" : "s"}`
      : view.unread > 0
        ? `${view.unread} unread`
        : null;
  const label = [`#${name}`, onGrid ? "in the grid" : null, status, activity].filter(Boolean).join(", ");

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
            onClick={() => chat.focus(login)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            title={`${label}\nClick: open alone · Right-click: more · Drag onto a pane to put it there`}
            className={cn(
              "block rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface",
              // In-grid ring as an outline: separate from the focus ring (gap between them) and kept by Windows contrast themes.
              onGrid && "outline-2 outline-offset-1 outline-solid outline-accent-2",
            )}
          >
            <ChannelAvatar
              login={login}
              className={cn(
                "size-9",
                view.status !== "joined" && "grayscale",
              )}
            />
          </button>
          {view.mentions > 0 || view.unread > 0 ? (
            <span
              aria-hidden
              className={cn(
                "zc-badge pointer-events-none absolute -top-1 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full border border-surface px-1 text-[10px] leading-none font-bold tabular-nums",
                view.mentions > 0 ? "bg-primary text-primary-foreground" : "bg-badge text-badge-ink",
              )}
            >
              {view.mentions > 0 ? `@${countLabel(view.mentions)}` : countLabel(view.unread)}
            </span>
          ) : null}
          {view.status === "error" ? (
            <span
              aria-hidden
              className="zc-badge pointer-events-none absolute -top-1 -left-1 grid size-3.5 place-items-center rounded-full border border-surface bg-destructive text-[9px] leading-none font-bold text-destructive-foreground"
            >
              !
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => showOrHide(login, onGrid)}
            aria-label={onGrid ? `Hide #${name} from the grid` : `Show #${name} in the grid`}
            title={onGrid ? `Hide #${name} from the grid` : `Show #${name} in the grid`}
            className="zc-badge absolute -right-0.5 -bottom-0.5 grid size-3 place-items-center rounded-full border border-surface bg-badge text-badge-ink outline-none hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {onGrid ? <Minus className="size-2" strokeWidth={3.5} /> : <Plus className="size-2" strokeWidth={3.5} />}
          </button>
        </ContextMenuPrimitive.Trigger>
        <AvatarMenu login={login} onGrid={onGrid} index={index} count={count} />
      </ContextMenuPrimitive.Root>
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

/** The followed channels, sideways scrolling, with the add tile at the end. */
function ChannelStrip() {
  const order = useChat((s) => s.settings.channels);
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
        {order.map((login) => (
          <StripAvatar key={login} login={login} />
        ))}
        <AddTile />
      </ul>
    </nav>
  );
}

/** The top bar: gecko logo, channel strip, connection status, view switch and gear (same place on every screen). */
export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2" data-testid="top-bar">
      <img src={geckoLogo} alt="ZooChattr" title="ZooChattr" className="size-9 shrink-0" draggable={false} />
      <ChannelStrip />
      <ConnectionPill compact />
      <ViewSwitch />
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-8 border border-border"
        onClick={() => void openSettings()}
        aria-label="Settings"
        title="Settings (also in the tray menu)"
      >
        <Settings className="size-4" />
      </Button>
    </header>
  );
}
