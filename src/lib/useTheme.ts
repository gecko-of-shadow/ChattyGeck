import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  CONCRETE_SKINS,
  prefersDarkNow,
  rememberThemeForBoot,
  resolveSkin,
  THEMES,
  watchColorScheme,
  type ConcreteSkin,
  type Theme,
} from "@/lib/themes";
import { useChat } from "@/store/chat";

/** Windows' light/dark choice, updated live. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(watchColorScheme, prefersDarkNow, () => true);
}

/** The theme public/theme-boot.js put on the page, or null. */
function bootSkin(): ConcreteSkin | null {
  if (typeof document === "undefined") return null;
  const skin = document.documentElement.dataset.skin as ConcreteSkin | undefined;
  return skin && CONCRETE_SKINS.includes(skin) ? skin : null;
}

/**
 * The theme whose colours show right now ("auto" resolved to its light or dark choice). Before the saved settings
 * load, the store holds defaults, so the boot screen uses the theme theme-boot.js already applied.
 */
export function useResolvedSkin(): ConcreteSkin {
  const prefersDark = usePrefersDark();
  const ready = useChat((s) => s.ready);
  const skin = useChat((s) => s.settings.skin);
  const light = useChat((s) => s.settings.autoLightSkin);
  const dark = useChat((s) => s.settings.autoDarkSkin);
  if (!ready) return bootSkin() ?? resolveSkin(skin, light, dark, prefersDark);
  return resolveSkin(skin, light, dark, prefersDark);
}

/** Wording, mascot and surface of the theme showing right now. */
export function useTheme(): Theme {
  return THEMES[useResolvedSkin()];
}

/**
 * Keeps the copy of the theme choice that public/theme-boot.js reads up to date. Each window keeps its own (the
 * Settings popout has its own storage in portable mode). A failed settings read falls back to defaults; those are not
 * written over the user's real choice.
 */
export function useRememberThemeForBoot(): void {
  const ready = useChat((s) => s.ready);
  const loaded = useChat((s) => s.settingsLoaded);
  const skin = useChat((s) => s.settings.skin);
  const light = useChat((s) => s.settings.autoLightSkin);
  const dark = useChat((s) => s.settings.autoDarkSkin);
  const first = useRef<string | null>(null);
  const wrote = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const choice = `${skin}|${light}|${dark}`;
    if (first.current === null) first.current = choice;
    // Defaults after a failed read: wait until the user actually picks something (then keep saving every change).
    if (!loaded && !wrote.current && choice === first.current) return;
    wrote.current = true;
    rememberThemeForBoot(skin, light, dark);
  }, [ready, loaded, skin, light, dark]);
}
