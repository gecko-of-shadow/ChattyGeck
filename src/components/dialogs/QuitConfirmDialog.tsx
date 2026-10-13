import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chat } from "@/lib/chat/controller";
import { isTauri, quitApp } from "@/lib/platform";
import { useUi } from "@/store/ui";

/** Shown when the tray menu's Quit is chosen — closing the window only hides to the tray. */
export function QuitConfirmDialog() {
  const open = useUi((s) => s.quitConfirmOpen);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled) return;
      unlisten = await listen("quit-requested", () => {
        useUi.setState({ quitConfirmOpen: true });
      });
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => useUi.setState({ quitConfirmOpen: next })}>
      <DialogContent className="sm:max-w-md" data-testid="quit-confirm">
        <DialogHeader>
          <DialogTitle>Quit ZooChattr?</DialogTitle>
          <DialogDescription>
            Closing the window only hides ZooChattr in the tray so your chats stay connected. Quitting disconnects everything.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => useUi.setState({ quitConfirmOpen: false })}>
            Keep running
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              useUi.setState({ quitConfirmOpen: false });
              void chat.flushSavedHistory().finally(() => {
                void quitApp();
              });
            }}
          >
            Quit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
