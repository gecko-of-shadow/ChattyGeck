/** A theme with its own colours. Saved ids from older builds are all still here. */
export type ConcreteSkin =
  | "crested"
  | "dark"
  | "light"
  | "eyecomfort"
  | "eyecomfort-light"
  | "penguin"
  | "turtle"
  | "elephant"
  | "deuteranopia"
  | "protanopia"
  | "tritanopia"
  | "highcontrast";

/** What Settings saves: a concrete theme, or "auto" (follows Windows light/dark). */
export type Skin = ConcreteSkin | "auto";

export type Animal = "gecko" | "penguin" | "turtle" | "elephant";

export interface Theme {
  id: Skin;
  name: string;
  /** Short label under the name on the theme card ("Neutral grey"). */
  tag: string;
  blurb: string;
  /** Settings card group. */
  group: "theme" | "animal" | "access";
  /** Animal themes keep their own mascot and wording; the rest use the gecko and plain words. */
  kind: "animal" | "appearance";
  /** Boot screen / empty-state mascot. */
  animal: Animal;
  /** Under the ZooChattr wordmark. */
  tagline: string;
  /** Loading screen. */
  waking: string;
  /** Send button and composer placeholder ("Send to #channel"). */
  sendVerb: string;
  /** Headline of the lost-connection banner. */
  dropped: string;
  /** Light surfaces need light native controls and a light toast theme. */
  surface: "dark" | "light";
}

const plain = {
  kind: "appearance",
  animal: "gecko",
  waking: "Loading your chats…",
  sendVerb: "Send",
  dropped: "Lost the connection.",
} as const;

export const THEMES: Record<Skin, Theme> = {
  auto: {
    ...plain,
    id: "auto",
    name: "Auto",
    tag: "Follows Windows",
    blurb: "Uses your light theme when Windows is light and your dark theme when Windows is dark. Switches live.",
    group: "theme",
    tagline: "Follows Windows",
    surface: "dark",
  },
  crested: {
    ...plain,
    id: "crested",
    name: "Crested gecko",
    tag: "Default",
    blurb: "Calm charcoal with a lime spark and teal cues, flat and focused.",
    group: "theme",
    tagline: "Every chat at once",
    surface: "dark",
  },
  dark: {
    ...plain,
    id: "dark",
    name: "Dark",
    tag: "Neutral grey",
    blurb: "Plain neutral dark grey with a soft blue accent and amber cues.",
    group: "theme",
    tagline: "Chat after dark",
    surface: "dark",
  },
  light: {
    ...plain,
    id: "light",
    name: "Light",
    tag: "Bright rooms",
    blurb: "Soft off-white page, white panels, deep green and teal accents.",
    group: "theme",
    tagline: "Bright and clear",
    surface: "light",
  },
  eyecomfort: {
    ...plain,
    id: "eyecomfort",
    name: "Eye comfort",
    tag: "Warm, low glare",
    blurb: "Warm dark with cream text, little blue light and gentle contrast for long nights.",
    group: "theme",
    tagline: "Easier on long sessions",
    surface: "dark",
  },
  "eyecomfort-light": {
    ...plain,
    id: "eyecomfort-light",
    name: "Paper",
    tag: "Warm light",
    blurb: "Eye comfort for daytime: warm paper tones, brown ink, no harsh white or blue.",
    group: "theme",
    tagline: "Easy daytime reading",
    surface: "light",
  },
  penguin: {
    id: "penguin",
    name: "Penguin",
    tag: "Arctic night",
    blurb: "Deep navy ice, frost-white text, beak-orange buttons and glacier-blue cues.",
    group: "animal",
    kind: "animal",
    animal: "penguin",
    tagline: "Huddle every chat together",
    waking: "Waddling in…",
    sendVerb: "Squawk",
    dropped: "Slipped on the ice and lost the connection.",
    surface: "dark",
  },
  turtle: {
    id: "turtle",
    name: "Sea turtle",
    tag: "Deep reef",
    blurb: "Deep sea-teal water, sea-foam text, warm sand buttons and reef-teal cues.",
    group: "animal",
    kind: "animal",
    animal: "turtle",
    tagline: "Slow down and read every chat",
    waking: "Paddling up…",
    sendVerb: "Bloop",
    dropped: "Ducked into the shell and lost the connection.",
    surface: "dark",
  },
  elephant: {
    id: "elephant",
    name: "Elephant",
    tag: "Savanna dusk",
    blurb: "Elephant-hide slate, gentle lilac buttons and a dusty rose cue.",
    group: "animal",
    kind: "animal",
    animal: "elephant",
    tagline: "Never forget a chat",
    waking: "Remembering your channels…",
    sendVerb: "Trumpet",
    dropped: "Lost the connection for a moment.",
    surface: "dark",
  },
  deuteranopia: {
    ...plain,
    id: "deuteranopia",
    name: "Deuteranopia",
    tag: "Green-weak safe",
    blurb: "Orange actions, sky-blue cues and a yellow live dot; no red-versus-green meaning.",
    group: "access",
    tagline: "Mentions stay obvious",
    surface: "dark",
  },
  protanopia: {
    ...plain,
    id: "protanopia",
    name: "Protanopia",
    tag: "Red-weak safe",
    blurb: "Sky-blue actions with amber cues and a yellow live dot; no reds.",
    group: "access",
    tagline: "Built for red-weak vision",
    surface: "dark",
  },
  tritanopia: {
    ...plain,
    id: "tritanopia",
    name: "Tritanopia",
    tag: "Blue-weak safe",
    blurb: "Reddish-purple actions with bluish-green cues; no blue-versus-yellow meaning.",
    group: "access",
    tagline: "Built for blue-weak vision",
    surface: "dark",
  },
  highcontrast: {
    ...plain,
    id: "highcontrast",
    name: "High contrast",
    tag: "Max legibility",
    blurb: "Black and white with yellow actions, cyan cues and solid white outlines.",
    group: "access",
    tagline: "Maximum legibility",
    surface: "dark",
  },
};

/** Settings picker order: Theme row (Auto first), Animal themes, Colourblind & accessibility. */
export const SKIN_ORDER: Skin[] = [
  "auto",
  "crested",
  "dark",
  "light",
  "eyecomfort",
  "eyecomfort-light",
  "penguin",
  "turtle",
  "elephant",
  "deuteranopia",
  "protanopia",
  "tritanopia",
  "highcontrast",
];

export const CONCRETE_SKINS = SKIN_ORDER.filter((id): id is ConcreteSkin => id !== "auto");

export const DEFAULT_SKIN: Skin = "crested";
export const DEFAULT_AUTO_LIGHT: ConcreteSkin = "light";
export const DEFAULT_AUTO_DARK: ConcreteSkin = "crested";

/** The theme whose colours show right now. `prefersDark` is Windows' light/dark choice. */
export function resolveSkin(skin: Skin, autoLight: ConcreteSkin, autoDark: ConcreteSkin, prefersDark: boolean): ConcreteSkin {
  if (skin !== "auto") return skin;
  return prefersDark ? autoDark : autoLight;
}

/** Puts a theme's colours on the page: `data-skin`, the `dark` class and native control colours. */
export function applySkinToDocument(skin: ConcreteSkin, root: HTMLElement = document.documentElement): void {
  const light = THEMES[skin].surface === "light";
  root.dataset.skin = skin;
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Windows' light/dark choice as the webview reports it. Dark when unknown. */
export function prefersDarkNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  const query = window.matchMedia(DARK_QUERY);
  // A browser that reports neither treats "no preference" as light; ZooChattr's default is dark.
  return query.matches || !window.matchMedia("(prefers-color-scheme: light)").matches;
}

/** Calls `onChange` when Windows switches light/dark. Returns the unsubscribe function. */
export function watchColorScheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
