import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SettingsApp } from "./components/dialogs/SettingsApp";
import { isTauri } from "./lib/platform";
import "./index.css";

function Root() {
  const [role, setRole] = useState<"loading" | "main" | "settings">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isTauri) {
        if (!cancelled) setRole("main");
        return;
      }
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      if (cancelled) return;
      setRole(getCurrentWindow().label === "settings" ? "settings" : "main");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (role === "loading") {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Starting…</div>;
  }
  return role === "settings" ? <SettingsApp /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
