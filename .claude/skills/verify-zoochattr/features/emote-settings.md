# Emote sources and status

Twitch emotes always show. 7TV, BetterTTV, and FrankerFaceZ can be switched off. Size is 1×, 1.5×, or 2×. Moving emotes play always, only on hover, or never. Overlay emotes, the hover preview, the emote menu, and "Remember emotes" have their own switches. Blocked names stay plain text. The last 20 provider failures are listed under Emote problems. Right-click a channel and choose "Emote status…" for that channel's counts.

## Sub-features

- `emote-size` changes the size choice and saves it.
- `emote-motion` changes Always / On hover / Never.
- `emote-source` turns 7TV off so those names render as words.
- `emote-status` opens the per-channel status popover.
- `emote-problems` lists a failed download when one happens.

## How to get to it (user POV)

- Gear → Emotes.
- Or right-click a joined channel → Emote status….
- Provider failures also put a warning on the pane header.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor, `geckotown` joined so emote sets have a channel to load.
- Do not force a provider error through the mock's fail route. If the mock is healthy, Emote problems stays empty. Report that emptiness; do not manufacture a failure.

- **Open Emotes.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid settings-gear` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Emotes"`. The navigation is "Settings sections". The size group is the radiogroup "Emote size".
- **Size.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role radio --name "2×"`. If more than one "2×" exists, Settings search has duplicated a row; clear the search box first. `side-effect` shows `"emoteSize": 2`.
- **Motion.** In the radiogroup "Moving emotes", choose "On hover". `side-effect` shows `"emoteAnimation": "hover"`.
- **Close.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Close settings"`.
- **Status.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --attr data-drag-channel=geckotown --button right` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role menuitem --name "Emote status"`. The popover `data-testid=strip-emote-status` names 7TV, BetterTTV, and FrankerFaceZ with a count or "loading…". Screenshot `--out emotes/status.png`.

## Gotchas

- "2×" search in Settings normalizes the multiply sign, so searching `2x` still finds the row. That is search, not the size change. Change the radio, then read `settings.json`.
- Remember emotes caches lists in the webview (`localStorage` inside the webview profile under the data dir). Turning it off does not delete `settings.json`.
- A pane-header warning means a provider failed for that channel. On a healthy mock there is no warning. Do not treat a missing warning as a skipped check of the failure list.
