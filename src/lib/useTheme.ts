import { useSyncExternalStore } from "react";
import { prefersDarkNow, resolveSkin, THEMES, watchColorScheme, type ConcreteSkin, type Theme } from "@/lib/themes";
import { useChat } from "@/store/chat";

/** Windows' light/dark choice, updated live. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(watchColorScheme, prefersDarkNow, () => true);
}

/** The theme whose colours show right now ("auto" resolved to its light or dark choice). */
export function useResolvedSkin(): ConcreteSkin {
  const prefersDark = usePrefersDark();
  const skin = useChat((s) => s.settings.skin);
  const light = useChat((s) => s.settings.autoLightSkin);
  const dark = useChat((s) => s.settings.autoDarkSkin);
  return resolveSkin(skin, light, dark, prefersDark);
}

/** Wording, mascot and surface of the theme showing right now. */
export function useTheme(): Theme {
  return THEMES[useResolvedSkin()];
}
