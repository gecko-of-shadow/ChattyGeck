import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  EyeOff,
  LayoutGrid,
  LogIn,
  LogOut,
  Maximize2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Mascot } from "@/components/mascots/Mascot";
import { GeckoEyeIcon } from "@/components/mascots/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { chat } from "@/lib/chat/controller";
import { readableTagColor, TAG_TINT } from "@/lib/colors";
import { openExternal } from "@/lib/platform";
import { viewForSlots } from "@/lib/gridLayout";
import { useResolvedSkin, useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { openSettings, useUi } from "@/store/ui";
import { beginChannelDrag } from "./gridDrag";

export function ChannelAvatar({ login, className }: { login: string; className?: string }) {
  const avatarUrl = useChat((s) => s.channels[login]?.avatarUrl);
  const skin = useResolvedSkin();
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={cn("size-7 shrink-0 rounded-full object-cover", className)} />;
  }
  // Letter colour is nudged per theme to read at 4.5:1 on its disc (tested in themeContrast.test.ts).
  const color = readableTagColor(login, skin);
  return (
    <span
      aria-hidden
      className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold uppercase", className)}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} ${TAG_TINT * 100}%, var(--zc-surface))` }}
    >
      {login[0]}
    </span>
  );
}

export function AddChannelForm({ autoFocus, onAdded }: { autoFocus?: boolean; onAdded?: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        const result = chat.addChannel(value);
        if (result.ok) {
          setValue("");
          setError(null);
          onAdded?.();
        } else setError(result.error ?? "Couldn't add that channel.");
      }}
    >
      <div className="flex gap-1.5">
        <Input
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Add a channel…"
          aria-label="Channel name or twitch.tv link"
          aria-invalid={!!error}
          className="h-8 bg-background/60 text-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" size="icon" className="size-8 shrink-0" aria-label="Join channel" disabled={!value.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </form>
  );
}

function ChannelItem({ login, active, onSelect }: { login: string; active: boolean; onSelect: () => void }) {
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
  const index = useChat((s) => s.settings.channels.indexOf(login));
  const count = useChat((s) => s.settings.channels.length);
  const onGrid = useChat((s) => s.settings.gridChannels.includes(login));
  if (!view) return null;

  const statusTitle =
    view.status === "joined" ? "Connected" : view.status === "joining" ? "Joining…" : (view.error ?? "Couldn't join");

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
        active ? "bg-sidebar-accent shadow-[inset_2px_0_0_var(--primary)]" : "hover:bg-sidebar-accent/60",
        !onGrid && !active && "opacity-85",
      )}
      onPointerDown={(event) => beginChannelDrag(event, login, "sidebar")}
      onMouseDown={(event) => beginChannelDrag(event, login, "sidebar")}
    >
      <button
        type="button"
        data-drag-channel={login}
        onClick={onSelect}
        className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Open #${login}`}
        aria-current={active ? "page" : undefined}
        title="Drag onto a grid box to replace it"
      />
      <span className="relative">
        <ChannelAvatar login={login} />
        <span
          title={statusTitle}
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-sidebar",
            view.status === "joined" && "bg-primary",
            view.status === "joining" && "animate-pulse bg-warn",
            view.status === "error" && "bg-destructive",
          )}
        />
      </span>
      <span className="pointer-events-none min-w-0 flex-1">
        <span className={cn("block truncate text-sm", active || view.unread ? "font-semibold text-foreground" : "text-sidebar-foreground/80")}>
          {view.displayName ?? login}
        </span>
        {view.status === "error" ? (
          <span className="block truncate text-[11px] text-danger-text" title={view.error}>
            {view.error}
          </span>
        ) : onGrid ? (
          <span className="block truncate text-[10px] text-accent-text">On grid</span>
        ) : (
          <span className="block truncate text-[10px] text-muted-foreground">Following</span>
        )}
      </span>

      {view.mentions > 0 ? (
        <span
          className="pointer-events-none flex items-center gap-1 rounded-full bg-mention/16 px-1.5 py-0.5 text-[11px] font-bold text-mention"
          title={`${view.mentions} mention${view.mentions === 1 ? "" : "s"}`}
        >
          <GeckoEyeIcon className="size-3" />
          {view.mentions}
        </span>
      ) : view.unread > 0 ? (
        <span
          className="pointer-events-none rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-accent-text"
          title={`${view.unread} unread`}
        >
          {view.unread > 999 ? "999+" : view.unread}
        </span>
      ) : onGrid ? (
        <LayoutGrid className="pointer-events-none size-3.5 shrink-0 text-accent-text" aria-hidden />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
              aria-label={`Options for #${login}`}
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => {
              chat.focus(login);
            }}
          >
            <Maximize2 /> Open focused
          </DropdownMenuItem>
          {onGrid ? (
            <DropdownMenuItem onClick={() => chat.hideFromGrid(login)}>
              <EyeOff /> Hide from grid
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => {
                const result = chat.showInGrid(login);
                if (!result.ok) toast.error(result.error ?? "Couldn't show on the grid");
              }}
            >
              <LayoutGrid /> Show in grid
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => chat.reloadEmotes(login)}>
            <RefreshCw /> Reload emotes
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openExternal(`https://www.twitch.tv/${login}`)}>
            <ExternalLink /> Open on twitch.tv
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index <= 0} onClick={() => chat.moveChannel(login, -1)}>
            <ArrowUp /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index >= count - 1} onClick={() => chat.moveChannel(login, 1)}>
            <ArrowDown /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => chat.removeChannel(login)}>
            <X /> Leave #{login}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AccountPanel() {
  const auth = useChat((s) => s.auth);
  const write = useChat((s) => s.write);

  return (
    <div className="flex items-center gap-2 border-t border-sidebar-border bg-sidebar/80 px-3 py-2.5">
      {auth.status === "logged_in" ? (
        <>
          <ChannelAvatar login={auth.login} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{auth.login}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {write?.status === "connected" ? "Logged in · can chat" : "Logged in · connecting chat…"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void chat.logout()}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <Mascot className="size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {auth.status === "booting" ? "Waking up…" : "Anonymous lurker"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">Reading only</div>
          </div>
          <Button
            size="sm"
            className="h-7 gap-1 px-2"
            onClick={() => useUi.setState({ loginOpen: true })}
            disabled={auth.status === "booting"}
          >
            <LogIn className="size-3.5" /> Log in
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void openSettings()}
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="size-4" />
      </Button>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const theme = useTheme();
  const order = useChat((s) => s.settings.channels);
  const mode = useChat((s) => s.settings.mode);
  const focused = useChat((s) => s.settings.focused);
  const gridView = useChat((s) => viewForSlots(s.settings.gridSlots));

  return (
    <aside className="zoo-texture flex h-full w-full flex-col border-r border-sidebar-border text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3">
        <Mascot anim="idle" className="size-9 shrink-0" title={`ZooChattr ${theme.name.toLowerCase()}`} />
        <div className="min-w-0">
          <div className="zoo-text-glow text-[17px] leading-tight font-extrabold tracking-tight">
            Zoo<span className="text-accent-text">Chattr</span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{theme.tagline}</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <AddChannelForm onAdded={onNavigate} />
      </div>

      <nav className="zoo-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" aria-label="Channels">
        {order.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              chat.setMode("grid");
              onNavigate?.();
            }}
            aria-current={mode === "grid" ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
              mode === "grid"
                ? "bg-sidebar-accent font-semibold shadow-[inset_2px_0_0_var(--primary)]"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )}
          >
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-accent-text">
              <LayoutGrid className="size-3.5" />
            </span>
            <span className="flex-1">Grid</span>
            <span className="font-mono text-[11px] text-muted-foreground">{gridView} panes</span>
          </button>
        ) : null}

        {order.length > 0 ? (
          <div className="px-2 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">
            Following · {order.length}
          </div>
        ) : (
          <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
            No channels yet. Type a channel name above, or paste a twitch.tv link. Follow many — the grid shows up to 9.
          </p>
        )}

        {order.map((login) => (
          <ChannelItem
            key={login}
            login={login}
            active={mode === "focused" && focused === login}
            onSelect={() => {
              chat.focus(login);
              onNavigate?.();
            }}
          />
        ))}
      </nav>

      <AccountPanel />
    </aside>
  );
}
