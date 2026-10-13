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

const SETTINGS_KEY = "zoochattr.settings";
const SESSION_KEY = "zoochattr.session";

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

/** Login name only — Settings popout. Never returns tokens. */
export async function loadAuthDisplay(): Promise<{ login: string; userId: string; remembered: boolean } | null> {
  if (isTauri) {
    return invoke<{ login: string; userId: string; remembered: boolean } | null>("auth_display");
  }
  const session = await loadSession();
  if (!session) return null;
  return { login: session.login, userId: session.userId, remembered: true };
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

/** Whether closing the window hides ZooChattr in the tray (true) or quits it. */
export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (isTauri) await invoke("set_close_to_tray", { enabled });
}

/** Tray tooltip, e.g. "ZooChattr · 2 mentions". */
export async function setTrayStatus(mentions: number): Promise<void> {
  if (isTauri) await invoke("set_tray_status", { mentions });
}

/** Flashes the taskbar button (Windows) / bounces the dock icon. */
export async function requestAttention(): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow, UserAttentionType } = await import("@tauri-apps/api/window");
  await getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
}

/** Chat links and the Twitch login page. Anything other than http(s) stays closed. */
export function allowedExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export async function openExternal(url: string): Promise<void> {
  const href = allowedExternalUrl(url);
  if (!href) return;
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

/** Really quit (after the user confirmed). Closing the window only hides to the tray. */
export async function quitApp(): Promise<void> {
  if (isTauri) await invoke("quit_app");
  else window.close();
}

/** Whether ZooChattr is set to start when Windows signs you in. */
export async function getLaunchAtLogin(): Promise<boolean> {
  if (isTauri) return invoke<boolean>("get_launch_at_login");
  return false;
}

/** Start (or stop starting) ZooChattr when Windows signs you in. */
export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (isTauri) await invoke("set_launch_at_login", { enabled });
}

const chatHistoryKey = (channel: string) => `zoochattr.chat.${channel}`;

/** Last saved chat lines for a channel (or null when none). */
export async function loadChatHistory(channel: string): Promise<unknown | null> {
  if (isTauri) return invoke<unknown | null>("chat_history_load", { channel });
  const raw = localStorage.getItem(chatHistoryKey(channel));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveChatHistory(channel: string, messages: unknown): Promise<void> {
  if (isTauri) {
    await invoke("chat_history_save", { channel, messages });
    return;
  }
  localStorage.setItem(chatHistoryKey(channel), JSON.stringify(messages));
}

/** Wipe one channel's history, or every channel when `channel` is omitted. */
export async function clearChatHistory(channel?: string): Promise<void> {
  if (isTauri) {
    await invoke("chat_history_clear", { channel: channel ?? null });
    return;
  }
  if (channel) {
    localStorage.removeItem(chatHistoryKey(channel));
    return;
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("zoochattr.chat.")) localStorage.removeItem(key);
  }
}
