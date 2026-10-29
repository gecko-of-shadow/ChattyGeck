import { Settings } from "lucide-react";
import { Composer, LoginPrompt } from "@/components/chat/Composer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { openSettings, useUi } from "@/store/ui";
import { ConnectionDot } from "./ChatHeader";
import { ViewSwitch } from "./ViewSwitch";

/** Bottom-left: the Settings gear (opens the same in-window Settings panel as the tray's Settings…). */
function SettingsGear() {
  const settingsOpen = useUi((s) => s.settingsOpen);
  return (
    <Button
      variant={settingsOpen ? "default" : "ghost"}
      size="icon-sm"
      className={cn("size-8 shrink-0 border", settingsOpen ? "border-primary" : "border-border")}
      onClick={() => (settingsOpen ? useUi.setState({ settingsOpen: false }) : void openSettings())}
      aria-label="Settings"
      aria-expanded={settingsOpen}
      data-testid="settings-gear"
      title="Settings (also in the tray menu)"
    >
      <Settings className="size-4" />
    </Button>
  );
}

/**
 * The one bar under the panes: gear and connection dot on the left, the message box in the middle (it sends to the
 * focused pane, or the channel in view 1, with the "You switched channels" check as before), the 1 · 2 · 3 · 4 · 6 · 9
 * view switch on the right.
 */
export function BottomBar({ channel }: { channel: string | null }) {
  const readOnly = useChat((s) => s.settings.readOnly);
  const loggedIn = useChat((s) => s.auth.status === "logged_in");
  const anyChannel = useChat((s) => s.settings.channels.length > 0);

  let middle;
  if (readOnly) {
    middle = (
      <p className="min-w-0 flex-1 truncate py-1.5 text-center text-xs text-muted-foreground" data-testid="bottom-bar-read-only">
        Read only: the message box is hidden. Ctrl+Shift+R shows it again.
      </p>
    );
  } else if (channel) {
    middle = <Composer channel={channel} />;
  } else if (anyChannel && !loggedIn) {
    middle = <LoginPrompt />;
  } else {
    middle = (
      <p className="min-w-0 flex-1 truncate py-1.5 text-center text-xs text-muted-foreground" data-testid="bottom-bar-hint">
        {anyChannel ? "Click a pane to chat in it." : "Pick a channel in a pane to start reading."}
      </p>
    );
  }

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-border bg-surface px-2 py-2" data-testid="bottom-bar">
      <div className="flex shrink-0 items-center gap-1" data-testid="bottom-bar-left">
        <SettingsGear />
        <ConnectionDot />
      </div>
      <div className="flex min-w-0 flex-1" data-testid="bottom-bar-middle">
        {middle}
      </div>
      <div className="shrink-0" data-testid="bottom-bar-right">
        <ViewSwitch />
      </div>
    </div>
  );
}
