import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { chat } from "@/lib/chat/controller";
import { isTauri } from "@/lib/platform";
import { useChat } from "@/store/chat";
import { closeSettingsWindow } from "@/store/ui";
import { SettingsBody } from "./SettingsDialog";

/** Full-window Settings surface for the Tauri `settings` popout. */
export function SettingsApp() {
  const ready = useChat((s) => s.ready);
  const skin = useChat((s) => s.settings.skin);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void chat.bootSettingsUi();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    document.title = "ZooChattr Settings";
  }, [skin]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeSettingsWindow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading settings…</div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col bg-background" data-testid="settings-window">
        <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 border-b border-border/70 bg-background/95 px-4 pt-4 pb-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">Saved automatically to this ZooChattr folder.</p>
          </div>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            data-testid="settings-search"
            className="h-8"
          />
        </header>
        <div className="zoo-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <SettingsBody
            searchQuery={searchQuery}
            onRequestLogin={() => {
              void (async () => {
                if (isTauri) {
                  const { emit } = await import("@tauri-apps/api/event");
                  await emit("login-requested");
                }
                await closeSettingsWindow();
              })();
            }}
          />
        </div>
      </div>
      <Toaster position="bottom-right" />
    </>
  );
}
