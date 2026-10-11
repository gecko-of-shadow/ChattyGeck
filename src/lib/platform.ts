import type { Session } from "@/lib/twitch/auth";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface AppInfo {
  version: string;
  dataDir: string;
  portable: boolean;
  tokenStore: string;
  platform: string;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

const SETTINGS_KEY = "chatdeck.settings";
const SESSION_KEY = "chatdeck.session";

export async function getAppInfo(): Promise<AppInfo> {
  if (isTauri) return invoke<AppInfo>("app_info");
  return {
    version: "dev",
    dataDir: "Browser localStorage (dev mode)",
    portable: false,
    tokenStore: "Browser session storage (dev mode only)",
    platform: "browser",
  };
}

export async function loadSettings(): Promise<unknown | null> {
  if (isTauri) return invoke<unknown | null>("settings_load");
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSettings(settings: unknown): Promise<void> {
  if (isTauri) return invoke("settings_save", { settings });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadSession(): Promise<Session | null> {
  const raw = isTauri ? await invoke<string | null>("session_load") : sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    return session.accessToken && session.login ? session : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  const payload = JSON.stringify(session);
  if (isTauri) return invoke("session_save", { payload });
  sessionStorage.setItem(SESSION_KEY, payload);
}

export async function clearSession(): Promise<void> {
  if (isTauri) return invoke("session_clear");
  sessionStorage.removeItem(SESSION_KEY);
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
