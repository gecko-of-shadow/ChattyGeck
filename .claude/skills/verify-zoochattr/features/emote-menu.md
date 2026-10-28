# Emote menu

The smiley button next to Send opens a grid of emotes. Tabs are favourites, Recent, Channel, Global, BTTV, and 7TV. A search box filters them. Right-click an emote to favourite it. The footer names the emote under the pointer.

## Sub-features

- `picker-open` opens from the smiley button.
- `picker-search` filters by the emote name.
- `picker-tabs` switches group.
- `picker-favourite` stores the emote as a favourite in settings.

## How to get to it (user POV)

- Log in, focus a joined channel, and unlock the message box if it asks you to confirm the channel.
- Choose the smiley button ("Emote menu") beside Send.
- Type in "Search emotes", or choose a tab.
- Right-click an emote to favourite it. Click an emote to insert it in the box.

## Driving it with verify-zoochattr

Preconditions:

- Desktop window, `geckotown` joined, mock login done ([twitch-login.md](./twitch-login.md)), message box visible for `#geckotown`.
- The mock serves small 7TV, BTTV, and FFZ sets, including `Kappa` and `geckoWave`. Pictures are served by the mock, not the public CDNs.

- **Open.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid emote-picker-button`. Wait for test id `emote-picker` and the textbox "Search emotes". Screenshot `--out emotes/menu.png`.
- **Search.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Search emotes" --value Kappa`. An emote button whose name contains `Kappa` is shown.
- **Insert.** Click that emote button. The message box contains `Kappa` and the line has not been sent (the log does not gain a new `Kappa` line from you). Screenshot `--out emotes/inserted.png`.
- **Favourite.** Open the menu again, right-click the Kappa emote (`--button right`). `side-effect` shows `favoriteEmotes` with one `provider:id` entry. The favourites tab lists it.

## Gotchas

- The smiley button is absent while logged out, in read only, or when the emote menu is switched off.
- "Emote menu" is also a settings row. If two matches are reported, Settings is open. Close it and use `--testid emote-picker-button`.
- Right-click favourites. A left click inserts the name instead.
- Global and channel sets load in the background. If the grid is empty, wait and reopen; do not call the emote APIs yourself. If a provider failed, the pane header shows a warning and [emote-settings.md](./emote-settings.md) lists it under Emote problems.
