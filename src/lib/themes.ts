export type Skin =
  | "crested"
  | "penguin"
  | "turtle"
  | "elephant"
  | "dark"
  | "light"
  | "deuteranopia"
  | "protanopia"
  | "tritanopia"
  | "eyecomfort";

export type Animal = "gecko" | "penguin" | "turtle" | "elephant";

export interface Theme {
  id: Skin;
  name: string;
  blurb: string;
  /** Animal skins draw a mascot; appearance themes use a colour swatch in Settings. */
  kind: "animal" | "appearance";
  /** Sidebar / composer mascot. Appearance themes reuse the gecko, recoloured by CSS. */
  animal: Animal;
  /** Under the ZooChattr wordmark. */
  tagline: string;
  /** Loading screen. */
  waking: string;
  /** Send button and composer placeholder ("Chirp to #channel"). */
  sendVerb: string;
  /** Headline of the lost-connection banner. */
  dropped: string;
  /** Sonner / form controls: light surfaces need a light toast theme. */
  surface: "dark" | "light";
}

export const THEMES: Record<Skin, Theme> = {
  crested: {
    id: "crested",
    name: "Crested gecko",
    blurb: "Warm tangerine with cream crests.",
    kind: "animal",
    animal: "gecko",
    tagline: "Stick to every chat at once",
    waking: "Waking up the gecko…",
    sendVerb: "Chirp",
    dropped: "Dropped the connection like a tail.",
    surface: "dark",
  },
  penguin: {
    id: "penguin",
    name: "Penguin",
    blurb: "Arctic blues with a bright orange beak.",
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
    blurb: "Deep-sea teal with a sandy shell.",
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
    blurb: "Savanna grey with soft lilac.",
    kind: "animal",
    animal: "elephant",
    tagline: "Never forget a chat",
    waking: "Remembering your channels…",
    sendVerb: "Trumpet",
    dropped: "Lost the connection for a moment.",
    surface: "dark",
  },
  dark: {
    id: "dark",
    name: "Dark",
    blurb: "Neutral dark surfaces with a cool accent.",
    kind: "appearance",
    animal: "gecko",
    tagline: "Chat after dark",
    waking: "Dimming the lights…",
    sendVerb: "Send",
    dropped: "Lost the connection.",
    surface: "dark",
  },
  light: {
    id: "light",
    name: "Light",
    blurb: "Light background with dark text.",
    kind: "appearance",
    animal: "gecko",
    tagline: "Bright and clear",
    waking: "Opening the blinds…",
    sendVerb: "Send",
    dropped: "Lost the connection.",
    surface: "light",
  },
  deuteranopia: {
    id: "deuteranopia",
    name: "Deuteranopia",
    blurb: "Blue and orange cues — not red versus green alone.",
    kind: "appearance",
    animal: "gecko",
    tagline: "Mentions stay obvious",
    waking: "Tuning the palette…",
    sendVerb: "Send",
    dropped: "Lost the connection.",
    surface: "dark",
  },
  protanopia: {
    id: "protanopia",
    name: "Protanopia",
    blurb: "Sky blue and amber, with weight on mentions.",
    kind: "appearance",
    animal: "gecko",
    tagline: "Built for red-weak vision",
    waking: "Tuning the palette…",
    sendVerb: "Send",
    dropped: "Lost the connection.",
    surface: "dark",
  },
  tritanopia: {
    id: "tritanopia",
    name: "Tritanopia",
    blurb: "Magenta and teal — not blue versus yellow alone.",
    kind: "appearance",
    animal: "gecko",
    tagline: "Built for blue-weak vision",
    waking: "Tuning the palette…",
    sendVerb: "Send",
    dropped: "Lost the connection.",
    surface: "dark",
  },
  eyecomfort: {
    id: "eyecomfort",
    name: "Eye comfort",
    blurb: "Warm, softer contrast with less blue light.",
    kind: "appearance",
    animal: "gecko",
    tagline: "Easier on long sessions",
    waking: "Warming the lamps…",
    sendVerb: "Send",
    dropped: "Lost the connection.",
    surface: "dark",
  },
};

/** Animals first, then appearance — matches the Settings picker order. */
export const SKIN_ORDER: Skin[] = [
  "crested",
  "penguin",
  "turtle",
  "elephant",
  "dark",
  "light",
  "deuteranopia",
  "protanopia",
  "tritanopia",
  "eyecomfort",
];

export const DEFAULT_SKIN: Skin = "crested";
