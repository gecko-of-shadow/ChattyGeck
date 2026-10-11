import { useEffect } from "react";
import { X } from "lucide-react";
import { Composer, LoginPrompt } from "@/components/chat/Composer";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { Mascot } from "@/components/mascots/Mascot";
import { ChatHeader, ConnectionBanner } from "@/components/layout/ChatHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { EmptyState, FocusedView, GridView } from "@/components/layout/Views";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { chat } from "@/lib/chat/controller";
import { setTrayStatus } from "@/lib/platform";
import { THEMES } from "@/lib/themes";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

function BootScreen() {
  const waking = useChat((s) => THEMES[s.settings.skin].waking);
  return (
    <div className="zoo-texture flex h-full flex-col items-center justify-center gap-4">
      <Mascot anim="scurry" className="size-20" />
      <p className="text-sm text-muted-foreground">{waking}</p>
    </div>
  );
}

function MobileNav() {
  const open = useUi((s) => s.navOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && useUi.setState({ navOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const close = () => useUi.setState({ navOpen: false });
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button type="button" aria-label="Close channel list" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={close} />
      <div className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] shadow-2xl animate-in slide-in-from-left duration-200">
        <Sidebar onNavigate={close} />
        <Button variant="ghost" size="icon-sm" className="absolute top-3 right-2" onClick={close} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const ready = useChat((s) => s.ready);
  const skin = useChat((s) => s.settings.skin);
  const mode = useChat((s) => s.settings.mode);
  const focused = useChat((s) => s.settings.focused);
  const count = useChat((s) => s.settings.channels.length);
  const mentions = useChat((s) => Object.values(s.channels).reduce((sum, c) => sum + c.mentions, 0));
  const loggedIn = useChat((s) => s.auth.status === "logged_in");

  useEffect(() => {
    void chat.boot();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
  }, [skin]);

  useEffect(() => {
    document.title = mentions > 0 ? `(${mentions}) ZooChattr` : "ZooChattr";
    void setTrayStatus(mentions).catch(() => undefined);
  }, [mentions]);

  return (
    <>
      {!ready ? (
        <BootScreen />
      ) : (
        <div className="flex h-full">
          <div className="hidden w-64 shrink-0 md:block lg:w-72">
            <Sidebar />
          </div>
          <MobileNav />
          <main className="flex min-w-0 flex-1 flex-col">
            <ChatHeader />
            <ConnectionBanner />
            {count === 0 ? (
              <EmptyState />
            ) : mode === "grid" || !focused ? (
              <GridView />
            ) : (
              <FocusedView key={focused} login={focused} />
            )}
            {mode === "focused" && focused ? (
              <Composer channel={focused} />
            ) : count > 0 && !loggedIn ? (
              <LoginPrompt />
            ) : null}
          </main>
          <LoginDialog />
          <SettingsDialog />
        </div>
      )}
      <Toaster position="bottom-right" />
    </>
  );
}
