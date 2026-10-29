import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { ArrowDown, ArrowUp, ExternalLink, Maximize2, RefreshCw, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { chat } from "@/lib/chat/controller";
import { openExternal } from "@/lib/platform";
import { useUi } from "@/store/ui";

/** Open a channel alone (view 1). A Twitch follow that isn't in the app yet joins chat first. */
export function openAlone(login: string, joined: boolean): void {
  if (!joined) {
    const result = chat.addChannel(login, { toGrid: false });
    if (!result.ok) {
      toast.error(result.error ?? `Couldn't open #${login}`);
      return;
    }
  }
  chat.focus(login);
}

/**
 * A channel's right-click (or Menu key / Shift+F10) menu, on picker rows and pane headers: everything the old top
 * strip's menu had. A follow that isn't joined only offers opening it; Move up/down only for Added channels.
 */
export function ChannelMenuPopup({
  login,
  joined,
  moveUp = null,
  moveDown = null,
  movable = false,
}: {
  login: string;
  joined: boolean;
  moveUp?: number | null;
  moveDown?: number | null;
  movable?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
        <ContextMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          data-testid="channel-menu"
          className="z-50 min-w-52 overflow-hidden border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
        >
          <DropdownMenuItem onClick={() => openAlone(login, joined)}>
            <Maximize2 /> Open alone (view 1)
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
              <DropdownMenuItem disabled={moveUp === null} onClick={() => moveUp !== null && chat.moveChannel(login, moveUp)}>
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={moveDown === null} onClick={() => moveDown !== null && chat.moveChannel(login, moveDown)}>
                <ArrowDown /> Move down
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
