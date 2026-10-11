export type Skin = "crested" | "penguin" | "turtle" | "elephant";
export type Animal = "gecko" | "penguin" | "turtle" | "elephant";

export interface Theme {
  id: Skin;
  name: string;
  blurb: string;
  animal: Animal;
  /** Under the ZooChattr wordmark. */
  tagline: string;
  /** Loading screen. */
  waking: string;
  /** Send button and composer placeholder ("Chirp to #channel"). */
  sendVerb: string;
  /** Headline of the lost-connection banner. */
  dropped: string;
}

export const THEMES: Record<Skin, Theme> = {
  crested: {
    id: "crested",
    name: "Crested gecko",
    blurb: "Warm tangerine with cream crests.",
    animal: "gecko",
    tagline: "Stick to every chat at once",
    waking: "Waking up the gecko…",
    sendVerb: "Chirp",
    dropped: "Dropped the connection like a tail.",
  },
  penguin: {
    id: "penguin",
    name: "Penguin",
    blurb: "Arctic blues with a bright orange beak.",
    animal: "penguin",
    tagline: "Huddle every chat together",
    waking: "Waddling in…",
    sendVerb: "Squawk",
    dropped: "Slipped on the ice and lost the connection.",
  },
  turtle: {
    id: "turtle",
    name: "Sea turtle",
    blurb: "Deep-sea teal with a sandy shell.",
    animal: "turtle",
    tagline: "Slow down and read every chat",
    waking: "Paddling up…",
    sendVerb: "Bloop",
    dropped: "Ducked into the shell and lost the connection.",
  },
  elephant: {
    id: "elephant",
    name: "Elephant",
    blurb: "Savanna grey with soft lilac.",
    animal: "elephant",
    tagline: "Never forget a chat",
    waking: "Remembering your channels…",
    sendVerb: "Trumpet",
    dropped: "Lost the connection for a moment.",
  },
};

export const SKIN_ORDER: Skin[] = ["crested", "penguin", "turtle", "elephant"];
export const DEFAULT_SKIN: Skin = "crested";
