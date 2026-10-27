import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BookOpen, LayoutGrid, Menu, PanelLeftClose, PanelTop, RotateCw, Settings, WifiOff } from "lucide-react";
import { GeckoTailIcon } from "@/components/mascots/icons";
import { Button } from "@/components/ui/button";
import { chat } from "@/lib/chat/controller";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import type { ViewMode } from "@/store/settings";
import { openSettings, useUi } from "@/store/ui";
import { ChannelAvatar } from "./Sidebar";
import { EmoteStatusChip } from "./Views";

function useCountdown(targetMs: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (targetMs === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [targetMs]);
  return targetMs === null ? 0 : Math.max(0, Math.ceil((targetMs - now) / 1000));
}

function ConnectionPill() {
  const read = useChat((s) => s.read);
  const auth = useChat((s) => s.auth);
  const retryAt = read.status === "reconnecting" && read.detail.retryInMs ? read.since + read.detail.retryInMs : null;
  const seconds = useCountdown(retryAt);

  let label: string;
  let tone: "ok" | "wait" | "bad";
  switch (read.status) {
    case "connected":
      label = auth.status === "logged_in" ? `Live · ${auth.login}` : "Live · anonymous";
      tone = "ok";
      break;
    case "reconnecting":
      label = seconds > 0 ? `Reconnecting in ${seconds}s` : "Reconnecting…";
      tone = "wait";
      break;
    case "auth_failed":
      label = "Login rejected";
      tone = "bad";
      break;
    case "closed":
      label = "Offline";
      tone = "bad";
      break;
    default:
      label = "Connecting…";
      tone = "wait";
  }

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium whitespace-nowrap",
        tone === "ok" && "border-live/60 text-foreground",
        tone === "wait" && "border-warn/60 text-foreground",
        tone === "bad" && "border-destructive/30 bg-destructive/10 text-danger-text",
      )}
      role="status"
      title={read.detail.reason}
    >
      <span
        className={cn(
          "zc-live-dot size-1.5 rounded-full bg-current",
          tone === "ok" && "bg-live",
          tone === "wait" && "animate-pulse bg-warn",
        )}
      />
      {label}
    </div>
  );
}

function ModeToggle() {
  const mode = useChat((s) => s.settings.mode);
  const options: { value: ViewMode; label: string; icon: typeof LayoutGrid; hint: string }[] = [
    { value: "grid", label: "Grid", icon: LayoutGrid, hint: "Every chat in its own box (Ctrl+G)" },
    { value: "focused", label: "Focused", icon: PanelTop, hint: "Single chat (Ctrl+G). Esc returns to the grid." },
  ];
  return (
    <div role="radiogroup" aria-label="Reading mode" className="flex rounded-lg border bg-muted/60 p-0.5">
      {options.map(({ value, label, icon: Icon, hint }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          title={hint}
          onClick={() => chat.setMode(value)}
          className={cn(
            "flex h-6.5 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
            mode === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function ChatHeader() {
  const mode = useChat((s) => s.settings.mode);
  const focused = useChat((s) => s.settings.focused);
  const gridCount = useChat((s) => s.settings.gridChannels.length);
  const followCount = useChat((s) => s.settings.channels.length);
  const readOnly = useChat((s) => s.settings.readOnly);
  const view = useChat(
    useShallow((s) => {
      const channel = focused ? s.channels[focused] : undefined;
      if (!channel) return null;
      return { login: channel.login, displayName: channel.displayName, status: channel.status };
    }),
  );
  const unreadElsewhere = useChat((s) =>
    Object.values(s.channels).reduce((sum, c) => sum + (c.login === s.settings.focused ? 0 : c.mentions), 0),
  );

  return (
    <header className="zoo-texture-soft flex h-12 shrink-0 items-center gap-2 border-b border-border/80 bg-card/40 px-2.5 sm:px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative min-[900px]:hidden"
        onClick={() => useUi.setState({ navOpen: true })}
        aria-label="Open channel list"
      >
        <Menu className="size-4.5" />
        {unreadElsewhere > 0 ? <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-mention" /> : null}
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {mode === "grid" || !view ? (
          <>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-accent-text">
              <LayoutGrid className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Grid</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {followCount === 0
                  ? "No channels yet"
                  : gridCount === 0
                    ? `${followCount} followed · none on the grid`
                    : `${gridCount} on grid` +
                      (followCount > gridCount ? ` · ${followCount - gridCount} tucked` : "")}
              </div>
            </div>
          </>
        ) : (
          <>
            <ChannelAvatar login={view.login} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">#{view.displayName ?? view.login}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {view.status === "joined" ? "Connected" : view.status === "joining" ? "Joining…" : "Couldn't join"}
              </div>
            </div>
            <EmoteStatusChip channel={view.login} />
          </>
        )}
      </div>

      <div className="hidden sm:block">
        <ConnectionPill />
      </div>
      <ModeToggle />
      <Button
        variant={readOnly ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => chat.updateSettings({ readOnly: !readOnly })}
        aria-label={readOnly ? "Turn off read only" : "Read only"}
        aria-pressed={readOnly}
        title={readOnly ? "Read only on — click to show the message box again" : "Read only — hide the message box on every pane"}
        data-testid="read-only-toggle"
      >
        <BookOpen className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => chat.updateSettings({ chromeHidden: true })}
        aria-label="Hide sidebar and top bar"
        title="More room for chat — hide the sidebar and top bar"
        data-testid="hide-chrome"
      >
        <PanelLeftClose className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        onClick={() => void openSettings()}
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="size-4" />
      </Button>
    </header>
  );
}

export function ConnectionBanner() {
  const read = useChat((s) => s.read);
  const theme = useTheme();
  const retryAt = read.status === "reconnecting" && read.detail.retryInMs ? read.since + read.detail.retryInMs : null;
  const seconds = useCountdown(retryAt);
  if (read.status !== "reconnecting" && read.status !== "auth_failed") return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn bg-warn/10 px-3 py-2 text-xs"
    >
      {theme.kind === "animal" && theme.animal === "gecko" ? (
        <GeckoTailIcon className="size-4 shrink-0 text-warn" />
      ) : (
        <WifiOff className="size-4 shrink-0 text-warn" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-foreground">
          {read.status === "auth_failed" ? "Twitch rejected the login." : theme.dropped}
        </span>{" "}
        <span className="text-muted-foreground">
          {read.status === "auth_failed"
            ? "Trying to refresh it…"
            : `${read.detail.reason ?? "Network error"}. Reconnecting${seconds > 0 ? ` in ${seconds}s` : " now"} (attempt ${read.detail.attempt ?? 1}).`}
        </span>
      </div>
      {read.status === "reconnecting" ? (
        <Button size="xs" variant="outline" onClick={() => chat.retryNow()} className="gap-1">
          <RotateCw className="size-3" /> Retry now
        </Button>
      ) : null}
    </div>
  );
}
