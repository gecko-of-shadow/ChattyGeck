# Appearance

Settings → Appearance picks the theme, text size, timestamps, 24-hour clock, badges, and striped rows. Themes are Auto, Crested gecko (the default), Dark, Light, Eye comfort, Paper, Penguin, Sea turtle, Elephant, Deuteranopia, Protanopia, Tritanopia, and High contrast. Animal themes rename the Send button.

## Sub-features

- `theme-pick` applies a theme card and saves `skin`.
- `theme-animal` changes Send to Squawk, Bloop, or Trumpet.
- `theme-auto` picks the light and dark themes used when Windows changes mode.
- `text-size` changes the chat text size from 10 to 40.

## How to get to it (user POV)

- Choose the gear, then "Appearance" in the Settings list.
- Choose a theme card. The card's name and tag are its accessible name, such as "Dark: Neutral grey" or "Penguin: Arctic night".
- Auto has two dropdowns: "Auto theme while Windows is light" and "Auto theme while Windows is dark".

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor. A channel is optional. Login is not required.
- Close any open menu so the theme button is the only match.

- **Open.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid settings-gear` and `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Appearance"`. The button "Crested gecko: Default" is pressed.
- **Dark.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Dark: Neutral grey"`. Screenshot `--out appearance/dark.png`. `side-effect` shows `"skin": "dark"`.
- **Penguin.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Penguin: Arctic night"`. Close Settings. If you are logged in and the message box is open, the send button's accessible name is "Squawk". `side-effect` shows `"skin": "penguin"`.
- **Text size.** Reopen Appearance. The radiogroup "Text size presets" has Small, Medium, Large, and Huge. Choose Huge. The number field "Text size in pixels" shows a value above the default 13.5. `side-effect` shows that `textSize`.

## Gotchas

- Theme buttons use `aria-pressed`, not a radio role. Match the button name `Name: Tag`.
- Auto does not set `skin` to a concrete theme by itself. `skin` stays `"auto"` and the two dropdowns are `autoLightSkin` and `autoDarkSkin`. On Linux the window does not follow a Windows light/dark change. Record that the live switch was not observed.
- High contrast and the colorblind themes must keep body text readable. A screenshot of unreadable text fails the journey.
- The boot screen already paints a theme before settings load. Judge the theme after the heading or the chat is up, not during "Loading your chats…".
